// Registers of Indian legal entities that matching can link to parents. Each file is mapped to one record shape.
// A match decision ref is `<prefix>:<CIN>`; the entity's claims cite `source`.
import { existsSync } from 'node:fs';
import { readCsv } from './csv';
import type { Row } from '../src/types';

export interface EntityRec {
  cin: string; name: string; state: string; status: string; incorporation_date: string; retrieved_date: string; lei: string;
}
export interface Register { prefix: string; file: string; source: string; toRec: (r: Row) => EntityRec }

export const REGISTERS: Register[] = [
  { prefix: 'mca', file: 'mca_filtered.csv', source: 'mca_master',
    toRec: (r) => ({ cin: r.cin, name: r.name, state: r.state, status: r.status, incorporation_date: r.incorporation_date, retrieved_date: r.retrieved_date, lei: '' }) },
  // GLEIF's status is the LEI's, not MCA's, so status stays empty rather than being mislabelled.
  { prefix: 'gleif', file: 'gleif_candidates.csv', source: 'gleif_lei',
    toRec: (r) => ({ cin: r.cin, name: r.legal_name, state: r.state, status: '', incorporation_date: r.creation_date, retrieved_date: r.retrieved_date, lei: r.lei }) },
];

export function loadRegister(reg: Register, dataDir: URL): Map<string, EntityRec> {
  const file = new URL(reg.file, dataDir);
  return existsSync(file) ? new Map(readCsv(file).rows.map((r) => [r.cin, reg.toRec(r)])) : new Map();
}
