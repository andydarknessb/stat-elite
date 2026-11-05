import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'vitest';

// Runs schema.test.sql on PGlite (Postgres in WASM). The migrations in supabase/migrations/, in order, go where its marker
// line stands, so the self-check runs what Supabase applies.
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const migrations = readdirSync(new URL('../supabase/migrations/', import.meta.url))
  .sort()
  .map((file) => read(`../supabase/migrations/${file}`))
  .join('');

test('schema.test.sql passes', async () => {
  const sql = read('schema.test.sql')
    .replace(/^\\echo.*/gm, '')
    .replace(/^-- The migrations, in order, go here.*$/m, () => migrations);
  await new PGlite().exec(sql);
}, 60_000);
