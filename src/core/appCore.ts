import type { Table } from 'dexie';
import { TILE_EVENT_TYPES, type EventRow, type GameRow, type OutboxRow, type Store, type TileEventType } from './store';
import type { Server, SyncedTable, UploadRow } from './server';

export type { TileEventType };

export type GameFormat =
  | { sport: 'basketball'; periodFormat: 'halves' | 'quarters' }
  | { sport: 'softball' | 'baseball'; periodFormat: 'innings' };

/** What Game setup opens with: the Athlete's last Game's sport and Opponent, and today's date. */
export interface GameSetup {
  sport: GameFormat['sport'];
  /** Basketball's period format; softball and baseball are always innings. */
  basketballPeriods: 'halves' | 'quarters';
  opponentName: string;
  gameDate: string;
}

/** A Score Snapshot's Team and Opponent scores. */
export interface Scores {
  team: number;
  opponent: number;
}

export interface Home {
  athlete?: { id: string; name: string; jerseyNumber: string | null; photo?: Blob };
  /** The Athlete a tap on the photo switches to; present only when there is more than one. */
  next?: { id: string; name: string };
  liveGameId?: string;
}

const SELECTED_ATHLETE = 'selectedAthleteId';

/** Every Event type Undo can retract: all but a Retraction itself. */
export type UndoableType = Exclude<EventRow['type'], 'retraction'>;

export interface LiveGame {
  id: string;
  sport: GameRow['sport'];
  tiles: Record<TileEventType, number>;
  /** The latest Score Snapshot not retracted; 0–0 before the first one. */
  score: Scores;
  /** The Final Score, once End Game has closed the Game. */
  final?: Scores;
  /** The Event the next Undo retracts: the newest one not already retracted. */
  undoable?: { id: string; type: UndoableType };
}

/** IDs of the Events that a Retraction in this list undoes. */
const retractedIds = (events: EventRow[]) => new Set(events.flatMap((e) => (e.retracts_id ? [e.retracts_id] : [])));

const snapshotOf = (event: EventRow): Scores | undefined =>
  event.team_score !== null && event.opponent_score !== null
    ? { team: event.team_score, opponent: event.opponent_score }
    : undefined;

/** A Score Snapshot takes whole, non-negative scores. */
const isScore = (n: number) => Number.isInteger(n) && n >= 0;

const isTile = (type: EventRow['type']): type is TileEventType =>
  (TILE_EVENT_TYPES as readonly string[]).includes(type);

