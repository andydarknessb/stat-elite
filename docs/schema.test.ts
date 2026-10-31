import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

// Runs schema.test.sql on PGlite (Postgres in WASM) by inlining the two psql meta-commands it uses.
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('schema.test.sql passes', async () => {
  const sql = read('schema.test.sql')
    .replace(/^\\ir (\S+)/gm, (_, file: string) => read(file))
    .replace(/^\\echo.*/gm, '');
  await new PGlite().exec(sql);
}, 60_000);

// The migration Supabase applies is docs/schema.sql, byte for byte (#9).
test('the migration holds docs/schema.sql', () => {
  expect(read('../supabase/migrations/20261031000000_init.sql')).toBe(read('schema.sql'));
});
