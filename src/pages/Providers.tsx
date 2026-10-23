import { useContext, useState } from 'react';
import { DbCtx, Fact } from '../Fact';
import { rankProviders } from '../logic';
import { Badge, ExtLink, Filters, Muted, Section, Select, Table, Td } from '../components/ui';

const STATUS_LABEL: Record<string, string> = {
  gcc_confirmed: 'Confirmed by GCC', self_reported: 'Self-reported', disputed: 'Disputed',
};

export default function Providers() {
  const { providers, engagements, parents, sites, cities, facts } = useContext(DbCtx);
  const [category, setCategory] = useState('');
  const ranked = rankProviders(providers, engagements).filter((r) => !category || r.provider.category === category);
  const categories = [...new Set(providers.map((p) => p.category))].sort();
  const cityOf = (siteId: string) => cities.find((c) => c.city_id === sites.find((s) => s.site_id === siteId)?.city_id)?.name;

  if (!providers.length) return <Muted>No providers in data/providers.csv yet.</Muted>;
  return (
    <>
      <Muted className="mb-3">
        Order is organic only: an engagement confirmed by the GCC counts 3, a self-reported one counts 1, ties by name. Nothing is ranked by payment.
        A claim made only by the provider is labelled self-reported, never confirmed. A provider with no evidence is not listed.
      </Muted>
      <Filters>
        <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Muted>{ranked.length} providers with evidence</Muted>
      </Filters>

      <Table head={['Provider', 'Category', 'Confirmed by GCC', 'Self-reported', 'Disputed']}>
        {ranked.map((r) => (
          <tr key={r.provider.provider_id}>
            <Td className="font-medium"><ExtLink href={r.provider.website}>{r.provider.name}</ExtLink></Td>
            <Td>{r.provider.category}</Td>
            <Td>{r.confirmed}</Td>
            <Td>{r.selfReported}</Td>
            <Td>{r.disputed}</Td>
          </tr>
        ))}
      </Table>

      {ranked.map((r) => (
        <Section key={r.provider.provider_id} title={`${r.provider.name}: evidence`}>
          <Table head={['Client', 'City', 'Service', 'Status', 'Evidence and source']}>
            {engagements.filter((e) => e.provider_id === r.provider.provider_id).map((e) => {
              const evidence = Object.values(facts[`engagement:${e.engagement_id}`] ?? {}).flat();
              return (
                <tr key={e.engagement_id}>
                  <Td>{e.anonymised === 'y' ? <span className="text-neutral-500">Anonymised, not attributed</span> : parents.find((p) => p.parent_id === e.parent_id)?.name ?? '-'}</Td>
                  <Td>{(e.site_id && cityOf(e.site_id)) || <span className="text-neutral-500">Not stated</span>}</Td>
                  <Td>{e.service || '-'}</Td>
                  <Td><Badge kind={e.status === 'gcc_confirmed' ? 'High' : e.status === 'disputed' ? 'disputed' : 'Low'}>{STATUS_LABEL[e.status] ?? e.status}</Badge></Td>
                  <Td>{evidence.length ? evidence.map((g) => <Fact key={g.field + g.period} g={g} />) : <span className="text-neutral-500">No evidence claim</span>}</Td>
                </tr>
              );
            })}
          </Table>
        </Section>
      ))}
    </>
  );
}
