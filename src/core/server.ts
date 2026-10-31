import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AthleteRow, EventRow, GameRow } from './store';

/** The tables the outbox uploads: an Athlete before its Game, a Game before its Events (ADR 0001). */
export type SyncedTable = 'athletes' | 'games' | 'events';

/** A row of each synced table as the server returns it. */
export type SyncedRow = { athletes: AthleteRow; games: GameRow; events: EventRow };

/** A row as the outbox uploads it. `updated_at` is set on Athletes and Games, where the latest edit wins. */
export type UploadRow = { id: string; owner_id?: string; updated_at?: string };

/** The stand-in's copy of a row: the Athlete a Game or Event belongs to is what Member access checks. */
type StoredRow = UploadRow & { athlete_id?: string; game_id?: string };

/** A Member of an Athlete and when it joined. */
export type MemberRow = { member_id: string; joined_at: string };

/** Why an Invite cannot be taken: unknown, the Owner's own, used by another account, or past its 7 days (ADR 0004). */
export type InviteReason = 'unknown' | 'own' | 'used' | 'expired';

export class InviteRefused extends Error {
  readonly reason: InviteReason;
  constructor(reason: InviteReason) {
    super(`invite refused: ${reason}`);
    this.reason = reason;
  }
}

/** The backend App Core syncs with: Supabase in a configured build, the in-memory stand-in on localhost. */
export interface Server {
  /** The signed-in account's id, or undefined when signed out. */
  session(): Promise<string | undefined>;
  /** Sends a magic link to the address. An Invite's token rides in the link, so accepting it survives the sign-in. Rejects when the server cannot be reached. */
  signIn(email: string, invite?: string): Promise<void>;
  /** Writes one row. Rejects when the server cannot be reached or refuses the row; the outbox keeps it. */
  upload(table: SyncedTable, row: UploadRow): Promise<void>;
  /** Every row of one table the signed-in account can see. Rejects when the server cannot be reached. */
  download<T extends SyncedTable>(table: T): Promise<SyncedRow[T][]>;
  /** Makes an Invite to one of the account's Athletes and returns its token. Rejects unless the account owns that Athlete. */
  createInvite(athleteId: string): Promise<string>;
  /** Makes the signed-in account a Member of the Invite's Athlete. Rejects with an InviteRefused when the Invite cannot be taken. */
  acceptInvite(token: string): Promise<void>;
  /** The Members of one Athlete the signed-in account can see: all of them for its Owner, its own membership for a Member. */
  members(athleteId: string): Promise<MemberRow[]>;
  /** Removes a Member from one of the account's Athletes. Rejects unless the account owns that Athlete. */
  removeMember(athleteId: string, memberId: string): Promise<void>;
  /** Removes the signed-in account's membership of an Athlete. */
  leave(athleteId: string): Promise<void>;
}

const DAY = 24 * 60 * 60_000;

/**
 * The in-memory backend for App Core's tests and the local smoke. `rows` holds what landed, `uploads` the order.
 * The top-level object is one phone's session; `phone()` makes another, on the same rows, Invites and Members.
 */
export function createStandInServer(reachable: () => boolean = () => globalThis.navigator?.onLine ?? true) {
  const rows: Record<SyncedTable, Map<string, StoredRow>> = { athletes: new Map(), games: new Map(), events: new Map() };
  const uploads: string[] = [];
  const invites = new Map<string, { athlete_id: string; owner_id: string; expires: number; used_by?: string }>();
  // `${athleteId} ${memberId}` for each Member, with when it joined
  const members = new Map<string, string>();
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
        return account;
      },
      // the magic link is opened at once, so the stand-in is signed in as soon as this resolves
      async signIn(_email: string, _invite?: string) {
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
        // the account that accepted it may accept again: a retry after a failed download
        if (invite.used_by === account) return;
        if (invite.used_by !== undefined) throw new InviteRefused('used');
        if (invite.expires <= Date.now()) throw new InviteRefused('expired');
        members.set(`${invite.athlete_id} ${account}`, new Date().toISOString());
        invite.used_by = account;
      },
      async members(athleteId: string) {
        reach();
        const owner = account !== undefined && rows.athletes.get(athleteId)?.owner_id === account;
        return [...members]
          .filter(([key]) => key.startsWith(`${athleteId} `) && (owner || key === `${athleteId} ${account}`))
          .map(([key, joined_at]) => ({ member_id: key.slice(athleteId.length + 1), joined_at }));
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
    };
  };
  return { ...phone(), rows, uploads, invites, phone };
}

/** Supabase through its client: the server the deployed app syncs with. */
export function createSupabaseServer(client: SupabaseClient): Server {
  const session = async () => (await client.auth.getSession()).data.session?.user.id;
  return {
    session,
    async signIn(email, invite) {
      const redirect = invite ? `${location.origin}/?invite=${invite}` : location.origin;
      const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
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
      const { error } = await client.rpc('accept_invite', { invite_token: token });
      if (!error) return;
      const refusal = /^invite_(unknown|own|used|expired)$/.exec(error.message);
      if (refusal) throw new InviteRefused(refusal[1] as InviteReason);
      throw error;
    },
    async members(athleteId) {
      const { data, error } = await client.from('members').select('member_id, joined_at').eq('athlete_id', athleteId);
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
    signIn: refuse,
    upload: refuse,
    download: refuse,
    createInvite: refuse,
    acceptInvite: refuse,
    members: refuse,
    removeMember: refuse,
    leave: refuse,
  };
}
