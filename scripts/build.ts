// Reads data/*.csv, validates every row, resolves claims, writes public/db.json.
// Fails (exit 1) on any error so bad data never reaches the UI.
// `--selftest` checks the resolution rules on fixtures instead.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { readCsv } from './csv';
import { dbEnabled, readTable } from './db';
import { REGISTERS, loadRegister } from './registers';
import { DATE_RE, TIER, resolveGroup, rankProviders, level } from '../src/logic';
import type { Claim, Db, FactGroup, Row, Site } from '../src/types';

const DATA = new URL('../data/', import.meta.url);

// Headers must match exactly. `req` = must be non-empty. `enums` = allowed values (blank allowed unless also req).
const SPEC: Record<string, { cols: string[]; req: string[]; enums?: Record<string, string[]> }> = {
  sources: {
    cols: ['source_id', 'name', 'publisher', 'url', 'published_date', 'type', 'conflict_of_interest', 'terms_note'],
    req: ['source_id', 'name', 'type'], // without published_date, each claim needs its own source_date
    enums: { type: Object.keys(TIER) },
  },
  parents: { cols: ['parent_id', 'name', 'hq_country', 'website_domain', 'sector'], req: ['parent_id', 'name'] },
  entities: {
    cols: ['entity_id', 'parent_id', 'legal_name', 'cin', 'state', 'incorporation_date', 'mca_status'],
    req: ['entity_id', 'parent_id', 'legal_name'],
  },
  cities: { cols: ['city_id', 'name', 'state'], req: ['city_id', 'name', 'state'] },
  sites: {
    cols: ['site_id', 'entity_id', 'parent_id', 'city_id', 'function', 'maturity_stage', 'maturity_framework', 'opened_year'],
    req: ['site_id', 'parent_id', 'city_id'],
    enums: { function: ['tech', 'finance', 'analytics', 'ops', 'mixed'] },
  },
  policies: { cols: ['policy_id', 'state', 'name', 'period', 'doc_url'], req: ['policy_id', 'state', 'name'] },
  providers: {
    cols: ['provider_id', 'name', 'category', 'website'],
    req: ['provider_id', 'name', 'category'],
    enums: { category: ['legal', 'recruit', 'real_estate', 'eor', 'advisory'] },
  },
  engagements: {
    cols: ['engagement_id', 'provider_id', 'site_id', 'parent_id', 'service', 'status', 'anonymised'],
    req: ['engagement_id', 'provider_id', 'status', 'anonymised'],
    enums: { status: ['self_reported', 'gcc_confirmed', 'disputed'], anonymised: ['y', 'n'] },
  },
  claims: {
    cols: ['claim_id', 'subject_type', 'subject_id', 'field', 'value', 'unit', 'period', 'source_id', 'source_date',
      'retrieved_date', 'method', 'quote', 'page_ref', 'flag'],
    req: ['claim_id', 'subject_type', 'subject_id', 'field', 'value', 'source_id', 'method'],
    enums: {
      subject_type: ['parent', 'entity', 'site', 'city', 'policy', 'provider', 'engagement', 'ecosystem'],
      method: ['manual', 'import', 'submission', 'derived'],
    },
  },
  match_decisions: {
    cols: ['left_ref', 'right_ref', 'decision', 'decided_by', 'decided_date', 'note'],
    req: ['left_ref', 'right_ref', 'decision'],
    enums: { decision: ['same', 'different', 'unsure'] },
  },
};

// Units every count must carry, so company/entity/site numbers are never mixed.
const COUNT_UNITS = ['company', 'entity', 'site', 'unstated'];

// A match decision proposed by Claude (or marked as such in its note) is not a human review, so it is skipped.
export const unreviewed = (d: Row) => d.decided_by === 'claude' || /not (yet )?reviewed/i.test(d.note ?? '');

