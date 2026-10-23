// Usage: tsx scripts/approve-submission.ts <id> [--reject]
// Turns a pending submission into a source + claim (report) or engagement + claim (engagement),
// marks it approved, and pings the host build hook (BUILD_HOOK_URL) so the site rebuilds.
// build.ts re-validates everything, so a bad approval fails the build instead of publishing.
import { createClient } from '@supabase/supabase-js';
import { dbEnabled } from './db';

if (!dbEnabled) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env'); process.exit(1); }
const id = process.argv[2];
if (!id || !/^\d+$/.test(id)) { console.error('Usage: approve-submission.ts <id> [--reject]'); process.exit(1); }

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { auth: { persistSession: false } });
const must = <T>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data; };
const setStatus = async (status: string) => must(await sb.from('submissions').update({ status }).eq('id', id));

const sub = must(await sb.from('submissions').select('*').eq('id', id).single());
if (sub.status !== 'pending') { console.error(`Submission ${id} is already ${sub.status}`); process.exit(1); }

if (process.argv.includes('--reject')) { await setStatus('rejected'); console.log(`rejected ${id}`); process.exit(0); }

const p = sub.payload as Record<string, string>;
const today = new Date().toISOString().slice(0, 10);
const source_id = `sub_${id}`;
const claim = (subject_type: string, subject_id: string, field: string, value: string, extra: Record<string, string> = {}) => ({
  claim_id: `${source_id}_${field}`, subject_type, subject_id, field, value, unit: '', period: '', source_id,
  source_date: today, retrieved_date: today, method: 'submission', quote: p.quote ?? '', page_ref: '', flag: '', ...extra,
});

must(await sb.from('sources').upsert({ source_id, name: `Public submission #${id}`, publisher: '', url: p.source_url ?? '',
  published_date: today, type: 'submission', conflict_of_interest: '', terms_note: 'Submitted via the public form; reviewed by an editor.' }));

if (sub.kind === 'report') {
  must(await sb.from('claims').upsert(claim(p.subject_type, p.subject_id, p.field, p.value, { unit: p.unit ?? '', period: p.period ?? '' })));
} else {
  const engagement_id = source_id;
  // A submission alone never makes an engagement "gcc_confirmed"; promote it by hand if the submitter is verified.
  must(await sb.from('engagements').upsert({ engagement_id, provider_id: p.provider_id, site_id: p.site_id ?? '',
    parent_id: p.parent_id ?? '', service: p.service ?? '', status: 'self_reported', anonymised: p.anonymised }));
  must(await sb.from('claims').upsert(claim('engagement', engagement_id, 'engagement', p.service || 'engagement reported')));
}
await setStatus('approved');
console.log(`approved ${id} -> ${sub.kind}`);

if (process.env.BUILD_HOOK_URL) { await fetch(process.env.BUILD_HOOK_URL, { method: 'POST' }); console.log('rebuild triggered'); }
else console.log('No BUILD_HOOK_URL set: run npm run build:data (and redeploy) to publish.');
