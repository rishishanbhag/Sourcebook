import { useContext, useState } from 'react';
import { DbCtx } from '../Fact';
import { Callout, Card, Input, Muted, Section, Select } from '../components/ui';

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit`;
const SUBJECTS = ['parent', 'entity', 'site', 'city', 'policy', 'provider', 'ecosystem'];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-semibold">{label}</span>{children}</label>;
}

export default function Submit() {
  const { providers, parents } = useContext(DbCtx);
  const [kind, setKind] = useState<'report' | 'engagement'>('report');
  const [f, setF] = useState<Record<string, string>>({ subject_type: 'parent', anonymised: 'n' });
  const [contact, setContact] = useState('');
  const [state, setState] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const bind = (k: string) => ({ value: f[k] ?? '', onChange: set(k) });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ kind, payload: f, contact }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { setState({ ok: true, msg: 'Received. It will be reviewed before anything is shown, and shown with its source.' }); setF({ subject_type: 'parent', anonymised: 'n' }); }
      else setState({ ok: false, msg: body.error ?? 'Something went wrong, please retry.' });
    } catch { setState({ ok: false, msg: 'Network error, please retry.' }); }
    setBusy(false);
  }

  return (
    <Section title="Submit a report or engagement">
      <Callout>Nothing is published automatically. Every submission is reviewed and appears with its source. Do not guess the client of an anonymised engagement.</Callout>
      <form onSubmit={send} className="max-w-xl space-y-4">
        <Select aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value as 'report' | 'engagement')}>
          <option value="report">Report a figure</option>
          <option value="engagement">Report a provider engagement</option>
        </Select>

        {kind === 'report' ? (
          <Card className="space-y-3">
            <Field label="About"><Select {...bind('subject_type')}>{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Subject id (e.g. a parent id, city id, or india)"><Input required {...bind('subject_id')} /></Field>
            <Field label="Field (e.g. gcc_count, headcount)"><Input required {...bind('field')} /></Field>
            <Field label="Value"><Input required {...bind('value')} /></Field>
            <Field label="Unit (company / entity / site / unstated, required for counts)"><Input {...bind('unit')} /></Field>
            <Field label="Period (e.g. 2025)"><Input {...bind('period')} /></Field>
          </Card>
        ) : (
          <Card className="space-y-3">
            <Field label="Provider">
              <Select required value={f.provider_id ?? ''} onChange={set('provider_id')}>
                <option value="">Select...</option>
                {providers.map((p) => <option key={p.provider_id} value={p.provider_id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Service provided"><Input {...bind('service')} /></Field>
            <Field label="Is the client anonymised?">
              <Select {...bind('anonymised')}><option value="n">No, the client is named</option><option value="y">Yes, anonymised</option></Select>
            </Field>
            {f.anonymised === 'n' && (
              <Field label="Client (optional)">
                <Select value={f.parent_id ?? ''} onChange={set('parent_id')}>
                  <option value="">Select...</option>
                  {parents.map((p) => <option key={p.parent_id} value={p.parent_id}>{p.name}</option>)}
                </Select>
              </Field>
            )}
          </Card>
        )}

        <Card className="space-y-3">
          <Field label="Source link"><Input type="url" {...bind('source_url')} /></Field>
          <Field label="Quote from the source (give a link or a quote)"><Input {...bind('quote')} /></Field>
          <Field label="Your email (optional, never shown)"><Input type="email" value={contact} onChange={(e) => setContact(e.target.value)} /></Field>
        </Card>

        <button type="submit" disabled={busy} className="h-9 rounded border border-black bg-black px-4 text-sm text-white disabled:opacity-40">
          {busy ? 'Sending...' : 'Submit'}
        </button>
        {state && <p className={`text-sm ${state.ok ? '' : 'font-semibold'}`} role="status">{state.msg}</p>}
        <Muted>Limited to a few submissions per hour.</Muted>
      </form>
    </Section>
  );
}
