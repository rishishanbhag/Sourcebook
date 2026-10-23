import { useContext, useState } from 'react';
import { DbCtx, FactTable } from '../Fact';
import { rankProviders } from '../logic';
import { FUNCTIONS } from './Registry';
import { Badge, Callout, ExtLink, Filters, Muted, Section, Select, Table, Td } from '../components/ui';

export default function CityPack() {
  const { cities, sites, parents, policies, providers, engagements } = useContext(DbCtx);
  const [cityId, setCityId] = useState(cities[0]?.city_id ?? '');
  const [fn, setFn] = useState('');
  const city = cities.find((c) => c.city_id === cityId);
  if (!city) return <Muted>No cities in data/cities.csv yet.</Muted>;

  const citySites = sites.filter((s) => s.city_id === cityId);
  const comparables = citySites.filter((s) => !fn || s.function === fn);
  const siteIds = new Set(citySites.map((s) => s.site_id));
  // Only engagements tied to a site in this city; anonymised ones cannot be placed in a city.
  const ranked = rankProviders(providers, engagements.filter((e) => siteIds.has(e.site_id)));
  const statePolicies = policies.filter((p) => p.state === city.state);

  return (
    <>
      <Filters>
        <Select aria-label="City" value={cityId} onChange={(e) => setCityId(e.target.value)}>
          {cities.map((c) => <option key={c.city_id} value={c.city_id}>{c.name}, {c.state}</option>)}
        </Select>
      </Filters>
      <Callout>{citySites.length} GCC sites listed in {city.name}. Coverage is partial; see Overview for the national figure.</Callout>

      <Section title="Office rent and talent cost">
        <FactTable subject={`city:${cityId}`} empty="No sourced rent or talent figures for this city yet." />
      </Section>

      <Section title={`${city.state} incentives`}>
        {statePolicies.length ? statePolicies.map((p) => (
          <div key={p.policy_id} className="mb-4">
            <p className="mb-2 text-sm font-semibold"><ExtLink href={p.doc_url}>{p.name}</ExtLink> {p.period && `(${p.period})`}</p>
            <FactTable subject={`policy:${p.policy_id}`} />
          </div>
        )) : <Muted>No policy entered for {city.state} yet.</Muted>}
      </Section>

      <Section title="Comparable GCCs">
        <Filters>
          <Select aria-label="Function" value={fn} onChange={(e) => setFn(e.target.value)}>
            <option value="">All functions</option>
            {FUNCTIONS.map((f) => <option key={f}>{f}</option>)}
          </Select>
        </Filters>
        {comparables.length ? (
          <Table head={['Company', 'Function', 'Opened', 'Confidence']}>
            {comparables.map((s) => (
              <tr key={s.site_id}>
                <Td>{parents.find((p) => p.parent_id === s.parent_id)?.name}</Td>
                <Td>{s.function || '-'}</Td>
                <Td>{s.opened_year || '-'}</Td>
                <Td><Badge kind={s.confidence} /></Td>
              </tr>
            ))}
          </Table>
        ) : <Muted>No sites listed.</Muted>}
      </Section>

      <Section title={`Providers with delivery evidence in ${city.name}`}>
        <Muted className="mb-3">Organic order only: an engagement confirmed by the GCC counts 3, a self-reported one counts 1. No paid placement.</Muted>
        {ranked.length ? (
          <Table head={['Provider', 'Category', 'Confirmed by GCC', 'Self-reported', 'Disputed']}>
            {ranked.map((r) => (
              <tr key={r.provider.provider_id}>
                <Td><ExtLink href={r.provider.website}>{r.provider.name}</ExtLink></Td>
                <Td>{r.provider.category}</Td>
                <Td>{r.confirmed}</Td>
                <Td>{r.selfReported}</Td>
                <Td>{r.disputed}</Td>
              </tr>
            ))}
          </Table>
        ) : <Muted>No provider engagements recorded for this city.</Muted>}
      </Section>
    </>
  );
}
