import { TILE_STATS, type EventRow, type GameRow, type Store, type TileStat } from './store';

export type { TileStat };

/** The backend App Core syncs with. Empty until the outbox (#9) gives it upload and download. */
export interface Server {}

type GameFormat =
  | { sport: 'basketball'; periodFormat: 'halves' | 'quarters' }
  | { sport: 'softball' | 'baseball'; periodFormat: 'innings' };

export interface Home {
  athlete?: { id: string; name: string };
  liveGameId?: string;
}

export interface LiveGame {
  id: string;
  sport: GameRow['sport'];
  tiles: Record<TileStat, number>;
}

export function createAppCore({ clock, store }: { clock: () => Date; store: Store; server: Server }) {
  const now = () => clock().toISOString();
  // a Game's Events in seq order
  const gameEvents = (gameId: string) => store.events.where('[game_id+seq]').between([gameId, 0], [gameId, Infinity]);

  return {
    async addAthlete({ name }: { name: string }): Promise<string> {
      const id = crypto.randomUUID();
      await store.athletes.add({ id, name, created_at: now(), updated_at: now() });
      return id;
    },

    async startGame({ athleteId, sport, periodFormat }: { athleteId: string } & GameFormat): Promise<string> {
      const id = crypto.randomUUID();
      const date = clock();
      await store.games.add({
        id,
        athlete_id: athleteId,
        sport,
        period_format: periodFormat,
        opponent_name: 'Opponent',
        // the phone's local date, not UTC
        game_date: new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10),
        created_at: date.toISOString(),
        updated_at: date.toISOString(),
      });
      return id;
    },

    /** Writes the Event to the store before resolving (ADR 0001). */
    recordStat(gameId: string, stat: TileStat): Promise<EventRow> {
      // One rw transaction at a time per store, so taps in quick succession still get distinct seqs.
      return store.transaction('rw', store.events, async () => {
        const last = await gameEvents(gameId).last();
        const event: EventRow = {
          id: crypto.randomUUID(),
          game_id: gameId,
          seq: (last?.seq ?? 0) + 1,
          client_ts: now(),
          // shortcut: every Event is in Period 1 until Next period exists (#18)
          period: 1,
          type: stat,
        };
        await store.events.add(event);
        return event;
      });
    },

    async home(): Promise<Home> {
      // shortcut: Home shows the first Athlete added, until the Athlete switcher exists (#6)
      const athlete = await store.athletes.orderBy('created_at').first();
      if (!athlete) return {};
      // shortcut: the Athlete's latest Game is the one in progress, until End Game exists (#7)
      const games = await store.games.where('athlete_id').equals(athlete.id).sortBy('created_at');
      return { athlete: { id: athlete.id, name: athlete.name }, liveGameId: games.at(-1)?.id };
    },

    async liveGame(gameId: string): Promise<LiveGame | undefined> {
      const game = await store.games.get(gameId);
      if (!game) return undefined;
      const tiles = Object.fromEntries(TILE_STATS.map((stat) => [stat, 0])) as Record<TileStat, number>;
      for (const event of await gameEvents(gameId).toArray()) {
        tiles[event.type]++;
      }
      return { id: game.id, sport: game.sport, tiles };
    },
  };
}

export type AppCore = ReturnType<typeof createAppCore>;