async function build() {
  const errors: string[] = [];
  const warnings: string[] = [];
  const t: Record<string, Row[]> = {};

  // Supabase is the source of truth when configured (readTable retries each page). If it is still down, build
  // everything from the committed data/*.csv export instead, never a mix of the two.
  let fromDb: Record<string, Row[]> | null = null;
  if (dbEnabled) {
    try {
      fromDb = {};
      for (const [name, spec] of Object.entries(SPEC)) fromDb[name] = await readTable(name, spec.cols[0]);
    } catch (e) {
      fromDb = null;
      warnings.push(`Supabase read failed after retries (${(e as Error).message}); built from the committed data/*.csv snapshot, which may be stale`);
    }
  }

  for (const [name, spec] of Object.entries(SPEC)) {
    const file = new URL(`${name}.csv`, DATA);
    if (!fromDb && !existsSync(file)) { errors.push(`data/${name}.csv is missing`); t[name] = []; continue; }
    const { rows, headers } = fromDb ? { rows: fromDb[name], headers: spec.cols } : readCsv(file);
    if (headers.join() !== spec.cols.join()) {
      errors.push(`data/${name}.csv headers must be: ${spec.cols.join(',')}\n    found: ${headers.join(',')}`);
    }
    rows.forEach((r, i) => {
      const at = `data/${name}.csv row ${i + 2}`;
      for (const c of spec.req) if (!r[c]) errors.push(`${at}: "${c}" is empty`);
      for (const [c, allowed] of Object.entries(spec.enums ?? {})) {
        if (r[c] && !allowed.includes(r[c])) errors.push(`${at}: "${c}"="${r[c]}" must be one of ${allowed.join('/')}`);
      }
    });
    const idCol = spec.cols[0];
    if (idCol.endsWith('_id')) {
      const seen = new Set<string>();
      for (const r of rows) {
        if (seen.has(r[idCol])) errors.push(`data/${name}.csv: duplicate ${idCol} "${r[idCol]}"`);
        seen.add(r[idCol]);
      }
    }
    t[name] = rows;
  }

  const ids = (table: string, col: string) => new Set(t[table].map((r) => r[col]));
  const has = { source: ids('sources', 'source_id'), parent: ids('parents', 'parent_id'), entity: ids('entities', 'entity_id'),
    site: ids('sites', 'site_id'), city: ids('cities', 'city_id'), policy: ids('policies', 'policy_id'),
    provider: ids('providers', 'provider_id'), engagement: ids('engagements', 'engagement_id') } as Record<string, Set<string>>;
  const fk = (table: string, col: string, target: string, optional = false) =>
    t[table].forEach((r, i) => {
      if (optional && !r[col]) return;
      if (!has[target].has(r[col])) errors.push(`data/${table}.csv row ${i + 2}: ${col} "${r[col]}" not found in ${target}s`);
    });

  for (const s of t.sources) {
    if (s.published_date && !DATE_RE.test(s.published_date)) errors.push(`source ${s.source_id}: published_date must be YYYY, YYYY-MM or YYYY-MM-DD`);
    if (!s.url) warnings.push(`source ${s.source_id} has no url`);
  }

  // Entities from a register (MCA, GLEIF): a `same` decision between <prefix>:<CIN> and parent:<id> creates the entity.
  // shortcut: only register->parent links are applied; extend when other source pairs are matched.
  const claimRows = t.claims.length;
  const registers = REGISTERS.map((reg) => ({ reg, recs: loadRegister(reg, DATA) }));
  const knownCins = new Set(t.entities.map((e) => e.cin).filter(Boolean));
  let skipped = 0;
  for (const d of t.match_decisions) {
    if (d.decision !== 'same') continue;
    if (unreviewed(d)) { skipped++; continue; }
    const [lk, cin] = d.left_ref.split(':');
    const [rk, parentId] = d.right_ref.split(':');
    const found = registers.find((x) => x.reg.prefix === lk);
    if (!found || rk !== 'parent') { warnings.push(`match decision ${d.left_ref} ~ ${d.right_ref} not applied (only register~parent supported)`); continue; }
    const m = found.recs.get(cin);
    if (!m) { errors.push(`match decision: ${cin} not in data/${found.reg.file}`); continue; }
    if (!has.parent.has(parentId)) { errors.push(`match decision: parent ${parentId} not found`); continue; }
    if (!has.source.has(found.reg.source)) { errors.push(`sources.csv needs a row with source_id "${found.reg.source}" for ${found.reg.prefix} entities`); continue; }
    if (knownCins.has(cin)) continue;
    knownCins.add(cin);
    const entity_id = `e_${cin}`;
    t.entities.push({ entity_id, parent_id: parentId, legal_name: m.name, cin, state: m.state,
      incorporation_date: m.incorporation_date, mca_status: m.status });
    has.entity.add(entity_id);
    // Imported fields get receipts too; the parent link is the reviewer's decision, so it is "derived".
    const base = { subject_type: 'entity', subject_id: entity_id, unit: '', period: '', source_id: found.reg.source,
      source_date: m.retrieved_date, retrieved_date: m.retrieved_date, page_ref: '', flag: '' };
    const imported: [string, string][] = [['legal_name', m.name], ['cin', cin], ['mca_status', m.status],
      ['incorporation_date', m.incorporation_date], ['lei', m.lei]];
    for (const [field, value] of imported) {
      if (value) t.claims.push({ ...base, claim_id: `${found.reg.prefix}_${cin}_${field}`, field, value, method: 'import', quote: '' });
    }
    t.claims.push({ ...base, claim_id: `${found.reg.prefix}_${cin}_parent`, field: 'parent_company', value: t.parents.find((p) => p.parent_id === parentId)!.name,
      method: 'derived', quote: `Matched by review${d.decided_date ? ` on ${d.decided_date}` : ''}${d.note ? `: ${d.note}` : ''}` });
  }

  if (skipped) warnings.push(`${skipped} AI-proposed match(es) not applied: to confirm one, set decided_by to a person and remove "Not yet reviewed" from its note`);

  fk('entities', 'parent_id', 'parent');
  fk('sites', 'parent_id', 'parent');
  fk('sites', 'entity_id', 'entity', true);
  fk('sites', 'city_id', 'city');
  fk('engagements', 'provider_id', 'provider');
  fk('engagements', 'site_id', 'site', true);
  fk('engagements', 'parent_id', 'parent', true);

  // Link a site to its entity when the parent has exactly one entity in the site's state.
  const cityState = new Map(t.cities.map((c) => [c.city_id, c.state]));
  for (const s of t.sites) {
    if (s.entity_id) continue;
    const candidates = t.entities.filter((e) => e.parent_id === s.parent_id && e.state === cityState.get(s.city_id));
    if (candidates.length === 1) s.entity_id = candidates[0].entity_id;
  }

  // Engagement rules from the brief: never guess an anonymised client.
  t.engagements.forEach((e) => {
    if (e.anonymised === 'y' && (e.parent_id || e.site_id)) {
      errors.push(`engagement ${e.engagement_id}: anonymised=y must leave parent_id and site_id empty (do not guess the client)`);
    }
  });

  const sources = Object.fromEntries(t.sources.map((s) => [s.source_id, s]));
  const claims: Claim[] = t.claims.map((r, i) => {
    const c = { ...r, source_date: r.source_date || sources[r.source_id]?.published_date || '' } as Claim;
    const at = i < claimRows ? `data/claims.csv row ${i + 2} (${c.claim_id})` : `claim ${c.claim_id} (generated from a register import)`;
    if (!sources[c.source_id]) errors.push(`${at}: source_id "${c.source_id}" not found in sources`);
    if (!DATE_RE.test(c.source_date)) errors.push(`${at}: needs a source_date (or a published_date on its source)`);
    if (c.subject_type === 'ecosystem') {
      if (c.subject_id !== 'india') errors.push(`${at}: ecosystem claims use subject_id "india"`);
    } else if (!has[c.subject_type]?.has(c.subject_id)) {
      errors.push(`${at}: ${c.subject_type} "${c.subject_id}" not found`);
    }
    if (c.field.endsWith('_count') && !COUNT_UNITS.includes(c.unit)) {
      errors.push(`${at}: count fields need unit = ${COUNT_UNITS.join('/')} (got "${c.unit}")`);
    }
    if (c.field.endsWith('_count') && !c.period) errors.push(`${at}: count fields need a period`);
    return c;
  });

  // Every site and engagement needs at least one receipt.
  const subjectsWithClaims = new Set(claims.map((c) => `${c.subject_type}:${c.subject_id}`));
  for (const s of t.sites) if (!subjectsWithClaims.has(`site:${s.site_id}`)) errors.push(`site ${s.site_id} has no claims (no evidence it exists)`);
  for (const e of t.engagements) {
    if (!subjectsWithClaims.has(`engagement:${e.engagement_id}`)) errors.push(`engagement ${e.engagement_id} has no claims`);
    const confirmedBy = claims.some((c) => c.subject_type === 'engagement' && c.subject_id === e.engagement_id &&
      ['gcc', 'submission'].includes(sources[c.source_id]?.type));
    if (e.status === 'gcc_confirmed' && !confirmedBy) {
      errors.push(`engagement ${e.engagement_id}: gcc_confirmed needs a claim from a "gcc" or "submission" source`);
    }
  }

  if (errors.length) {
    console.error(`\n${errors.length} error(s) - db.json NOT written:\n` + errors.map((e) => `  - ${e}`).join('\n'));
    process.exit(1);
  }

  const today = new Date();
  const facts: Db['facts'] = {};
  const groups = new Map<string, Claim[]>();
  for (const c of claims) {
    const k = [c.subject_type, c.subject_id, c.field, c.unit, c.period].join('|');
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const g of groups.values()) {
    const fg = resolveGroup(g, sources, today);
    const subj = `${g[0].subject_type}:${g[0].subject_id}`;
    ((facts[subj] ??= {})[fg.field] ??= []).push(fg);
  }

  // Site confidence: best evidence on the site, capped at Medium until a legal entity is linked.
  const sites: Site[] = t.sites.map((s) => {
    const best = Math.max(...Object.values(facts[`site:${s.site_id}`] ?? {}).flat().map((f) => f.confidence));
    return { ...s, confidence: level(s.entity_id ? best : Math.min(best, 0.74)) };
  });

  // Coverage is measured against the preferred site-unit count, never a company or entity count.
  const reference = (facts['ecosystem:india']?.gcc_count ?? [])
    .filter((f) => f.unit === 'site')
    .sort((a, b) => b.period.localeCompare(a.period))[0] ?? null;

  const db: Db = {
    generated_at: today.toISOString(),
    sources, parents: t.parents, entities: t.entities, sites,
    // A city with no site and no claim has nothing to show, so it stays out of the dropdowns until a source mentions it.
    cities: t.cities.filter((c) => subjectsWithClaims.has(`city:${c.city_id}`) || t.sites.some((s) => s.city_id === c.city_id)),
    policies: t.policies,
    providers: t.providers, engagements: t.engagements, facts, coverage: { sites: sites.length, reference },
  };
  mkdirSync(new URL('../public/', import.meta.url), { recursive: true }); // public/ is not in git, so a fresh checkout lacks it
  writeFileSync(new URL('../public/db.json', import.meta.url), JSON.stringify(db));
  warnings.forEach((w) => console.warn(`  warn: ${w}`));
  console.log(`db.json written: ${t.parents.length} parents, ${t.entities.length} entities, ${sites.length} sites, ` +
    `${claims.length} claims, ${[...groups.values()].length} facts, ` +
    `${Object.values(facts).flatMap((f) => Object.values(f).flat()).filter((f) => f.status === 'disputed').length} disputed`);
}

