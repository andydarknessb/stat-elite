import { createClient, isAuthRetryableFetchError, type SupabaseClient } from '@supabase/supabase-js';
import type { AthleteRow, EventRow, GameRow } from './store';

/** The tables the outbox uploads: an Athlete before its Game, a Game before its Events (ADR 0001). */
export type SyncedTable = 'athletes' | 'games' | 'events';

/** A row of each synced table as the server returns it. */
export type SyncedRow = { athletes: AthleteRow; games: GameRow; events: EventRow };

/** A row as the outbox uploads it. `updated_at` is set on Athletes and Games, where the latest edit wins. */
export type UploadRow = { id: string; owner_id?: string; updated_at?: string; game_id?: string; seq?: number };

/** The stand-in's copy of a row: the Athlete a Game or Event belongs to is what Member access checks. */
type StoredRow = UploadRow & { athlete_id?: string; game_id?: string; recorded_by?: string | null };

/** A Member of an Athlete, when it joined, and the sign-in email it accepted the Invite with (null when none was recorded). */
export type MemberRow = { member_id: string; joined_at: string; email: string | null };

/** Why an Invite cannot be taken: unknown, the Owner's own, used by another account, or past its 7 days (ADR 0004). */
export type InviteReason = 'unknown' | 'own' | 'used' | 'expired';

export class InviteRefused extends Error {
  readonly reason: InviteReason;
  constructor(reason: InviteReason) {
    super(`invite refused: ${reason}`);
    this.reason = reason;
  }
}

/** A sign-in code that cannot be sent yet: the address was sent one too recently. */
export class CodeTooSoon extends Error {
  constructor() {
    super('code too soon');
  }
}

/** A row the server answered with an error code and will not take: a CHECK, a unique key, or row-level security. The phone keeps it queued and says so (Refused Row). */
export class RowRefused extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

// the stand-in's one address whose uploads the server refuses, so a spec can reach the Refused Row notice (#208)
const REFUSED_EMAIL = 'refused@example.com';

/** The backend App Core syncs with: Supabase in a configured build, the in-memory stand-in on localhost. */
export interface Server {
  /** The signed-in account's id, or undefined when signed out. */
  session(): Promise<string | undefined>;
  /** The signed-in account's sign-in address, or undefined when signed out. */
  email(): Promise<string | undefined>;
  /** Whether the server ended this phone's session: none is held, and the server said so rather than failing to be reached (ADR 0007). */
  sessionEnded(): Promise<boolean>;
  /** Sends a 6-digit code to the address. Rejects with a CodeTooSoon when the address was sent one too recently, and when the server cannot be reached. */
  signIn(email: string): Promise<void>;
  /** Signs the account in with the code from the sign-in email. Rejects when the code is wrong or the server cannot be reached. */
  verifyCode(email: string, code: string): Promise<void>;
  /** Writes one row. Rejects with a RowRefused when the server answers that it will not take the row, and otherwise when it cannot be reached; the outbox keeps it either way. */
  upload(table: SyncedTable, row: UploadRow): Promise<void>;
  /** Every row of one table the signed-in account can see. Rejects when the server cannot be reached. */
  download<T extends SyncedTable>(table: T): Promise<SyncedRow[T][]>;
  /** Makes an Invite to one of the account's Athletes and returns its token. Rejects unless the account owns that Athlete. */
  createInvite(athleteId: string): Promise<string>;
  /** Makes the signed-in account a Member of the Invite's Athlete, and resolves to that Athlete's id. Rejects with an InviteRefused when the Invite cannot be taken. */
  acceptInvite(token: string): Promise<string>;
  /** The Members of one Athlete the signed-in account can see: all of them for its Owner, its own membership for a Member. */
  members(athleteId: string): Promise<MemberRow[]>;
  /** Removes a Member from one of the account's Athletes. Rejects unless the account owns that Athlete. */
  removeMember(athleteId: string, memberId: string): Promise<void>;
  /** Removes the signed-in account's membership of an Athlete. */
  leave(athleteId: string): Promise<void>;
  /** Signs this phone out, on this phone only: the account's other sessions stay signed in. Rejects when the server cannot be reached or refuses. */
  signOut(): Promise<void>;
  /** Deletes the signed-in account and everything it owns, then signs the phone out. Rejects when the server cannot be reached or refuses. */
  deleteAccount(): Promise<void>;
}

