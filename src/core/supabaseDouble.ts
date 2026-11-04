import { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

// shortcut: real PostgREST and Supabase Auth are not exercised (no HTTP, no JWT, sign-in takes any six digits and makes the account), upgrade when a bug escapes through them.

// The stand-ins the schema self-check uses for Supabase's roles, auth.users and auth.uid (docs/schema.test.sql, lines 5 to 12).
const AUTH_STUBS = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated;
`;

const SCHEMA = new URL('../../docs/schema.sql', import.meta.url);

/** A fresh database holding the schema as Supabase holds it: the stand-ins, docs/schema.sql, then the grants the self-check gives. */
export async function schemaDatabase(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(AUTH_STUBS);
  await db.exec(readFileSync(SCHEMA, 'utf8'));
  await db.exec('grant select, insert, update, delete on athletes, games, events to authenticated;');
  return db;
}

type Row = Record<string, unknown>;
type Account = { id: string; email: string };
type Failure = Error & { code?: string };
type Result = { data: unknown; error: Failure | null };
type Filter = { column: string; op: '=' | '<='; value: unknown };
type Spec = {
  kind: 'select' | 'insert' | 'update' | 'delete';
  table: string;
  payload?: Row;
  ignoreDuplicates: boolean;
  /** what a select reads, or what a write returns */
  columns?: string;
  filters: Filter[];
  order?: string;
  span?: [number, number];
  single: boolean;
};

const fail = (message: string, code?: string): Failure => Object.assign(new Error(message), { code });
const ident = (name: string) => `"${name.replace(/"/g, '""')}"`;
const listed = (columns: string) => (columns === '*' ? '*' : columns.split(',').map((c) => ident(c.trim())).join(', '));

// The chain Supabase's query builder returns: filters and modifiers, then awaited for { data, error }.
class Chain implements PromiseLike<Result> {
  constructor(
    private readonly spec: Spec,
    private readonly run: (spec: Spec) => Promise<Result>,
  ) {}
  select(columns = '*') {
    this.spec.columns = columns;
    return this;
  }
  eq(column: string, value: unknown) {
    this.spec.filters.push({ column, op: '=', value });
    return this;
  }
  lte(column: string, value: unknown) {
    this.spec.filters.push({ column, op: '<=', value });
    return this;
  }
  order(column: string) {
    this.spec.order = column;
    return this;
  }
  range(from: number, to: number) {
    this.spec.span = [from, to];
    return this;
  }
  single() {
    this.spec.single = true;
    return this;
  }
  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    return this.run(this.spec).then(onfulfilled, onrejected);
  }
}

/**
 * A test-only double of the Supabase client over `db`. Each client is one phone: it signs in as one account, and every
 * query runs as that account's role (authenticated, or anon when signed out) with its auth.uid() set, so the schema's
 * row-level security and checks answer it. It implements only the query shapes createSupabaseServer uses.
 */
