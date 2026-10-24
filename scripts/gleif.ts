// For each parent in data/parents.csv, asks GLEIF's free public API for active Indian entities registered with
// MCA (registeredAs = CIN) whose legal name starts with the parent's first word. Writes data/gleif_candidates.csv.
// Candidates are NOT links: confirm each one in match_decisions.csv before it becomes an entity.
// `--selftest` checks the pure helpers.
import assert from 'node:assert/strict';
import { writeCsv } from './csv';
import { loadTable } from './db';

const MCA_RA = 'RA000394';
const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const STATES: Record<string, string> = { KA: 'Karnataka', MH: 'Maharashtra', PN: 'Maharashtra', TG: 'Telangana', AP: 'Andhra Pradesh',
  TN: 'Tamil Nadu', TZ: 'Tamil Nadu', GJ: 'Gujarat', DL: 'Delhi', HR: 'Haryana', UP: 'Uttar Pradesh', WB: 'West Bengal' };
export const cinState = (cin: string) => STATES[cin.slice(6, 8)] ?? cin.slice(6, 8);
export const cinOk = (cin: string) => /^[UL]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/.test(cin);
export function accept(parentName: string, legalName: string) {
  const first = alnum(parentName.split(/[\s(]/)[0]);
  return first.length >= 3 && alnum(legalName).startsWith(first);
}

if (process.argv.includes('--selftest')) {
  assert.equal(cinState('U72400KA2003PTC032606'), 'Karnataka');
  assert.ok(cinOk('U72400KA2003PTC032606') && !cinOk('abc'));
  assert.ok(accept('Goldman Sachs', 'GOLDMAN SACHS SERVICES PRIVATE LIMITED'));
  assert.ok(accept('Target', 'TARGETS PRIVATE LIMITED')); // prefix match is deliberate; review decides
  assert.ok(!accept('IBM', 'GLOBAL IBM PVT LTD'));
  console.log('gleif self-test passed');
  process.exit(0);
}

const DATA = new URL('../data/', import.meta.url);
const parents = (await loadTable('parents', ['parent_id', 'name', 'hq_country', 'website_domain', 'sector'])).rows;
const out: Record<string, string>[] = [];
const today = new Date().toISOString().slice(0, 10);

for (const [i, p] of parents.entries()) {
  const q = encodeURIComponent(p.name.replace(/\(.*?\)/g, '').trim());
  const url = `https://api.gleif.org/api/v1/lei-records?filter[fulltext]=${q}&filter[entity.legalAddress.country]=IN&page[size]=50`;
  try {
    const res = await fetch(url, { headers: { accept: 'application/vnd.api+json' } });
    if (!res.ok) { console.warn(`${p.name}: HTTP ${res.status}`); continue; }
    const body = (await res.json()) as { data: { id: string; attributes: any }[] };
    for (const r of body.data) {
      const e = r.attributes.entity;
      const cin = e.registeredAs ?? '';
      if (e.registeredAt?.id !== MCA_RA || !cinOk(cin) || e.status !== 'ACTIVE' || !accept(p.name, e.legalName.name)) continue;
      out.push({ parent_id: p.parent_id, parent_name: p.name, lei: r.id, legal_name: e.legalName.name, cin,
        state: cinState(cin), city: e.legalAddress.city ?? '', creation_date: e.creationDate?.slice(0, 10) ?? '', retrieved_date: today });
    }
  } catch (err) { console.warn(`${p.name}: ${(err as Error).message}`); }
  if (i % 25 === 0) console.log(`${i}/${parents.length}`);
  await new Promise((r) => setTimeout(r, 700)); // stay well under GLEIF's public rate limit
}

writeCsv(new URL('gleif_candidates.csv', DATA),
  ['parent_id', 'parent_name', 'lei', 'legal_name', 'cin', 'state', 'city', 'creation_date', 'retrieved_date'], out);
console.log(`${out.length} candidates for ${new Set(out.map((o) => o.parent_id)).size} of ${parents.length} parents`);
