// Public intake. Rate-limits per IP hash, validates, then stores a PENDING submission.
// Nothing here publishes anything; a human approves via scripts/approve-submission.ts.
// shortcut: no captcha yet, add Cloudflare Turnstile (verify a token before the insert) before the site goes public.
// Secret: IP_SALT. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_PER_HOUR = 5;
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const COUNT_UNITS = ['company', 'entity', 'site', 'unstated'];
const SUBJECTS = ['parent', 'entity', 'site', 'city', 'policy', 'provider', 'engagement', 'ecosystem'];

const cors = {
  'Access-Control-Allow-Origin': '*', // shortcut: lock to the site origin at launch
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Returns an error message, or null when the payload is acceptable.
function validate(kind: string, p: Record<string, string>): string | null {
  if (!p.source_url && !p.quote) return 'Give a source link or a quote so we can verify it.';
  if (p.source_url && !/^https?:\/\//.test(p.source_url)) return 'Source link must start with http:// or https://';
  if (kind === 'report') {
    if (!SUBJECTS.includes(p.subject_type)) return 'Pick what the report is about.';
    if (!p.subject_id || !p.field || !p.value) return 'Subject, field and value are required.';
    if (p.field.endsWith('_count') && !COUNT_UNITS.includes(p.unit)) return `Counts need a unit: ${COUNT_UNITS.join(', ')}.`;
    if (p.field.endsWith('_count') && !p.period) return 'Counts need a period.';
    if (p.period && !DATE_RE.test(p.period) && !/^FY\d{2,4}/i.test(p.period)) return 'Period looks wrong (e.g. 2025 or 2025-03).';
    return null;
  }
  if (!p.provider_id) return 'Pick the provider.';
  if (!['y', 'n'].includes(p.anonymised)) return 'Say whether the client is anonymised.';
  if (p.anonymised === 'y' && (p.parent_id || p.site_id)) return 'An anonymised engagement must not name the client.';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'POST only' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: 'Bad request' }); }
  if (JSON.stringify(body).length > 8000) return reply(413, { error: 'Too large' });

  const kind = str(body.kind);
  if (!['report', 'engagement'].includes(kind)) return reply(400, { error: 'Unknown kind' });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(ip + Deno.env.get('IP_SALT')))), (b) => b.toString(16).padStart(2, '0')).join('');

  const raw = (body.payload ?? {}) as Record<string, unknown>;
  const payload = Object.fromEntries(Object.entries(raw).slice(0, 20).map(([k, v]) => [k, str(v)]));
  const problem = validate(kind, payload);
  if (problem) return reply(422, { error: problem });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sb.from('submissions').select('id', { count: 'exact', head: true }).eq('ip_hash', hash).gte('created_at', since);
  if ((count ?? 0) >= MAX_PER_HOUR) return reply(429, { error: 'Too many submissions, try again later.' });

  const { error } = await sb.from('submissions').insert({ kind, payload, contact: str(body.contact, 200), ip_hash: hash });
  if (error) return reply(500, { error: 'Could not save, try again.' });
  return reply(200, { ok: true });
});
