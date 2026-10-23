// Supabase read/write with the same Row[] shape as csv.ts. Uses the service key: scripts only, never the browser.
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Row } from '../src/types';

if (existsSync('.env')) process.loadEnvFile('.env');

export const dbEnabled = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY;
const client = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });

const PAGE = 1000;

// Rows come back ordered by the first column (the id), not CSV order.
export async function readTable(name: string, orderBy: string): Promise<Row[]> {
  const sb = client();
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from(name).select('*').order(orderBy).range(from, from + PAGE - 1);
    if (error) throw new Error(`read ${name}: ${error.message}`);
    out.push(...(data as Row[]));
    if (data.length < PAGE) return out;
  }
}

// shortcut: upsert only, rows removed from `rows` are not deleted; add deletes if a script needs to drop rows.
export async function writeTable(name: string, columns: string[], rows: Row[]) {
  const sb = client();
  const full = rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? ''])));
  for (let i = 0; i < full.length; i += 500) {
    const { error } = await sb.from(name).upsert(full.slice(i, i + 500));
    if (error) throw new Error(`write ${name}: ${error.message}`);
  }
}