const DAY = 24 * 60 * 60_000;
const NativePromise = Promise;

/**
 * The in-memory backend for App Core's tests and the local smoke. `rows` holds what landed, `uploads` the order.
 * The top-level object is one phone's session; `phone()` makes another, on the same rows, Invites and Members.
 */
export function createStandInServer(reachable: () => boolean = () => globalThis.navigator?.onLine ?? true) {
  const rows: Record<SyncedTable, Map<string, StoredRow>> = { athletes: new Map(), games: new Map(), events: new Map() };
  const uploads: string[] = [];
  const invites = new Map<string, { athlete_id: string; owner_id: string; expires: number; used_by?: string }>();
  // `${athleteId} ${memberId}` for each Member, with when it joined and the email it accepted with
  const members = new Map<string, { joined_at: string; email: string | null }>();
  // the sign-in address each account signed in with
  const emails = new Map<string, string>();
  const reach = () => {
    if (!reachable()) throw new Error('The server cannot be reached');
  };
  // the Athlete a row belongs to: an Athlete is its own, a Game names it, an Event's Game does
  const athleteOf = (table: SyncedTable, row: StoredRow): string | undefined =>
    table === 'athletes' ? row.id : table === 'games' ? row.athlete_id : rows.games.get(row.game_id ?? '')?.athlete_id;

  const phone = () => {
    let account: string | undefined;
    // row-level security, as the server gives it: the account sees rows it owns and rows of Athletes it is a Member of
    const sees = (table: SyncedTable, row: StoredRow) => {
      const athlete = athleteOf(table, row);
      return row.owner_id === account || (account !== undefined && athlete !== undefined && members.has(`${athlete} ${account}`));
    };
    return {
      async session() {
        // as Supabase's getSession does, this await leaves Dexie's zone: a liveQuery stops observing at a non-Dexie await
        await new NativePromise((resolve) => setTimeout(resolve));
        return account;
      },
      async email() {
        return account === undefined ? undefined : emails.get(account);
      },
      // a page reload on localhost looks like this: no session, with the server reachable
      async sessionEnded() {
        return account === undefined && reachable();
      },
      async signIn(email: string) {
        reach();
        // shortcut: one address stands in for Supabase's send rate limit, so a spec can reach the message; upgrade when a test needs the real limit
        if (email === 'too-soon@example.com') throw new CodeTooSoon();
      },
      // shortcut: any six digits pass and the address is never checked, upgrade when a test needs a real code refused
      async verifyCode(email: string, code: string) {
        reach();
        if (!/^\d{6}$/.test(code)) throw new Error('invalid code');
        // one Account per address, as the server gives it: signing in again finds the Account this address made
        account ??= [...emails].find(([, held]) => held === email)?.[0] ?? crypto.randomUUID();
        emails.set(account, email);
      },
      async upload(table: SyncedTable, row: UploadRow) {
        reach();
        // shortcut: one address stands in for the server refusing every row, so a spec can reach the Refused Row notice; upgrade when a test needs one row refused
        if (account !== undefined && emails.get(account) === REFUSED_EMAIL) throw new RowRefused('stand-in', 'the server refused this row');
        const copy = rows[table].get(row.id);
        // an Event's (game_id, seq) is unique on the server (ADR 0001): a new Event at a taken seq is refused
        if (table === 'events' && !copy && [...rows.events.values()].some((e) => e.game_id === row.game_id && e.seq === row.seq)) {
          throw new RowRefused('23505', 'duplicate key value violates unique constraint "events_game_id_seq_key"');
        }
        // an Event is never edited, so a repeat changes nothing; an Athlete or Game keeps the newer copy
        if (!copy || (table !== 'events' && (copy.updated_at ?? '') <= (row.updated_at ?? ''))) rows[table].set(row.id, row);
        uploads.push(`${table}:${row.id}`);
      },
      async download<T extends SyncedTable>(table: T) {
        reach();
        return [...rows[table].values()].filter((row) => sees(table, row)) as unknown as SyncedRow[T][];
      },
      async createInvite(athleteId: string) {
        reach();
        if (account === undefined || rows.athletes.get(athleteId)?.owner_id !== account) {
          throw new Error('Only the Owner can invite to this Athlete');
        }
        const token = crypto.randomUUID();
        invites.set(token, { athlete_id: athleteId, owner_id: account, expires: Date.now() + 7 * DAY });
        return token;
      },
      async acceptInvite(token: string) {
        reach();
        if (account === undefined) throw new Error('Sign in before accepting an Invite');
        const invite = invites.get(token);
        if (!invite) throw new InviteRefused('unknown');
        if (invite.owner_id === account) throw new InviteRefused('own');
        // the account that accepted it may accept again while it is still a Member: a retry after a failed download
        if (invite.used_by === account && members.has(`${invite.athlete_id} ${account}`)) return invite.athlete_id;
        if (invite.used_by !== undefined) throw new InviteRefused('used');
        if (invite.expires <= Date.now()) throw new InviteRefused('expired');
        members.set(`${invite.athlete_id} ${account}`, { joined_at: new Date().toISOString(), email: emails.get(account) ?? null });
        invite.used_by = account;
        return invite.athlete_id;
      },
      async members(athleteId: string) {
        reach();
        const owner = account !== undefined && rows.athletes.get(athleteId)?.owner_id === account;
        return [...members]
          .filter(([key]) => key.startsWith(`${athleteId} `) && (owner || key === `${athleteId} ${account}`))
          .map(([key, { joined_at, email }]) => ({ member_id: key.slice(athleteId.length + 1), joined_at, email }));
      },
      async removeMember(athleteId: string, memberId: string) {
        reach();
        if (account === undefined || rows.athletes.get(athleteId)?.owner_id !== account) {
          throw new Error('Only the Owner can remove a Member');
        }
        members.delete(`${athleteId} ${memberId}`);
      },
      async leave(athleteId: string) {
        reach();
        members.delete(`${athleteId} ${account}`);
      },
      async signOut() {
        reach();
        account = undefined;
      },
      async deleteAccount() {
        reach();
        if (account === undefined) throw new Error('Sign in before deleting the account');
        // ADR 0004: an Athlete with Members passes, with its Games and Events, to the Member who joined first, and that Member's membership ends
        for (const [athleteId, row] of rows.athletes) {
          const [first] = [...members]
            .filter(([key]) => key.startsWith(`${athleteId} `))
            .sort(([, a], [, b]) => a.joined_at.localeCompare(b.joined_at));
          if (row.owner_id !== account || !first) continue;
          const heir = first[0].slice(athleteId.length + 1);
          row.owner_id = heir;
          // stamped, so the heir's phone takes the new owner at its next download (latest edit wins, ADR 0001)
          row.updated_at = new Date().toISOString();
          for (const table of ['games', 'events'] as const) {
            for (const stored of rows[table].values()) if (athleteOf(table, stored) === athleteId) stored.owner_id = heir;
          }
          members.delete(first[0]);
        }
        // what removing the auth user then cascades to: the account's Athletes still unshared, with their Games and Events, its Invites, and its memberships
        const owned = new Set([...rows.athletes].filter(([, row]) => row.owner_id === account).map(([id]) => id));
        for (const id of owned) rows.athletes.delete(id);
        for (const table of ['games', 'events'] as const) {
          for (const [id, row] of rows[table]) if (row.owner_id === account) rows[table].delete(id);
        }
        // the Games a Member recorded stay with the Athlete; only their link to the deleted Recorder is cleared (ADR 0004)
        for (const row of rows.games.values()) if (row.recorded_by === account) row.recorded_by = null;
        for (const [token, invite] of invites) {
          if (invite.owner_id === account || invite.used_by === account) invites.delete(token);
        }
        for (const key of [...members.keys()]) {
          const [athleteId, memberId] = key.split(' ');
          if (owned.has(athleteId) || memberId === account) members.delete(key);
        }
        emails.delete(account);
        account = undefined;
      },
    };
  };
  return { ...phone(), rows, uploads, invites, phone };
}

