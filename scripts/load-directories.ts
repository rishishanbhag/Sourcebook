// Loads the hand-saved directory lists in data/raw/*_blr.txt (name|country|sector per line)
// into parents, sites, sources and claims. Re-runnable: rows it made have ids starting "dir".
// `--selftest` checks the company-name key.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { dbEnabled, loadTable, pruneTable, saveTable } from './db';
import type { Row } from '../src/types';

const DATA = new URL('../data/', import.meta.url);
const RETRIEVED = '2026-10-23';

const FLEXIPLE = { file: 'flexiple_blr.txt', city: 'blr', cityName: 'Bengaluru', source: 'dir_flexiple', name: 'Flexiple: GCC directory (city lists)',
    publisher: 'Flexiple', url: 'https://flexiple.com/global-capability-centers/list-of-global-capability-centers-in-bengaluru',
    interest: 'Flexiple sells hiring and talent services to GCCs; directory is marketing content',
    note: 'Public web pages read once on ' + RETRIEVED + '; terms not checked. Bengaluru page lists 437, only first 248 read. Pune page: all 169 read. Mumbai lists 283, 276 read. Hyderabad lists 299, all 299 read from a saved copy of the full page. Chennai lists 244, all read. City pages: https://flexiple.com/global-capability-centers/list-of-global-capability-centers-in-pune (same pattern for hyderabad, chennai; Mumbai is /global-capability-centers-in-mumbai).' };
const LISTS = [
  FLEXIPLE,
  { ...FLEXIPLE, file: 'flexiple_pune.txt', city: 'pune', cityName: 'Pune' },
  // shortcut: lists below were read through a page summariser, not copied by hand; spot-check before trusting.
  { ...FLEXIPLE, file: 'flexiple_mum.txt', city: 'mum', cityName: 'Mumbai' },
  { ...FLEXIPLE, file: 'flexiple_hyd.txt', city: 'hyd', cityName: 'Hyderabad' },
  { ...FLEXIPLE, file: 'flexiple_chennai.txt', city: 'chennai', cityName: 'Chennai' },
  { file: 'gccjournal_blr.txt', city: 'blr', cityName: 'Bengaluru', source: 'dir_gccjournal', name: 'GCC Journal: GCCs in Bangalore',
    publisher: 'GCC Journal', url: 'https://gccjournal.in/insights/list-of-global-capability-centers-gcc-bangalore/',
    interest: 'Commercial GCC media and directory; interest not established',
    note: 'Public web page read once on ' + RETRIEVED + '; Terms page not read. No opening years given.' },
];

// Same company across lists: first word of the name, except where that merges different companies.
const FULL_NAME = ['fidelity', 'siemens', 'american', 'first'];
export function key(name: string) {
  const words = name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const k = words[0].startsWith('jpmorgan') ? 'jpmorgan' : words[0];
  return FULL_NAME.includes(k) ? words.slice(0, 2).join('_') : k;
}

const COUNTRY: Record<string, string> = { USA: 'United States', UK: 'United Kingdom' };
const FUNCTION: Record<string, string> = { BFSI: 'finance', Technology: 'tech', Semiconductors: 'tech', 'Telecom': 'tech' };
const fn = (sector: string) => FUNCTION[Object.keys(FUNCTION).find((k) => sector.startsWith(k)) ?? ''] ?? 'mixed';

if (process.argv.includes('--selftest')) {
  assert.equal(key('JPMorganChase'), key('JPMorgan Chase India'));
  assert.equal(key('Microsoft India Development Center'), key('Microsoft'));
  assert.notEqual(key('Fidelity Investments'), key('Fidelity International'));
  assert.notEqual(key('American Express'), key('First American'));
  assert.equal(fn('BFSI'), 'finance');
  assert.equal(fn('Retail'), 'mixed');
  console.log('load-directories self-test passed');
  process.exit(0);
}

