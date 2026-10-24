// Supabase read/write with the same Row[] shape as csv.ts. Uses the service key: scripts only, never the browser.
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Row } from '../src/types';
import { readCsv, writeCsv } from './csv';

if (existsSync('.env')) process.loadEnvFile('.env');

export const dbEnabled = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_KEY;
const client = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });

const PAGE = 1000;

// Rows come back ordered by the first column (the id), not CSV order. Each page is retried so a blip is not fatal.
export async function readTable(name: string, orderBy: string): Promise<Row[]> {
  const sb = client();
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let res = await sb.from(name).select('*').order(orderBy).range(from, from + PAGE - 1);
    for (let attempt = 1; res.error && attempt < 3; attempt++) {
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      res = await sb.from(name).select('*').order(orderBy).range(from, from + PAGE - 1);
    }
    const { data, error } = res;
    if (error) throw new Error(`read ${name}: ${error.message}`);
    out.push(...(data as Row[]));
    if (data.length < PAGE) return out;
  }
}

// Upsert only; to drop rows a script regenerates, call pruneTable after all upserts (children before parents).
export async function writeTable(name: string, columns: string[], rows: Row[]) {
  const sb = client();
  const full = rows.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? ''])));
  for (let i = 0; i < full.length; i += 500) {
    const { error } = await sb.from(name).upsert(full.slice(i, i + 500));
    if (error) throw new Error(`write ${name}: ${error.message}`);
  }
}

// Deletes rows whose id is not in `keep`. Pass the script's full output for the table.
export async function pruneTable(name: string, idCol: string, keep: Row[]) {
  const sb = client();
  const keepIds = new Set(keep.map((r) => r[idCol]));
  const stale = (await readTable(name, idCol)).map((r) => r[idCol]).filter((id) => !keepIds.has(id));
  for (let i = 0; i < stale.length; i += 200) {
    const { error } = await sb.from(name).delete().in(idCol, stale.slice(i, i + 200));
    if (error) throw new Error(`prune ${name}: ${error.message}`);
  }
  return stale.length;
}

// Postgres is the source of truth when configured; data/*.csv is the offline fallback and a git-tracked export.
const csvUrl = (name: string) => new URL(`../data/${name}.csv`, import.meta.url);
export async function loadTable(name: string, cols: string[]): Promise<{ rows: Row[]; headers: string[] }> {
  return dbEnabled ? { rows: await readTable(name, cols[0]), headers: cols } : readCsv(csvUrl(name));
}
export async function saveTable(name: string, cols: string[], rows: Row[]) {
  if (dbEnabled) await writeTable(name, cols, rows);
  writeCsv(csvUrl(name), cols, rows); // keep the committed export in step with the DB
}
