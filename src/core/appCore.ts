import { TILE_EVENT_TYPES, type EventRow, type GameRow, type Store, type TileEventType } from './store';

export type { TileEventType };

/** The backend App Core syncs with. Empty until the outbox (#9) gives it upload and download. */
export interface Server {}

type GameFormat =
  | { sport: 'basketball'; periodFormat: 'halves' | 'quarters' }
  | { sport: 'softball' | 'baseball'; periodFormat: 'innings' };

export interface Home {
  athlete?: { id: string; name: string; jerseyNumber: string | null; photo?: Blob };
  /** The Athlete a tap on the photo switches to; present only when there is more than one. */
  next?: { id: string; name: string };
  liveGameId?: string;
}

const SELECTED_ATHLETE = 'selectedAthleteId';

export interface LiveGame {
  id: string;
  sport: GameRow['sport'];
  tiles: Record<TileEventType, number>;
  /** The Event the next Undo retracts: the newest one not already retracted. */
  undoable?: { id: string; type: TileEventType };
}

/** IDs of the Events that a Retraction in this list undoes. */
const retractedIds = (events: EventRow[]) => new Set(events.flatMap((e) => (e.retracts_id ? [e.retracts_id] : [])));

export function createAppCore({ clock, store }: { clock: () => Date; store: Store; server: Server }) {
  const now = () => clock().toISOString();
  // a Game's Events in seq order
  const gameEvents = (gameId: string) => store.events.where('[game_id+seq]').between([gameId, 0], [gameId, Infinity]);
  // the next Event in a Game, appended to its log
  const nextEvent = async (gameId: string, fields: Pick<EventRow, 'type' | 'retracts_id'>): Promise<EventRow> => {
    const last = await gameEvents(gameId).last();
    return {
      id: crypto.randomUUID(),
      game_id: gameId,
      seq: (last?.seq ?? 0) + 1,
      client_ts: now(),
      // shortcut: every Event is in Period 1 until Next period exists (#18)
      period: 1,
      ...fields,
    };
  };

  return {
    async addAthlete({ name, jerseyNumber, photo }: { name: string; jerseyNumber?: string; photo?: Blob }): Promise<string> {
      const id = crypto.randomUUID();
      const ts = now();
      await store.transaction('rw', store.athletes, store.athletePhotos, async () => {
        await store.athletes.add({ id, name, jersey_number: jerseyNumber?.trim() || null, created_at: ts, updated_at: ts });
        if (photo) await store.athletePhotos.add({ athlete_id: id, photo });
      });
      return id;
    },

    async editAthlete({ id, name, jerseyNumber }: { id: string; name: string; jerseyNumber: string }): Promise<void> {
      await store.athletes.update(id, { name, jersey_number: jerseyNumber.trim() || null, updated_at: now() });
    },

    async startGame({ athleteId, sport, periodFormat }: { athleteId: string } & GameFormat): Promise<string> {
      const id = crypto.randomUUID();
      const date = clock();
      await store.games.add({
        id,
        athlete_id: athleteId,
        sport,
        period_format: periodFormat,
        // shortcut: the schema's default Opponent name, until Game setup asks for it (#14)
        opponent_name: 'Opponent',
        // the phone's local date, not UTC
        game_date: new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10),
        created_at: date.toISOString(),
        updated_at: date.toISOString(),
      });
      return id;
    },

    /** Writes the Event to the store before resolving (ADR 0001). */
    recordTile(gameId: string, type: TileEventType): Promise<EventRow> {
      // One rw transaction at a time per store, so taps in quick succession still get distinct seqs.
      return store.transaction('rw', store.events, async () => {
        const event = await nextEvent(gameId, { type, retracts_id: null });
        await store.events.add(event);
        return event;
      });
    },

    /** Appends a Retraction for the newest Event not yet retracted; no Event is changed. */
    undo(gameId: string): Promise<EventRow | undefined> {
      return store.transaction('rw', store.events, async () => {
        const events = await gameEvents(gameId).toArray();
        const retracted = retractedIds(events);
        let target: EventRow | undefined;
        for (const event of events) {
          if (event.type !== 'retraction' && !retracted.has(event.id)) target = event;
        }
        if (!target) return undefined;
        const retraction = await nextEvent(gameId, { type: 'retraction', retracts_id: target.id });
        await store.events.add(retraction);
        return retraction;
      });
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
      // shortcut: the Athlete's latest Game is the one in progress, until End Game exists (#7)
      const games = await store.games.where('athlete_id').equals(athlete.id).sortBy('created_at');
      return {
        athlete: { id: athlete.id, name: athlete.name, jerseyNumber: athlete.jersey_number, photo: photo?.photo },
        next: athletes.length > 1 ? { id: next.id, name: next.name } : undefined,
        liveGameId: games.at(-1)?.id,
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
        tiles[event.type]++;
        undoable = { id: event.id, type: event.type };
      }
      return { id: game.id, sport: game.sport, tiles, undoable };
    },
  };
}

export type AppCore = ReturnType<typeof createAppCore>;
