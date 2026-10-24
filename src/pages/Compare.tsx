import { useContext, useState } from 'react';
import { DbCtx, Fact, label } from '../Fact';
import type { FactGroup } from '../types';
import { Callout, ExtLink, Filters, Muted, Select, Table, Td } from '../components/ui';

const NOT_SOURCED = <span className="text-neutral-500">Not yet sourced</span>;

export default function Compare() {
  const { cities, sites, policies, facts } = useContext(DbCtx);
  const [a, setA] = useState(cities[0]?.city_id ?? '');
  const [b, setB] = useState(cities[1]?.city_id ?? '');
  const pair = [a, b].map((id) => cities.find((c) => c.city_id === id));
  if (cities.length < 2) return <Muted>Add at least two cities to data/cities.csv to compare them.</Muted>;

  // One row per (field, unit, period) that either city has a fact for, so a figure is only ever set against the same measure.
  const groups = (id: string) => Object.values(facts[`city:${id}`] ?? {}).flat();
  const keyOf = (g: FactGroup) => `${g.field}|${g.unit}|${g.period}`;
  const rows = new Map<string, FactGroup>();
  for (const g of [...groups(a), ...groups(b)]) rows.set(keyOf(g), g);
  const ordered = [...rows.values()].sort((x, y) => label(x.field).localeCompare(label(y.field)) || x.period.localeCompare(y.period));
  // A city with no city-level facts at all is planned, not half-sourced: say so once instead of a column of blanks.
  const planned = (id: string) => groups(id).length === 0;
  const cityName = (id: string) => cities.find((c) => c.city_id === id)?.name;
  const cell = (id: string, g: FactGroup) => {
    if (planned(id)) return <span className="text-neutral-500">Planned</span>;
    const hit = groups(id).find((x) => keyOf(x) === keyOf(g));
    return hit ? <Fact g={hit} /> : NOT_SOURCED;
  };
  const policyOf = (id: string) => {
    const state = cities.find((c) => c.city_id === id)?.state;
    return policies.filter((p) => p.state === state);
  };

  return (
    <>
      <Filters>
        {[[a, setA], [b, setB]].map(([value, set], i) => (
          <Select key={i} aria-label={`City ${i + 1}`} value={value as string} onChange={(e) => (set as (v: string) => void)(e.target.value)}>
            {cities.map((c) => <option key={c.city_id} value={c.city_id}>{c.name}, {c.state}{planned(c.city_id) ? ' (planned)' : ''}</option>)}
          </Select>
        ))}
      </Filters>
      <Callout>
        Each row compares the same measure and period in both cities. A blank cell means no source has been found yet, not zero.
        Rents from different sources are not the same measure, so they sit on separate rows.
        {[a, b].some(planned) && (
          <> {[a, b].filter(planned).map(cityName).join(' and ')}: planned. The site list and state policy are sourced; city-level rent, vacancy and leasing figures are not added yet.</>
        )}
      </Callout>
      <Table head={['Measure', ...pair.map((c) => c?.name)]}>
        <tr>
          <Td className="font-medium">GCC sites listed here</Td>
          {[a, b].map((id) => <Td key={id}>{sites.filter((s) => s.city_id === id).length}</Td>)}
        </tr>
        <tr>
          <Td className="font-medium">State policy</Td>
          {[a, b].map((id) => (
            <Td key={id}>
              {policyOf(id).length
                ? policyOf(id).map((p) => <div key={p.policy_id}><ExtLink href={p.doc_url}>{p.name}</ExtLink> {p.period}</div>)
                : NOT_SOURCED}
            </Td>
          ))}
        </tr>
        {ordered.map((g) => (
          <tr key={keyOf(g)}>
            <Td className="font-medium">
              {label(g.field)}
              {(g.period || g.unit) && <span className="block text-xs font-normal text-neutral-500">{[g.period, g.unit].filter(Boolean).join(' · ')}</span>}
            </Td>
            <Td>{cell(a, g)}</Td>
            <Td>{cell(b, g)}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
