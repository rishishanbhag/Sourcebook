// Scores data/mca_filtered.csv against data/parents.csv and writes data/review_queue.csv.
// Workflow: fill the `decision` column (same/different/unsure) in review_queue.csv, then run again:
// filled rows are moved into match_decisions.csv first, so re-running never loses a decision.
// `--selftest` checks the normaliser and the worked example from the plan.
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
import { readCsv, writeCsv } from './csv';
import { loadTable, saveTable } from './db';
import { REGISTERS, loadRegister } from './registers';
import type { Row } from '../src/types';

const STOP = new Set(('private limited pvt ltd llp inc corp corporation company co the and of india technology technologies ' +
  'tech services service solutions global centre center centres centers gcc capability capabilities').split(' '));

export function core(name: string): string[] {
  return name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w));
}

interface Rec { name: string; cin?: string; domain?: string; states?: string[]; cities?: string[] }

export function score(a: Rec, b: Rec, parentName?: string): { score: number; reasons: string[] } {
  if (a.cin && a.cin === b.cin) return { score: 1, reasons: ['same CIN'] };
  let s = 0;
  const reasons: string[] = [];
  if (a.domain && a.domain === b.domain) { s += 0.5; reasons.push('same domain +0.5'); }
  const ta = new Set(core(a.name)), tb = new Set(core(b.name));
  const shared = [...ta].filter((w) => tb.has(w)).length;
  const jaccard = shared / (new Set([...ta, ...tb]).size || 1);
  if (jaccard === 1) { s += 0.4; reasons.push('core name identical +0.4'); }
  else if (jaccard > 0) { s += 0.4 * jaccard; reasons.push(`core name overlap ${jaccard.toFixed(2)} +${(0.4 * jaccard).toFixed(2)}`); }
  if (a.states?.some((x) => b.states?.includes(x))) { s += 0.1; reasons.push('same state +0.1'); }
  if (a.cities?.some((x) => b.cities?.includes(x))) { s += 0.1; reasons.push('same city +0.1'); }
  const pn = parentName ? core(parentName) : [];
  if (pn.length && pn.every((w) => ta.has(w))) { s += 0.2; reasons.push('parent name in legal name +0.2'); }
  return { score: Math.min(1, Math.round(s * 100) / 100), reasons };
}

const QUEUE_MIN = 0.5;
const SUGGEST_SAME = 0.9;
const QUEUE_COLS = ['score', 'suggestion', 'left_ref', 'left_name', 'left_state', 'right_ref', 'right_name', 'reasons', 'decision', 'note'];
const DECISION_COLS = ['left_ref', 'right_ref', 'decision', 'decided_by', 'decided_date', 'note'];

