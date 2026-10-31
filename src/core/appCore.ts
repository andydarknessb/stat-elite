import type { Table } from 'dexie';
import {
  TILE_EVENT_TYPES,
  type AthleteRow,
  type EventRow,
  type GameRow,
  type OutboxRow,
  type Store,
  type TileEventType,
} from './store';
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
/** The account whose rows this phone last downloaded: a sign-in clears it, so the next one downloads again. */
const DOWNLOADED_FOR = 'downloadedFor';

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

// The phone keeps its own columns of a downloaded row, whatever more the server sends.
const athleteOf = ({ id, owner_id, name, jersey_number, created_at, updated_at }: AthleteRow): AthleteRow => ({
  id,
  owner_id,
  name,
  jersey_number,
  created_at,
  updated_at,
});
const gameOf = ({
  id,
  athlete_id,
  sport,
  period_format,
  opponent_name,
  game_date,
  created_at,
  updated_at,
}: GameRow): GameRow => ({ id, athlete_id, sport, period_format, opponent_name, game_date, created_at, updated_at });
const eventOf = ({
  id,
  game_id,
  seq,
  client_ts,
  period,
  type,
  retracts_id,
  team_score,
  opponent_score,
}: EventRow): EventRow => ({ id, game_id, seq, client_ts, period, type, retracts_id, team_score, opponent_score });

// the downloaded rows the phone does not hold yet, given what the store already has under their ids
const lacking = <T>(rows: T[], held: (T | undefined)[]): T[] => rows.filter((_, i) => held[i] === undefined);
// latest edit wins (ADR 0001): a downloaded Athlete or Game replaces the phone's copy only when its edit is later
const later = (row: { updated_at: string }, held?: { updated_at: string }) =>
  !held || Date.parse(row.updated_at) > Date.parse(held.updated_at);

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

  // the row an outbox entry names, as it is now, and the id of its Athlete: a Game names its Athlete, an Event its Game
  const loadRow = async ({ table, id }: OutboxRow): Promise<{ row: UploadRow; athleteId?: string } | undefined> => {
    if (table === 'athletes') {
      const athlete = await store.athletes.get(id);
      return athlete && { row: athlete, athleteId: id };
    }
    if (table === 'games') {
      const game = await store.games.get(id);
      return game && { row: game, athleteId: game.athlete_id };
    }
    const event = await store.events.get(id);
    return event && { row: event, athleteId: (await store.games.get(event.game_id))?.athlete_id };
  };

  // Brings the account's rows down: Athletes and Games the phone lacks or holds an older edit of, Events it lacks.
  // Fetched before the transaction, since Dexie cannot span the network. Nothing here is queued for upload.
  // shortcut: every visible Event is fetched on each sign-in, not only the missing ones, fine for one child's Games; upgrade with a per-Game seq cursor when a season's Events get slow to fetch
  const download = async () => {
    const [athletes, games, events] = await Promise.all([
      server.download('athletes'),
      server.download('games'),
      server.download('events'),
    ]);
    await store.transaction('rw', [store.athletes, store.games, store.events], async () => {
      const athleteRows = athletes.map(athleteOf);
      const athleteHeld = await store.athletes.bulkGet(athleteRows.map((r) => r.id));
      await store.athletes.bulkPut(athleteRows.filter((r, i) => later(r, athleteHeld[i])));
      const gameRows = games.map(gameOf);
      const gameHeld = await store.games.bulkGet(gameRows.map((r) => r.id));
      await store.games.bulkPut(gameRows.filter((r, i) => later(r, gameHeld[i])));
      // an Event never changes, so the phone takes only the ones it lacks
      const eventRows = events.map(eventOf);
      await store.events.bulkAdd(lacking(eventRows, await store.events.bulkGet(eventRows.map((r) => r.id))));
    });
  };

  // Uploads in sequence order, each row as it is now. A row the server cannot take stays queued, and so do the rows behind it.
  // shortcut: a row the server refuses holds up every row behind it until someone fixes it, upgrade when a refusal needs its own state
  const drain = async () => {
    const owner = await server.session();
    if (!owner) return;
    // a sign-in downloads before anything uploads, so the server's newer copies land before this phone's older ones go up
    if ((await store.settings.get(DOWNLOADED_FOR))?.value !== owner) {
      try {
        await download();
        await store.settings.put({ key: DOWNLOADED_FOR, value: owner });
      } catch (error) {
        // the marker stays unset, so the next flush tries again; uploads go on, and the server keeps the later edit either way
        console.error(error);
      }
    }
    // signing in makes the account the Owner of the phone's Athletes
    await store.athletes
      .toCollection()
      .filter((a) => a.owner_id === undefined)
      .modify({ owner_id: owner });
    for (const entry of await store.outbox.orderBy('seq').toArray()) {
      const loaded = await loadRow(entry);
      if (!loaded) {
        await store.outbox.delete(entry.seq!);
        continue;
      }
      const athlete = await store.athletes.get(loaded.athleteId ?? '');
      try {
        await server.upload(entry.table, { ...loaded.row, owner_id: athlete?.owner_id });
      } catch {
        return;
      }
      await store.outbox.delete(entry.seq!);
    }
  };
  // one drain at a time, each starting after the one before it has finished
  let draining: Promise<void> = Promise.resolve();
  const flush = (): Promise<void> => (draining = draining.then(drain).catch(console.error));

  // a Member's phone reads its Athlete and records nothing on it: only the Owner's (or a signed-out Recorder's) phone writes
  const isOwner = async (athleteId: string) => {
    const owner = (await store.athletes.get(athleteId))?.owner_id;
    return owner === undefined || owner === (await server.session());
  };

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
      // the newest Game that End Game has not closed is the one in progress, and only the Owner's phone records on it
      const games = await store.games.where('athlete_id').equals(athlete.id).sortBy('created_at');
      let liveGameId: string | undefined;
      for (const game of (await isOwner(athlete.id)) ? [...games].reverse() : []) {
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

    /** Signs the Recorder in with a magic link, then uploads everything recorded so far. An Invite's token rides in the link. */
    async signIn(email: string, invite?: string): Promise<void> {
      await server.signIn(email, invite);
      // the account is signing in here, so it downloads again even if this phone has downloaded it before
      await store.settings.delete(DOWNLOADED_FOR);
      await flush();
    },

    /** Makes an Invite to one of the Recorder's Athletes; its token goes out in the share link. */
    createInvite(athleteId: string): Promise<string> {
      return server.createInvite(athleteId);
    },

    /** Whether Invite co-parent is offered: the signed-in account is the Athlete's Owner. */
    async canInvite(athleteId: string): Promise<boolean> {
      const owner = (await store.athletes.get(athleteId))?.owner_id;
      return owner !== undefined && owner === (await server.session());
    },

    isOwner,

    /** Makes the signed-in account a Member of the Invite's Athlete, then brings the Athlete and its Games down (ADR 0004). */
    async acceptInvite(token: string): Promise<void> {
      // cleared first, so a download that fails after the accept is retried by the next flush
      await store.settings.delete(DOWNLOADED_FOR);
      await server.acceptInvite(token);
      await download();
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
