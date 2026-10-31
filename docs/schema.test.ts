import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Runs schema.test.sql on PGlite (Postgres in WASM) by inlining the two psql meta-commands it uses.
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('schema.test.sql passes', async () => {
  const sql = read('schema.test.sql')
    .replace(/^\\ir (\S+)/gm, (_, file: string) => read(file))
    .replace(/^\\echo.*/gm, '');
  await new PGlite().exec(sql);
}, 60_000);

// The migrations Supabase applies, in order, are docs/schema.sql byte for byte (#9). Each migration is only ever added to,
// never edited once merged, so this holds by appending: a change adds a file here and to schema.sql.
test('the migrations, in order, hold docs/schema.sql', () => {
  const migrations = readdirSync(new URL('../supabase/migrations/', import.meta.url)).sort();
  expect(migrations.map((file) => read(`../supabase/migrations/${file}`)).join('')).toBe(read('schema.sql'));
});
