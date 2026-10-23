import { useContext } from 'react';
import { DbCtx, FactTable } from '../Fact';
import { normValue } from '../logic';
import { Callout, Muted, Section } from '../components/ui';

function Coverage() {
  const { coverage, sources } = useContext(DbCtx);
  const ref = coverage.reference;
  if (!ref) return <Callout>{coverage.sites} sites listed. No official site count to measure coverage against yet.</Callout>;
  const total = Number(normValue(ref.preferred.value));
  return (
    <Callout>
      {coverage.sites} sites listed = <strong>{((coverage.sites / total) * 100).toFixed(2)}%</strong> of {ref.preferred.value} sites
      ({sources[ref.preferred.source_id].name}, {ref.period}). This registry does not list every GCC.
    </Callout>
  );
}

export default function Overview() {
  return (
    <>
      <Coverage />
      <Section title="How big is the ecosystem? Sources disagree">
        <Muted className="mb-3">
          Counts are shown per source with the unit each one counts (company, legal entity or site). Numbers with different
          units or periods are not comparable. "Unstated" means the source did not say what it counted.
        </Muted>
        <FactTable subject="ecosystem:india" />
      </Section>
    </>
  );
}