async function run() {
  const data = (f: string) => new URL(`../data/${f}`, import.meta.url);
  const queueFile = data('review_queue.csv'); // derived scratch file, regenerated each run, so it stays CSV
  const decisions = (await loadTable('match_decisions', DECISION_COLS)).rows;
  const decided = new Set(decisions.map((d) => `${d.left_ref}|${d.right_ref}`));

  // 1. Move filled-in queue rows into match_decisions.csv.
  if (existsSync(queueFile)) {
    let moved = 0;
    for (const q of readCsv(queueFile).rows) {
      if (!q.decision) continue;
      if (!['same', 'different', 'unsure'].includes(q.decision)) {
        console.error(`review_queue.csv: "${q.decision}" for ${q.left_ref} ~ ${q.right_ref} must be same/different/unsure. Nothing moved.`);
        process.exit(1);
      }
      if (decided.has(`${q.left_ref}|${q.right_ref}`)) continue;
      decisions.push({ left_ref: q.left_ref, right_ref: q.right_ref, decision: q.decision, decided_by: 'review_queue',
        decided_date: new Date().toISOString().slice(0, 10), note: q.note });
      decided.add(`${q.left_ref}|${q.right_ref}`);
      moved++;
    }
    await saveTable('match_decisions', DECISION_COLS, decisions);
    console.log(`${moved} decision(s) moved to match_decisions.csv`);
  }

  // 2. Score every undecided register x parent pair that shares at least one core token.
  const registers = REGISTERS.map((reg) => ({ reg, recs: [...loadRegister(reg, new URL('../data/', import.meta.url)).values()] }))
    .filter((x) => x.recs.length);
  if (!registers.length) {
    console.error('No entity register found (data/mca_filtered.csv or data/gleif_candidates.csv). Run npm run import:mca or npm run gleif first.');
    process.exit(1);
  }
  const parents = (await loadTable('parents', ['parent_id', 'name', 'hq_country', 'website_domain', 'sector'])).rows;
  const cityState = new Map((await loadTable('cities', ['city_id', 'name', 'state'])).rows.map((c) => [c.city_id, c.state]));
  const sites = (await loadTable('sites', ['site_id', 'entity_id', 'parent_id', 'city_id', 'function', 'maturity_stage', 'maturity_framework', 'opened_year'])).rows;
  const knownCins = new Set((await loadTable('entities', ['entity_id', 'parent_id', 'legal_name', 'cin', 'state', 'incorporation_date', 'mca_status'])).rows
    .map((e) => e.cin).filter(Boolean));
  const parentStates = (id: string) => sites.filter((s) => s.parent_id === id).map((s) => cityState.get(s.city_id)!);

  const queue: Row[] = [];
  const parentTokens = parents.map((p) => ({ p, tokens: new Set(core(p.name)), states: parentStates(p.parent_id) }));
  let total = 0;
  for (const { reg, recs } of registers) {
    total += recs.length;
    for (const m of recs) {
      if (knownCins.has(m.cin)) continue;
      const mt = core(m.name);
      for (const { p, tokens, states } of parentTokens) {
        // shortcut: only entities registered in a state where the parent has a site are queued; widen when sites span more states.
        if (!states.includes(m.state) || !mt.some((w) => tokens.has(w))) continue;
        const left_ref = `${reg.prefix}:${m.cin}`, right_ref = `parent:${p.parent_id}`;
        if (decided.has(`${left_ref}|${right_ref}`)) continue;
        const r = score({ name: m.name, states: [m.state] }, { name: p.name, states }, p.name);
        if (r.score < QUEUE_MIN) continue;
        queue.push({ score: r.score.toFixed(2), suggestion: r.score >= SUGGEST_SAME ? 'same' : '', left_ref, left_name: m.name,
          left_state: m.state, right_ref, right_name: p.name, reasons: r.reasons.join('; '), decision: '', note: '' });
      }
    }
  }
  queue.sort((a, b) => Number(b.score) - Number(a.score));
  writeCsv(queueFile, QUEUE_COLS, queue);
  console.log(`review_queue.csv: ${queue.length} pair(s) to review (${total} register rows x ${parents.length} parents)`);
}

function selftest() {
  assert.deepEqual(core('Acme Technology India Pvt. Ltd.'), ['acme']);
  assert.deepEqual(core('Acme Global Services'), ['acme']);
  assert.deepEqual(core('Acme Foods India Private Limited'), ['acme', 'foods']);

  // Worked example from the plan: press "Acme Global Services" (Bengaluru) vs MCA "Acme Technology India Pvt Ltd".
  const r = score({ name: 'Acme Technology India Pvt Ltd', states: ['Karnataka'], cities: ['Bengaluru'] },
    { name: 'Acme Global Services', states: ['Karnataka'], cities: ['Bengaluru'] }, 'Acme');
  assert.equal(r.score, 0.8);
  assert.ok(r.score >= QUEUE_MIN && r.score < SUGGEST_SAME, 'lands in the review queue');

  // The trap: an unrelated "Acme Foods" still reaches the queue, so a human decides.
  const trap = score({ name: 'Acme Foods India Private Limited', states: ['Karnataka'] }, { name: 'Acme', states: ['Karnataka'] }, 'Acme');
  assert.ok(trap.score >= QUEUE_MIN, `trap score ${trap.score}`);

  assert.equal(score({ name: 'X', cin: 'U1' }, { name: 'Y', cin: 'U1' }).score, 1);
  assert.equal(score({ name: 'Zeta Analytics' }, { name: 'Acme' }).score, 0);
  console.log('match selftest passed');
}

if (process.argv.includes('--selftest')) selftest();
else await run();