const COLS = {
  sources: ['source_id', 'name', 'publisher', 'url', 'published_date', 'type', 'conflict_of_interest', 'terms_note'],
  parents: ['parent_id', 'name', 'hq_country', 'website_domain', 'sector'],
  sites: ['site_id', 'entity_id', 'parent_id', 'city_id', 'function', 'maturity_stage', 'maturity_framework', 'opened_year'],
  claims: ['claim_id', 'subject_type', 'subject_id', 'field', 'value', 'unit', 'period', 'source_id', 'source_date',
    'retrieved_date', 'method', 'quote', 'page_ref', 'flag'],
};
const table = (n: keyof typeof COLS) => loadTable(n, COLS[n]);
const keep = (rows: Row[], col: string) => rows.filter((r) => !r[col].startsWith('dir'));

const sources = await table('sources'), parents = await table('parents'), sites = await table('sites'), claims = await table('claims');
const outSources = [...keep(sources.rows, 'source_id')];
const outParents = keep(parents.rows, 'parent_id');
const outSites = keep(sites.rows, 'site_id');
const outClaims = keep(claims.rows, 'claim_id');

const seen = new Map<string, { name: string; country: string; sector: string }>();
const claimed = new Set<string>(); // one parent claim per source and company, even if it appears in several city lists
const sited = new Set<string>();
let n = 0;
const claim = (subject_type: string, subject_id: string, field: string, value: string, source_id: string, quote: string) =>
  outClaims.push({ claim_id: `dir${String(++n).padStart(4, '0')}`, subject_type, subject_id, field, value, unit: '', period: '',
    source_id, source_date: '', retrieved_date: RETRIEVED, method: 'import', quote, page_ref: '', flag: '' });

for (const l of LISTS) {
  if (!outSources.some((r) => r.source_id === l.source)) outSources.push({ source_id: l.source, name: l.name, publisher: l.publisher, url: l.url, published_date: '2026',
    type: 'company', conflict_of_interest: l.interest, terms_note: l.note });
  const lines = readFileSync(new URL(`raw/${l.file}`, DATA), 'utf8').split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const [name, rawCountry, sector] = line.split('|').map((s) => s.trim());
    const country = COUNTRY[rawCountry] ?? rawCountry;
    const k = key(name);
    const pid = `dir_${k}`;
    if (!seen.has(k)) {
      seen.set(k, { name, country, sector });
      outParents.push({ parent_id: pid, name, hq_country: '', website_domain: '', sector: '' });
    }
    const site = `${pid}_${l.city}`;
    if (!sited.has(site)) {
      sited.add(site);
      outSites.push({ site_id: site, entity_id: '', parent_id: pid, city_id: l.city, function: fn(sector),
        maturity_stage: '', maturity_framework: '', opened_year: '' });
    }
    const quote = `${name} | ${country} | ${sector}`;
    claim('site', site, 'listed_as_gcc_in_city', l.cityName, l.source, quote);
    if (claimed.has(l.source + pid)) continue;
    claimed.add(l.source + pid);
    claim('parent', pid, 'hq_country', country, l.source, quote);
    // shortcut: the two lists use different sector taxonomies, so only Flexiple's is claimed (else false disputes).
    if (l.source === 'dir_flexiple') claim('parent', pid, 'sector', sector, l.source, quote);
  }
}

const OUT = { sources: outSources, parents: outParents, sites: outSites, claims: outClaims };
for (const name of ['sources', 'parents', 'sites', 'claims'] as const) await saveTable(name, COLS[name], OUT[name]);
// Drop rows this script no longer generates, children first (claims, sites, parents, sources).
if (dbEnabled) {
  for (const [name, id] of [['claims', 'claim_id'], ['sites', 'site_id'], ['parents', 'parent_id'], ['sources', 'source_id']] as const) {
    const n = await pruneTable(name, id, OUT[name]);
    if (n) console.log(`pruned ${n} stale ${name} row(s) from Supabase`);
  }
}
console.log(`${seen.size} parents/sites, ${n} claims from ${LISTS.length} lists`);
