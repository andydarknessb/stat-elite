import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AthleteRow, EventRow, GameRow } from './store';

/** The tables the outbox uploads: an Athlete before its Game, a Game before its Events (ADR 0001). */
export type SyncedTable = 'athletes' | 'games' | 'events';

/** A row of each synced table as the server returns it. */
export type SyncedRow = { athletes: AthleteRow; games: GameRow; events: EventRow };

/** A row as the outbox uploads it. `updated_at` is set on Athletes and Games, where the latest edit wins. */
export type UploadRow = { id: string; owner_id?: string; updated_at?: string };

/** The backend App Core syncs with: Supabase in a configured build, the in-memory stand-in on localhost. */
export interface Server {
  /** The signed-in account's id, or undefined when signed out. */
  session(): Promise<string | undefined>;
  /** Sends a magic link to the address. Rejects when the server cannot be reached. */
  signIn(email: string): Promise<void>;
  /** Writes one row. Rejects when the server cannot be reached or refuses the row; the outbox keeps it. */
  upload(table: SyncedTable, row: UploadRow): Promise<void>;
  /** Every row of one table the signed-in account can see. Rejects when the server cannot be reached. */
  download<T extends SyncedTable>(table: T): Promise<SyncedRow[T][]>;
}

/** The in-memory backend for App Core's tests and the local smoke. `rows` holds what landed, `uploads` the order. */
export function createStandInServer(reachable: () => boolean = () => globalThis.navigator?.onLine ?? true) {
  let account: string | undefined;
  const rows: Record<SyncedTable, Map<string, UploadRow>> = { athletes: new Map(), games: new Map(), events: new Map() };
  const uploads: string[] = [];
  const reach = () => {
    if (!reachable()) throw new Error('The server cannot be reached');
  };
  return {
    rows,
    uploads,
    async session() {
      return account;
    },
    // the magic link is opened at once, so the stand-in is signed in as soon as this resolves
    async signIn() {
      reach();
      account ??= crypto.randomUUID();
    },
    async upload(table: SyncedTable, row: UploadRow) {
      reach();
      const copy = rows[table].get(row.id);
      // an Event is never edited, so a repeat changes nothing; an Athlete or Game keeps the newer copy
      if (!copy || (table !== 'events' && (copy.updated_at ?? '') <= (row.updated_at ?? ''))) rows[table].set(row.id, row);
      uploads.push(`${table}:${row.id}`);
    },
    // row-level security, as the server gives it: the account sees only the rows it owns
    async download<T extends SyncedTable>(table: T) {
      reach();
      return [...rows[table].values()].filter((row) => row.owner_id === account) as unknown as SyncedRow[T][];
    },
  };
}

/** Supabase through its client: the server the deployed app syncs with. */
export function createSupabaseServer(client: SupabaseClient): Server {
  return {
    async session() {
      return (await client.auth.getSession()).data.session?.user.id;
    },
    async signIn(email) {
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
      if (error) throw error;
    },
    async upload(table, row) {
      // Events are insert-only: a repeat of one already on the server is ignored (ADR 0001)
      const { error } = await client.from(table).upsert(row, { ignoreDuplicates: true });
      if (error) throw error;
      // an Athlete or Game is replaced only by a copy at least as new: latest edit wins
      if (table !== 'events') {
        const { error: stale } = await client.from(table).update(row).eq('id', row.id).lte('updated_at', row.updated_at);
        if (stale) throw stale;
      }
    },
    async download<T extends SyncedTable>(table: T) {
      const rows: SyncedRow[T][] = [];
      // PostgREST caps a page, so read until an empty one
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client.from(table).select('*').order('id').range(from, from + PAGE - 1);
        if (error) throw error;
        if (data.length === 0) break;
        rows.push(...data);
      }
      return rows.map(phoneRow);
    },
  };
}

const PAGE = 1000;
const TIMESTAMP_COLUMNS = ['created_at', 'updated_at', 'client_ts'];
// Supabase sends timestamps with a +00:00 offset; the phone writes them as ISO time in UTC
const phoneRow = <R>(row: R): R => {
  const copy = { ...row } as Record<string, unknown>;
  for (const column of TIMESTAMP_COLUMNS) {
    if (typeof copy[column] === 'string') copy[column] = new Date(copy[column]).toISOString();
  }
  return copy as R;
};

/**
 * Supabase when the build has its URL and key. Without them only localhost gets the stand-in, so a deployed
 * build refuses to sign in rather than pretend its rows reached a server.
 */
export function serverFor({ url, key, host }: { url?: string; key?: string; host: string }): Server {
  if (url && key) return createSupabaseServer(createClient(url, key));
  if (host === 'localhost') return createStandInServer();
  const refuse = async () => {
    throw new Error('Sign-in is not set up in this build');
  };
  return { session: async () => undefined, signIn: refuse, upload: refuse, download: refuse };
}
