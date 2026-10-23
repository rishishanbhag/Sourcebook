// Filters MCA company master CSV(s) (downloaded by hand into data/raw/) to likely GCC entities:
// active, subsidiary of a foreign company, registered in a target state, IT/ITES/business-services activity.
// Usage: npm run import:mca -- data/raw/karnataka.csv data/raw/maharashtra.csv ...
// Keeps company-level fields only. Email, address and director data are deliberately dropped (DPDP).
import assert from 'node:assert/strict';
import { readCsv, writeCsv } from './csv';

// [UNVERIFIED] Column names vary by data.gov.in release; first match wins. Add yours here if it fails.
const COLS = {
  cin: ['CORPORATE_IDENTIFICATION_NUMBER', 'CIN', 'Corporate Identification Number'],
  name: ['COMPANY_NAME', 'Company Name', 'CompanyName'],
  status: ['COMPANY_STATUS', 'Company Status', 'CompanyStatus'],
  subCategory: ['COMPANY_SUB_CATEGORY', 'Company Sub Category', 'CompanySubCategory'],
  regDate: ['DATE_OF_REGISTRATION', 'Date of Registration', 'CompanyRegistrationdate_date'],
};

// CIN = listing(1) + NIC code(5) + state(2) + year(4) + type(3) + serial(6)
const CIN_RE = /^[LU](\d{5})([A-Z]{2})(\d{4})[A-Z]{3}\d{6}$/;
// AP kept because Hyderabad companies registered before 2014 carry AP.
const STATES: Record<string, string> = {
  KA: 'Karnataka', MH: 'Maharashtra', TG: 'Telangana', AP: 'Andhra Pradesh', TN: 'Tamil Nadu', GJ: 'Gujarat',
};
// NIC divisions: 62/63 IT (2008), 72 computer services (2004), 73 R&D (2004), 70/74 consulting & business services, 82 business support.
const ACTIVITY = new Set(['62', '63', '70', '72', '73', '74', '82']);

function keep(cin: string, status: string, subCategory: string) {
  const m = CIN_RE.exec(cin);
  if (!m) return null;
  const [, nic, st] = m;
  if (!STATES[st] || !ACTIVITY.has(nic.slice(0, 2))) return null;
  if (!/^active$/i.test(status) || !/foreign/i.test(subCategory)) return null;
  return { state: STATES[st], activity_code: nic };
}

if (process.argv.includes('--selftest')) {
  const fsub = 'Subsidiary of Foreign Company';
  assert.deepEqual(keep('U72200KA2010FTC012345', 'Active', fsub), { state: 'Karnataka', activity_code: '72200' });
  assert.equal(keep('U72200KA2010FTC012345', 'Strike Off', fsub), null);
  assert.equal(keep('U72200KA2010PTC012345', 'Active', 'Non-govt company'), null);
  assert.equal(keep('U15100KA2010FTC012345', 'Active', fsub), null); // food manufacturing
  assert.equal(keep('U72200DL2010FTC012345', 'Active', fsub), null); // Delhi not targeted
  assert.equal(keep('garbage', 'Active', fsub), null);
  console.log('import-mca selftest passed');
  process.exit(0);
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: npm run import:mca -- data/raw/<file>.csv [more files]');
  process.exit(1);
}

const retrieved_date = new Date().toISOString().slice(0, 10);
const out = new Map<string, Record<string, string>>();
const perState: Record<string, number> = {};
for (const f of files) {
  const { rows, headers } = readCsv(f);
  const col = Object.fromEntries(Object.entries(COLS).map(([k, opts]) => [k, opts.find((o) => headers.includes(o))]));
  const missing = Object.entries(col).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(`${f}: could not find columns for ${missing.join(', ')}.\n  Headers found: ${headers.join(', ')}\n  Add the right names to COLS in scripts/import-mca.ts`);
    process.exit(1);
  }
  let kept = 0;
  for (const r of rows) {
    const cin = r[col.cin!].toUpperCase();
    const k = keep(cin, r[col.status!], r[col.subCategory!]);
    if (!k) continue;
    kept++;
    perState[k.state] = (perState[k.state] ?? 0) + 1;
    out.set(cin, { cin, name: r[col.name!], status: r[col.status!], state: k.state,
      incorporation_date: r[col.regDate!], activity_code: k.activity_code, sub_category: r[col.subCategory!], retrieved_date });
  }
  console.log(`${f}: ${rows.length} rows read, ${kept} kept`);
}

writeCsv(new URL('../data/mca_filtered.csv', import.meta.url),
  ['cin', 'name', 'status', 'state', 'incorporation_date', 'activity_code', 'sub_category', 'retrieved_date'], [...out.values()]);
console.log(`data/mca_filtered.csv: ${out.size} entities`, perState);
