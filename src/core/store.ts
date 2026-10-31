import Dexie, { type EntityTable } from 'dexie';
import type { SyncedTable } from './server';

// Rows use docs/schema.sql column names so the outbox (#9) can upload them as they are.
// They have no owner_id until sign-in makes the account their Owner.

export interface AthleteRow {
  id: string;
  /** The Owner's account: set at sign-in, so a row has none until then. */
  owner_id?: string;
  name: string;
  jersey_number: string | null;
  created_at: string;
  updated_at: string;
}

/** A photo lives in its own table so the Athlete row the outbox uploads never carries it (plan: photos stay on the phone). */
export interface AthletePhotoRow {
  athlete_id: string;
  photo: Blob;
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
  type: TileEventType | 'score' | 'game_end' | 'retraction';
  /** The Event a Retraction cancels; null on every other Event. */
  retracts_id: string | null;
  /** A Score Snapshot's absolute scores, on 'score' and 'game_end' Events; null on every other Event. */
  team_score: number | null;
  opponent_score: number | null;
}

/** A row waiting for upload. It names the row, not a copy: the outbox reads the row as it is when it uploads. */
export interface OutboxRow {
  seq?: number;
  table: SyncedTable;
  id: string;
}

/** The phone's local store: one Dexie (IndexedDB) database. */
export type Store = Dexie & {
  athletes: EntityTable<AthleteRow, 'id'>;
  athletePhotos: EntityTable<AthletePhotoRow, 'athlete_id'>;
  games: EntityTable<GameRow, 'id'>;
  events: EntityTable<EventRow, 'id'>;
  /** Phone-only settings, never uploaded: the Athlete Home shows. */
  settings: EntityTable<{ key: string; value: string }, 'key'>;
  /** Rows not yet uploaded, in the order they were written (ADR 0001). */
  outbox: EntityTable<OutboxRow, 'seq'>;
};

export function openStore(name = 'stat-elite'): Store {
  const db = new Dexie(name) as Store;
  db.version(1).stores({
    athletes: 'id, created_at',
    games: 'id, athlete_id',
    events: 'id, &[game_id+seq]',
  });
  db.version(2).stores({
    athletePhotos: 'athlete_id',
    settings: 'key',
  });
  db.version(3)
    .stores({ outbox: '++seq' })
    // rows recorded before the outbox existed queue now, Athletes first, so the first sign-in uploads them (ADR 0001)
    .upgrade(async (tx) => {
      const athletes = await tx.table('athletes').toArray();
      const games = await tx.table('games').toArray();
      const events = await tx.table('events').orderBy('[game_id+seq]').toArray();
      await tx.table('outbox').bulkAdd([
        ...athletes.map(({ id }) => ({ table: 'athletes', id })),
        ...games.map(({ id }) => ({ table: 'games', id })),
        ...events.map(({ id }) => ({ table: 'events', id })),
      ]);
    });
  return db;
}
