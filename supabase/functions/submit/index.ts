// Public intake. Rate-limits per IP hash, validates, then stores a PENDING submission.
// Nothing here publishes anything; a human approves via scripts/approve-submission.ts.
// Secrets: IP_SALT, TURNSTILE_SECRET, ALLOWED_ORIGINS (comma-separated site origins). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_PER_HOUR = 5;
const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const COUNT_UNITS = ['company', 'entity', 'site', 'unstated'];
const SUBJECTS = ['parent', 'entity', 'site', 'city', 'policy', 'provider', 'engagement', 'ecosystem'];

const ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
// Browsers enforce this; it does not stop non-browser clients, the captcha and rate limit do.
const corsFor = (req: Request) => ({
  'Access-Control-Allow-Origin': ORIGINS.includes(req.headers.get('origin') ?? '') ? req.headers.get('origin')! : (ORIGINS[0] ?? 'null'),
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  Vary: 'Origin',
});
const reply = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsFor(req), 'Content-Type': 'application/json' } });

async function captchaOk(token: string, ip: string) {
  if (!token) return false;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: Deno.env.get('TURNSTILE_SECRET') ?? '', response: token, remoteip: ip }),
  });
  return r.ok && (await r.json()).success === true;
}

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
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsFor(req) });
  if (req.method !== 'POST') return reply(req, 405, { error: 'POST only' });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(req, 400, { error: 'Bad request' }); }
  if (JSON.stringify(body).length > 8000) return reply(req, 413, { error: 'Too large' });

  const kind = str(body.kind);
  if (!['report', 'engagement'].includes(kind)) return reply(req, 400, { error: 'Unknown kind' });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(ip + Deno.env.get('IP_SALT')))), (b) => b.toString(16).padStart(2, '0')).join('');

  if (!(await captchaOk(str(body.captcha, 2048), ip))) return reply(req, 400, { error: 'Captcha failed, reload and retry.' });

  const raw = (body.payload ?? {}) as Record<string, unknown>;
  const payload = Object.fromEntries(Object.entries(raw).slice(0, 20).map(([k, v]) => [k, str(v)]));
  const problem = validate(kind, payload);
  if (problem) return reply(req, 422, { error: problem });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await sb.from('submissions').select('id', { count: 'exact', head: true }).eq('ip_hash', hash).gte('created_at', since);
  if ((count ?? 0) >= MAX_PER_HOUR) return reply(req, 429, { error: 'Too many submissions, try again later.' });

  const { error } = await sb.from('submissions').insert({ kind, payload, contact: str(body.contact, 200), ip_hash: hash });
  if (error) return reply(req, 500, { error: 'Could not save, try again.' });
  return reply(req, 200, { ok: true });
});
