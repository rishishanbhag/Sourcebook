// One-off: copies data/*.csv into Supabase (run supabase/schema.sql first). Safe to re-run (upserts).
import { readCsv } from './csv';
import { dbEnabled, writeTable, readTable } from './db';

if (!dbEnabled) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env'); process.exit(1); }

// FK order: parents/sources/cities/providers first.
const TABLES = ['sources', 'parents', 'cities', 'providers', 'policies', 'entities', 'sites', 'engagements', 'claims', 'match_decisions'];

for (const name of TABLES) {
  const { rows, headers } = readCsv(new URL(`../data/${name}.csv`, import.meta.url));
  await writeTable(name, headers, rows);
  const stored = (await readTable(name, headers[0])).length;
  console.log(`${name}: csv ${rows.length}, db ${stored}${stored === rows.length ? '' : '  <-- MISMATCH'}`);
}
