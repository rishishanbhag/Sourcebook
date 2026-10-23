// Every displayed value goes through <Fact>: value, confidence, and all claims with their receipts.
import { createContext, useContext } from 'react';
import type { Db, FactGroup } from './types';
import { Badge, Muted, Table, Td } from './components/ui';

export const DbCtx = createContext<Db>(null!);

export const label = (field: string) =>
  field.replace(/_/g, ' ').replace(/\b(gcc|inr|cin|mca|epf|hq|reit)\b/g, (w) => w.toUpperCase()).replace(/\bindia\b/g, 'India').replace(/^./, (c) => c.toUpperCase());

function correctionLink(g: FactGroup) {
  const c = g.preferred;
  const subject = `Correction: ${c.subject_type}:${c.subject_id} ${c.field}`;
  const body = `Field: ${c.field}\nCurrent value: ${c.value}\nCorrect value:\nEvidence (link or document):\n`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function Fact({ g }: { g: FactGroup }) {
  const { sources } = useContext(DbCtx);
  const unverified = g.claims.some((c) => /unverified/i.test(sources[c.source_id].terms_note));
  const publishers = [...new Set(g.claims.map((c) => sources[c.source_id].publisher || sources[c.source_id].name))].join(', ');
  const value = g.status === 'disputed'
    ? <span className="bg-neutral-200 px-1" title="Sources disagree">{[...new Set(g.claims.map((c) => c.value))].join(' / ')}</span>
    : g.preferred.value;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="mr-1 inline-block text-xs text-neutral-500 transition-transform group-open:rotate-90">▸</span>
        {value}
        {g.status === 'disputed' && <Badge kind="disputed" />}
        <Badge kind={g.level} title={`confidence ${g.confidence}`} />
        {unverified && <Badge kind="unverified" />}
        <span className="block pl-4 text-xs text-neutral-500">as reported by {publishers} · {g.preferred.source_date}</span>
      </summary>
      <ul className="my-2 ml-4 list-disc space-y-2 pl-4 text-xs">
        {g.claims.map((c) => {
          const s = sources[c.source_id];
          return (
            <li key={c.claim_id}>
              <strong>{c.value}</strong>{c.unit && ` (${c.unit})`} ·{' '}
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{s.name}</a> : s.name}
              {s.publisher && `, ${s.publisher}`} · {c.source_date} · {c.method}
              {c.page_ref && ` · p. ${c.page_ref}`}
              {c.quote && <div className="text-neutral-500">"{c.quote}"</div>}
              {s.conflict_of_interest && <div className="text-neutral-500">Source interest: {s.conflict_of_interest}</div>}
              {s.terms_note && <div className="text-neutral-500">Source note: {s.terms_note}</div>}
              {c.retrieved_date && <div className="text-neutral-500">Read on {c.retrieved_date}</div>}
              {c.flag && <div className="font-semibold">Flag: {c.flag}</div>}
            </li>
          );
        })}
      </ul>
      <a className="ml-4 text-xs text-neutral-500 underline underline-offset-2" href={correctionLink(g)}>Suggest a correction</a>
    </details>
  );
}

// All facts for one subject, one row per (field, unit, period).
export function FactTable({ subject, empty = 'No sourced facts yet.' }: { subject: string; empty?: string }) {
  const { facts } = useContext(DbCtx);
  const groups = Object.values(facts[subject] ?? {}).flat();
  if (!groups.length) return <Muted>{empty}</Muted>;
  return (
    <Table head={['Field', 'Unit', 'Period', 'Value and sources']}>
      {groups.map((g) => (
        <tr key={g.field + g.unit + g.period}>
          <Td>{label(g.field)}</Td><Td>{g.unit || '-'}</Td><Td>{g.period || '-'}</Td><Td><Fact g={g} /></Td>
        </tr>
      ))}
    </Table>
  );
}