/** The phone's local calendar date, not UTC, as YYYY-MM-DD. */
const localDate = (date: Date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export function createAppCore({ clock, store, server }: { clock: () => Date; store: Store; server: Server }) {
  const now = () => clock().toISOString();
  // a Game's Events in seq order
  const gameEvents = (gameId: string) => store.events.where('[game_id+seq]').between([gameId, 0], [gameId, Infinity]);
  // the latest Score Snapshot not retracted, or 0–0 before the first one
  const latestScores = (events: EventRow[]): Scores => {
    const retracted = retractedIds(events);
    let scores: Scores = { team: 0, opponent: 0 };
    for (const event of events) {
      const snapshot = snapshotOf(event);
      if (snapshot && !retracted.has(event.id)) scores = snapshot;
    }
    return scores;
  };
  // the next Event in a Game, appended to its log
  const nextEvent = async (
    gameId: string,
    fields: Pick<EventRow, 'type' | 'retracts_id'> & Partial<Pick<EventRow, 'team_score' | 'opponent_score'>>,
  ): Promise<EventRow> => {
    const last = await gameEvents(gameId).last();
    // End Game is always the last Event of a Game, so nothing is appended after it
    if (last?.type === 'game_end') throw new Error('This Game has ended');
    return {
      id: crypto.randomUUID(),
      game_id: gameId,
      seq: (last?.seq ?? 0) + 1,
      client_ts: now(),
      // shortcut: every Event is in Period 1 until Next period exists (#18)
      period: 1,
      team_score: null,
      opponent_score: null,
      ...fields,
    };
  };

  // Every write queues its row for upload in the same transaction (ADR 0001), then tries to upload.
  const write = async <T>(tables: Table[], scope: () => Promise<T>): Promise<T> => {
    const result = await store.transaction('rw', [...tables, store.outbox], scope);
    void flush();
    return result;
  };
  const queue = (table: SyncedTable, id: string) => store.outbox.add({ table, id });

  // the row an outbox entry names, as it is now
  const rowOf = ({ table, id }: OutboxRow): Promise<UploadRow | undefined> =>
    table === 'athletes' ? store.athletes.get(id) : table === 'games' ? store.games.get(id) : store.events.get(id);

  // the Athlete a row belongs to: a Game's, or an Event's through its Game
  const athleteIdOf = async ({ table, id }: OutboxRow): Promise<string | undefined> => {
    if (table === 'athletes') return id;
    if (table === 'games') return (await store.games.get(id))?.athlete_id;
    const event = await store.events.get(id);
    return event && (await store.games.get(event.game_id))?.athlete_id;
  };

  // Uploads in sequence order, each row as it is now. A row the server cannot take stays queued, and so do the rows behind it.
  // shortcut: a row the server refuses holds up every row behind it until someone fixes it, upgrade when a refusal needs its own state
  const drain = async () => {
    const owner = await server.session();
    if (!owner) return;
    // signing in makes the account the Owner of the phone's Athletes
    await store.athletes
      .toCollection()
      .filter((a) => a.owner_id === undefined)
      .modify({ owner_id: owner });
    for (const entry of await store.outbox.orderBy('seq').toArray()) {
      const row = await rowOf(entry);
      if (!row) {
        await store.outbox.delete(entry.seq!);
        continue;
      }
      const athlete = await store.athletes.get((await athleteIdOf(entry)) ?? '');
      try {
        await server.upload(entry.table, { ...row, owner_id: athlete?.owner_id });
      } catch {
        return;
      }
      await store.outbox.delete(entry.seq!);
    }
  };
  // one drain at a time, each starting after the one before it has finished
  let draining: Promise<void> = Promise.resolve();
  const flush = (): Promise<void> => (draining = draining.then(drain).catch(console.error));

  return {
    async addAthlete({ name, jerseyNumber, photo }: { name: string; jerseyNumber?: string; photo?: Blob }): Promise<string> {
      const id = crypto.randomUUID();
      const ts = now();
      await write([store.athletes, store.athletePhotos], async () => {
        await store.athletes.add({ id, name, jersey_number: jerseyNumber?.trim() || null, created_at: ts, updated_at: ts });
        await queue('athletes', id);
        if (photo) await store.athletePhotos.add({ athlete_id: id, photo });
      });
      return id;
    },

    async editAthlete({ id, name, jerseyNumber }: { id: string; name: string; jerseyNumber: string }): Promise<void> {
      await write([store.athletes], async () => {
        await store.athletes.update(id, { name, jersey_number: jerseyNumber.trim() || null, updated_at: now() });
        await queue('athletes', id);
      });
    },

    async startGame({
      athleteId,
      opponentName,
      gameDate,
      sport,
      periodFormat,
    }: { athleteId: string; opponentName: string; gameDate: string } & GameFormat): Promise<string> {
      const opponent = opponentName.trim();
      if (!opponent || !/^\d{4}-\d{2}-\d{2}$/.test(gameDate)) throw new Error('A Game needs an Opponent and a date');
      const id = crypto.randomUUID();
      const date = clock();
      await write([store.games], async () => {
        await store.games.add({
          id,
          athlete_id: athleteId,
          sport,
          period_format: periodFormat,
          opponent_name: opponent,
          game_date: gameDate,
          created_at: date.toISOString(),
          updated_at: date.toISOString(),
        });
        await queue('games', id);
      });
      return id;
    },

    /** Writes the Event to the store before resolving (ADR 0001). */
    recordTile(gameId: string, type: TileEventType): Promise<EventRow> {
      // One rw transaction at a time per store, so taps in quick succession still get distinct seqs.
      return write([store.events], async () => {
        const event = await nextEvent(gameId, { type, retracts_id: null });
        await store.events.add(event);
        await queue('events', event.id);
        return event;
      });
    },

    /** Moves one side of the strip one point and records the new absolute scores as a Score Snapshot (ADR 0002). */
    adjustScore(gameId: string, side: 'team' | 'opponent', delta: 1 | -1): Promise<EventRow | undefined> {
      return write([store.events], async () => {
        const scores = latestScores(await gameEvents(gameId).toArray());
        const team = scores.team + (side === 'team' ? delta : 0);
        const opponent = scores.opponent + (side === 'opponent' ? delta : 0);
        if (!isScore(team) || !isScore(opponent)) return undefined;
        const event = await nextEvent(gameId, { type: 'score', retracts_id: null, team_score: team, opponent_score: opponent });
        await store.events.add(event);
        await queue('events', event.id);
        return event;
      });
    },

    /** End Game: the Final Score, recorded as a game_end Event, closes the Game. Refused without whole scores. */
    async endGame(gameId: string, final: { teamScore: number; opponentScore: number }): Promise<EventRow> {
      if (!isScore(final.teamScore) || !isScore(final.opponentScore)) throw new Error('End Game needs a Final Score');
      return write([store.events], async () => {
        const event = await nextEvent(gameId, {
          type: 'game_end',
          retracts_id: null,
          team_score: final.teamScore,
          opponent_score: final.opponentScore,
        });
        await store.events.add(event);
        await queue('events', event.id);
        return event;
      });
    },

    /** Appends a Retraction for the newest Event not yet retracted; no Event is changed. */
    undo(gameId: string): Promise<EventRow | undefined> {
      return write([store.events], async () => {
        const events = await gameEvents(gameId).toArray();
        const retracted = retractedIds(events);
        let target: EventRow | undefined;
        for (const event of events) {
          if (event.type !== 'retraction' && !retracted.has(event.id)) target = event;
        }
        if (!target) return undefined;
        const retraction = await nextEvent(gameId, { type: 'retraction', retracts_id: target.id });
        await store.events.add(retraction);
        await queue('events', retraction.id);
        return retraction;
      });
    },

    /** Game setup's prefilled fields: the newest Game's sport, period format and Opponent, and today's date. */
    async gameSetup(athleteId: string): Promise<GameSetup> {
      const last = (await store.games.where('athlete_id').equals(athleteId).sortBy('created_at')).at(-1);
      return {
        sport: last?.sport ?? 'basketball',
        basketballPeriods: last?.sport === 'basketball' && last.period_format === 'halves' ? 'halves' : 'quarters',
        opponentName: last?.opponent_name ?? 'Opponent',
        gameDate: localDate(clock()),
      };
    },

    async switchAthlete(athleteId: string): Promise<void> {
      await store.settings.put({ key: SELECTED_ATHLETE, value: athleteId });
    },

    async home(): Promise<Home> {
      const athletes = await store.athletes.orderBy('created_at').toArray();
      if (athletes.length === 0) return {};
      // falls back to the first Athlete added when nothing is chosen yet
      const selectedId = (await store.settings.get(SELECTED_ATHLETE))?.value;
      const index = Math.max(0, athletes.findIndex((a) => a.id === selectedId));
      const athlete = athletes[index];
      const photo = await store.athletePhotos.get(athlete.id);
      const next = athletes[(index + 1) % athletes.length];
      // the newest Game that End Game has not closed is the one in progress
      const games = await store.games.where('athlete_id').equals(athlete.id).sortBy('created_at');
      let liveGameId: string | undefined;
      for (const game of [...games].reverse()) {
        if ((await gameEvents(game.id).last())?.type !== 'game_end') {
          liveGameId = game.id;
          break;
        }
      }
      return {
        athlete: { id: athlete.id, name: athlete.name, jerseyNumber: athlete.jersey_number, photo: photo?.photo },
        next: athletes.length > 1 ? { id: next.id, name: next.name } : undefined,
        liveGameId,
      };
    },

    async liveGame(gameId: string): Promise<LiveGame | undefined> {
      const game = await store.games.get(gameId);
      if (!game) return undefined;
      const events = await gameEvents(gameId).toArray();
      const retracted = retractedIds(events);
      const tiles = Object.fromEntries(TILE_EVENT_TYPES.map((type) => [type, 0])) as Record<TileEventType, number>;
      let undoable: LiveGame['undoable'];
      for (const event of events) {
        if (event.type === 'retraction' || retracted.has(event.id)) continue;
        if (isTile(event.type)) tiles[event.type]++;
        undoable = { id: event.id, type: event.type };
      }
      // End Game is always the last Event, so a finished Game ends on its game_end
      const last = events.at(-1);
      return {
        id: game.id,
        sport: game.sport,
        tiles,
        score: latestScores(events),
        final: last?.type === 'game_end' ? snapshotOf(last) : undefined,
        undoable,
      };
    },

    /** Signs the Recorder in with a magic link, then uploads everything recorded so far. */
    async signIn(email: string): Promise<void> {
      await server.signIn(email);
      await flush();
    },

    /** The "N not synced" badge: whether the Recorder is signed in, and how many rows still live only on the phone. */
    async sync(): Promise<{ signedIn: boolean; notSynced: number }> {
      const pending = await store.outbox.toArray();
      return {
        signedIn: (await server.session()) !== undefined,
        notSynced: new Set(pending.map(({ table, id }) => `${table}:${id}`)).size,
      };
    },

    /** Uploads whatever is queued. Called on launch, on reconnect, and after every write. */
    flush,
  };
}

export type AppCore = ReturnType<typeof createAppCore>;
