import Dexie, { type EntityTable } from 'dexie';

// Rows use docs/schema.sql column names so the outbox (#9) can upload them as they are.
// They have no owner_id until sign-in makes the account their Owner.

export interface AthleteRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface GameRow {
  id: string;
  athlete_id: string;
  sport: 'basketball' | 'softball' | 'baseball';
  period_format: 'halves' | 'quarters' | 'innings';
  opponent_name: string;
  game_date: string;
  created_at: string;
  updated_at: string;
}

export const TILE_EVENT_TYPES = ['reb_off', 'reb_def', 'assist', 'steal', 'block', 'turnover', 'foul'] as const;
export type TileEventType = (typeof TILE_EVENT_TYPES)[number];

export interface EventRow {
  id: string;
  game_id: string;
  seq: number;
  client_ts: string;
  period: number;
  type: TileEventType;
}

/** The phone's local store: one Dexie (IndexedDB) database. */
export type Store = Dexie & {
  athletes: EntityTable<AthleteRow, 'id'>;
  games: EntityTable<GameRow, 'id'>;
  events: EntityTable<EventRow, 'id'>;
};

export function openStore(name = 'stat-elite'): Store {
  const db = new Dexie(name) as Store;
  db.version(1).stores({
    athletes: 'id, created_at',
    games: 'id, athlete_id',
    events: 'id, &[game_id+seq]',
  });
  return db;
}
