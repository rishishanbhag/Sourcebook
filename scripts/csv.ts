import { readFileSync, writeFileSync } from 'node:fs';
import Papa from 'papaparse';
import type { Row } from '../src/types';

export function readCsv(path: URL | string): { rows: Row[]; headers: string[] } {
  const out = Papa.parse<Row>(readFileSync(path, 'utf8').replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transform: (v) => v.trim(),
  });
  return { rows: out.data, headers: out.meta.fields ?? [] };
}

export function writeCsv(path: URL | string, columns: string[], rows: Row[]) {
  writeFileSync(path, Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => r[c] ?? '')) }) + '\n');
}