export function supabaseDouble(db: PGlite): SupabaseClient {
  let account: Account | undefined;

  // one statement, as the account's role: a refusal rolls it back and throws
  const query = (sql: string, params: unknown[] = []) =>
    db.transaction(async (tx) => {
      await tx.query(`set local role ${account ? 'authenticated' : 'anon'}`);
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [account?.id ?? '']);
      return (await tx.query<Row>(sql, params)).rows;
    });

  const accountFor = async (email: string): Promise<Account> => {
    const found = await db.query<Account>('select id, email from auth.users where email = $1', [email]);
    if (found.rows[0]) return found.rows[0];
    const made = await db.query<Account>(
      'insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id, email',
      [email],
    );
    return made.rows[0];
  };

  const run = async (spec: Spec): Promise<Result> => {
    const params: unknown[] = [];
    const bind = (value: unknown) => {
      params.push(value ?? null);
      return `$${params.length}`;
    };
    const table = ident(spec.table);
    const whereSql = () =>
      spec.filters.length
        ? ` where ${spec.filters.map((f) => `${ident(f.column)} ${f.op} ${bind(f.value)}`).join(' and ')}`
        : '';
    const keys = Object.keys(spec.payload ?? {}).filter((key) => spec.payload?.[key] !== undefined);
    const cols = keys.map(ident).join(', ');

    let statement = '';
    if (spec.kind === 'insert') {
      const json = bind(JSON.stringify(spec.payload));
      statement = `insert into ${table} (${cols}) select ${cols} from json_populate_record(null::${table}, ${json}::json)${
        spec.ignoreDuplicates ? ' on conflict do nothing' : ''
      }`;
    } else if (spec.kind === 'update') {
      const json = bind(JSON.stringify(spec.payload));
      statement = `update ${table} set (${cols}) = (select ${cols} from json_populate_record(null::${table}, ${json}::json))${whereSql()}`;
    } else if (spec.kind === 'delete') {
      statement = `delete from ${table}${whereSql()}`;
    }

    let sql: string;
    if (spec.kind === 'select') {
      const order = spec.order ? ` order by ${ident(spec.order)}` : '';
      const span = spec.span ? ` limit ${spec.span[1] - spec.span[0] + 1} offset ${spec.span[0]}` : '';
      const inner = `select ${listed(spec.columns ?? '*')} from ${table}${whereSql()}${order}${span}`;
      sql = `select coalesce(json_agg(x), '[]'::json) as j from (${inner}) x`;
    } else if (spec.columns) {
      sql = `with m as (${statement} returning ${listed(spec.columns)}) select coalesce(json_agg(m), '[]'::json) as j from m`;
    } else {
      sql = statement;
    }

    try {
      const rows = await query(sql, params);
      let data: unknown = rows[0]?.j ?? null;
      if (spec.single) {
        const list = Array.isArray(data) ? data : [];
        if (list.length !== 1) {
          return { data: null, error: fail('JSON object requested, multiple (or no) rows returned', 'PGRST116') };
        }
        data = list[0];
      }
      return { data, error: null };
    } catch (caught) {
      const { message, code } = caught as { message: string; code?: string };
      return { data: null, error: fail(message, code) };
    }
  };

  const chain = (spec: Pick<Spec, 'kind' | 'table'> & Partial<Spec>) =>
    new Chain({ ignoreDuplicates: false, filters: [], single: false, ...spec }, run);

  return {
    auth: {
      async getSession() {
        return { data: { session: account ? { user: account, access_token: 'double' } : null }, error: null };
      },
      async signInWithOtp() {
        return { data: {}, error: null };
      },
      async verifyOtp({ email, token }: { email: string; token: string }) {
        if (!/^\d{6}$/.test(token)) {
          return { data: { session: null, user: null }, error: fail('Token has expired or is invalid') };
        }
        account = await accountFor(email);
        return { data: { session: null, user: account }, error: null };
      },
      async signOut() {
        account = undefined;
        return { error: null };
      },
    },
    from: (table: string) => ({
      select: (columns = '*') => chain({ kind: 'select', table, columns }),
      insert: (payload: Row) => chain({ kind: 'insert', table, payload }),
      upsert: (payload: Row, options?: { ignoreDuplicates?: boolean }) =>
        chain({ kind: 'insert', table, payload, ignoreDuplicates: options?.ignoreDuplicates === true }),
      update: (payload: Row) => chain({ kind: 'update', table, payload }),
      delete: () => chain({ kind: 'delete', table }),
    }),
    async rpc(name: string, args: Row = {}) {
      const values = Object.values(args);
      try {
        const rows = await query(
          `select public.${name}(${values.map((_, i) => `$${i + 1}`).join(', ')}) as r`,
          values,
        );
        return { data: rows[0]?.r ?? null, error: null };
      } catch (caught) {
        const { message, code } = caught as { message: string; code?: string };
        return { data: null, error: fail(message, code) };
      }
    },
  } as unknown as SupabaseClient;
}