/** A failed write as the server answered it: an error with a code is a refusal, but a 401 is an expired or bad token, a sign-in problem, and a failed fetch has no code. */
const rowFailure = (error: { code?: string; message: string }, status?: number) =>
  error.code && status !== 401 ? new RowRefused(error.code, error.message) : error;

/** Supabase through its client: the server the deployed app syncs with. */
export function createSupabaseServer(client: SupabaseClient): Server {
  const session = async () => (await client.auth.getSession()).data.session?.user.id;
  const email = async () => (await client.auth.getSession()).data.session?.user.email;
  const sessionEnded = async () => {
    const { data, error } = await client.auth.getSession();
    // a network failure the library retries is not the server ending the session
    return !data.session && !isAuthRetryableFetchError(error);
  };
  // whether the signed-in account is a Member of the Athlete a row names, not its Owner: its own membership row, which RLS lets it read
  const isMemberOf = async (row: UploadRow) => {
    const me = await session();
    if (me === undefined || row.owner_id === me) return false;
    const { data, error } = await client.from('members').select('member_id').eq('athlete_id', row.id).eq('member_id', me);
    if (error) throw error;
    return data.length > 0;
  };
  return {
    session,
    email,
    sessionEnded,
    async signIn(email) {
      const { error } = await client.auth.signInWithOtp({ email });
      if (error?.code === 'over_email_send_rate_limit') throw new CodeTooSoon();
      if (error) throw error;
    },
    async verifyCode(email, code) {
      const { error } = await client.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw error;
    },
    async upload(table, row) {
      // a Member's edit of an Athlete updates the row the server has: a Member may not insert one (ADR 0004)
      const memberEdit = table === 'athletes' && (await isMemberOf(row));
      if (!memberEdit) {
        // Events are insert-only: a repeat of one already on the server is ignored (ADR 0001)
        const { error, status } = await client.from(table).upsert(row, { ignoreDuplicates: true });
        if (error) throw rowFailure(error, status);
      }
      // an Athlete or Game is replaced only by a copy at least as new: latest edit wins
      if (table !== 'events') {
        const { error: stale, status } = await client.from(table).update(row).eq('id', row.id).lte('updated_at', row.updated_at);
        if (stale) throw rowFailure(stale, status);
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
    async createInvite(athleteId) {
      const { data, error } = await client
        .from('invites')
        .insert({ athlete_id: athleteId, owner_id: await session() })
        .select('token')
        .single();
      if (error) throw error;
      return data.token;
    },
    async acceptInvite(token) {
      const { data, error } = await client.rpc('accept_invite', { invite_token: token });
      if (!error) return data;
      const refusal = /^invite_(unknown|own|used|expired)$/.exec(error.message);
      if (refusal) throw new InviteRefused(refusal[1] as InviteReason);
      throw error;
    },
    async members(athleteId) {
      const { data, error } = await client.from('members').select('member_id, joined_at, email').eq('athlete_id', athleteId);
      if (error) throw error;
      return data;
    },
    async removeMember(athleteId, memberId) {
      const { data, error } = await client
        .from('members')
        .delete()
        .eq('athlete_id', athleteId)
        .eq('member_id', memberId)
        .select('member_id');
      if (error) throw error;
      // RLS keeps the rows the account may not remove, so an empty answer means none was removed
      if (data.length === 0) throw new Error('Only the Owner can remove a Member');
    },
    async leave(athleteId) {
      const { error } = await client.from('members').delete().eq('athlete_id', athleteId).eq('member_id', await session());
      if (error) throw error;
    },
    async signOut() {
      // local scope: the library's default signs out every device the account is signed in on
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
    },
    async deleteAccount() {
      const { error } = await client.rpc('delete_my_account');
      if (error) throw error;
      // the account is gone, so this phone's session must not outlive it; local only, since the server has no user to sign out
      await client.auth.signOut({ scope: 'local' });
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
  return {
    session: async () => undefined,
    email: async () => undefined,
    // nothing is signed in, and nothing can be reached to end it
    sessionEnded: async () => false,
    signIn: refuse,
    verifyCode: refuse,
    upload: refuse,
    download: refuse,
    createInvite: refuse,
    acceptInvite: refuse,
    members: refuse,
    removeMember: refuse,
    leave: refuse,
    signOut: refuse,
    deleteAccount: refuse,
  };
}
