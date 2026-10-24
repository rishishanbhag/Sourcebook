// Refreshes data/*.csv from Supabase so the committed export (the offline fallback for build.ts) matches the DB.
import { readCsv, writeCsv } from './csv';
import { dbEnabled, readTable } from './db';

if (!dbEnabled) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env'); process.exit(1); }

const TABLES = ['sources', 'parents', 'cities', 'providers', 'policies', 'entities', 'sites', 'engagements', 'claims', 'match_decisions'];

for (const name of TABLES) {
  const file = new URL(`../data/${name}.csv`, import.meta.url);
  const { headers } = readCsv(file); // the CSV header row is the column order
  const rows = await readTable(name, headers[0]);
  writeCsv(file, headers, rows);
  console.log(`${name}: ${rows.length} rows -> data/${name}.csv`);
}
