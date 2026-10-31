/** The tables the outbox uploads: an Athlete before its Game, a Game before its Events (ADR 0001). */
export type SyncedTable = 'athletes' | 'games' | 'events';

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
  };
}