function selftest() {
  const sources: Record<string, Row> = { g: { type: 'govt' }, b1: { type: 'broker' }, b2: { type: 'broker' }, b3: { type: 'consultant' } };
  const today = new Date('2026-10-01');
  const claim = (source_id: string, value: string, source_date = '2026-01') =>
    ({ claim_id: source_id + value, subject_type: 'ecosystem', subject_id: 'india', field: 'f', value, unit: '', period: '2025',
      source_id, source_date, retrieved_date: '', method: 'manual', quote: '', page_ref: '', flag: '' }) as Claim;

  // Single govt source, fresh -> 0.9 High
  let g: FactGroup = resolveGroup([claim('g', '10')], sources, today);
  assert.equal(g.status, 'single'); assert.equal(g.confidence, 0.9); assert.equal(g.level, 'High');

  // Three brokers disagree (the leasing-share case) -> disputed, all kept, 0.6-0.2 = Low
  g = resolveGroup([claim('b1', '30%+'), claim('b2', '35-40%'), claim('b3', '45%')], sources, today);
  assert.equal(g.status, 'disputed'); assert.equal(g.claims.length, 3); assert.equal(g.confidence, 0.4);

  // "~1,700" and "1700" agree; second independent source adds 0.1
  g = resolveGroup([claim('b1', '~1,700'), claim('b2', '1700')], sources, today);
  assert.equal(g.status, 'agree'); assert.equal(g.confidence, 0.7);

  // Same source twice is not independent
  g = resolveGroup([claim('b1', '5'), claim('b1', '5', '2026-02')], sources, today);
  assert.equal(g.confidence, 0.6);

  // Stale (> 24 months) loses 0.2; govt preferred over broker
  g = resolveGroup([claim('g', '1', '2023-01'), claim('b1', '2', '2023-06')], sources, today);
  assert.equal(g.preferred.source_id, 'g'); assert.equal(g.confidence, 0.5);

  // Ranking: confirmed counts 3x and providers without engagements drop out
  const r = rankProviders(
    [{ provider_id: 'a', name: 'A' }, { provider_id: 'b', name: 'B' }, { provider_id: 'c', name: 'C' }],
    [{ provider_id: 'a', status: 'self_reported' }, { provider_id: 'a', status: 'self_reported' },
      { provider_id: 'b', status: 'gcc_confirmed' }],
  );
  assert.deepEqual(r.map((x) => [x.provider.provider_id, x.score]), [['b', 3], ['a', 2]]);
  assert.ok(unreviewed({ decided_by: 'review_queue', note: 'Proposed by Claude: x. Not yet reviewed by a person.' }));
  assert.ok(unreviewed({ decided_by: 'claude', note: '' }));
  assert.ok(!unreviewed({ decided_by: 'rishi', note: 'Confirmed against MCA' }));
  console.log('build selftest passed');
}

if (process.argv.includes('--selftest')) selftest();
else await build();
