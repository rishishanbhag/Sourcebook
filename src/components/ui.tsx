// Shared building blocks. Black and white only: emphasis comes from weight, borders and fill, never colour.
import type { ComponentProps, ReactNode } from 'react';
import type { Level } from '../types';

export const Muted = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <p className={`text-sm text-neutral-500 ${className}`}>{children}</p>
);

export const Section = ({ title, children }: { title: ReactNode; children: ReactNode }) => (
  <section className="mt-10 first:mt-0">
    <h2 className="mb-3 font-serif text-lg font-semibold">{title}</h2>
    {children}
  </section>
);

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`rounded border border-neutral-300 bg-white p-4 ${className}`}>{children}</div>
);

export const Callout = ({ children }: { children: ReactNode }) => (
  <p className="mb-4 border-l-2 border-black bg-neutral-50 px-3 py-2 text-sm">{children}</p>
);

// High = solid, Medium = outlined, Low = dashed and grey; no colour needed to tell them apart.
const BADGE: Record<Level | 'disputed' | 'unverified', string> = {
  High: 'border-black bg-black text-white',
  Medium: 'border-black text-black',
  Low: 'border-dashed border-neutral-500 text-neutral-500',
  disputed: 'border-black bg-neutral-200 text-black',
  unverified: 'border-dashed border-black text-black',
};
export const Badge = ({ kind, title, children }: { kind: string; title?: string; children?: ReactNode }) => (
  <span title={title} className={`ml-1.5 inline-block rounded-full border px-1.5 text-xs leading-5 ${BADGE[kind as keyof typeof BADGE]}`}>{children ?? kind}</span>
);

export const Filters = ({ children }: { children: ReactNode }) => <div className="mb-3 flex flex-wrap items-center gap-2">{children}</div>;

const CONTROL = 'h-9 rounded border border-neutral-300 bg-white px-2 text-sm focus:border-black focus:outline-none';
export const Select = (p: ComponentProps<'select'>) => <select {...p} className={CONTROL} />;
export const Input = (p: ComponentProps<'input'>) => <input {...p} className={`${CONTROL} w-64`} />;

export const ExtLink = ({ href, children }: { href?: string; children: ReactNode }) =>
  href ? <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:no-underline">{children}</a> : <>{children}</>;

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="max-h-[75vh] overflow-auto border border-neutral-200">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>{head.map((h, i) => <th key={i} className="sticky top-0 z-10 border-b border-neutral-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className = '' }: { children?: ReactNode; className?: string }) => (
  <td className={`border-b border-neutral-200 px-3 py-2 align-top ${className}`}>{children}</td>
);
export const Tr = ({ selected, ...p }: ComponentProps<'tr'> & { selected?: boolean }) => (
  <tr {...p} className={`${p.onClick ? 'cursor-pointer hover:bg-neutral-50' : ''} ${selected ? 'bg-neutral-100' : ''}`} />
);

export function Tabs<T extends string>({ tabs, current, onChange }: { tabs: T[]; current: T; onChange: (t: T) => void }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-neutral-300">
      {tabs.map((t) => (
        <button key={t} aria-current={t === current ? 'page' : undefined} onClick={() => onChange(t)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${t === current ? 'border-black font-semibold text-black' : 'border-transparent text-neutral-500 hover:text-black'}`}>
          {t}
        </button>
      ))}
    </nav>
  );
}
