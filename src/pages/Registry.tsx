import { useContext, useState } from 'react';
import { DbCtx, FactTable } from '../Fact';
import { Badge, Card, Filters, Input, Muted, Section, Select, Table, Td, Tr } from '../components/ui';

export const FUNCTIONS = ['tech', 'finance', 'analytics', 'ops', 'mixed'];

export default function Registry() {
  const { sites, parents, entities, cities, facts } = useContext(DbCtx);
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [fn, setFn] = useState('');
  const [country, setCountry] = useState('');
  const [sector, setSector] = useState('');
  const [linked, setLinked] = useState('');
  const [selected, setSelected] = useState('');
  const pf = (id: string, field: string) => facts[`parent:${id}`]?.[field]?.[0]?.preferred.value ?? '';

  const rows = sites.map((s) => ({
    s,
    parent: parents.find((p) => p.parent_id === s.parent_id)!,
    entity: entities.find((e) => e.entity_id === s.entity_id),
    city: cities.find((c) => c.city_id === s.city_id)!,
    country: pf(s.parent_id, 'hq_country'),
    sector: pf(s.parent_id, 'sector'),
  })).sort((a, b) => a.parent.name.localeCompare(b.parent.name));
  const options = (k: 'country' | 'sector') => [...new Set(rows.map((r) => r[k]).filter(Boolean))].sort();

  const needle = q.toLowerCase();
  const shown = rows.filter((r) =>
    (!needle || [r.parent.name, r.entity?.legal_name, r.entity?.cin, r.city.name].some((v) => v?.toLowerCase().includes(needle))) &&
    (!city || r.s.city_id === city) && (!fn || r.s.function === fn) && (!country || r.country === country) &&
    (!sector || r.sector === sector) && (!linked || (linked === 'yes') === !!r.entity));
  const sel = rows.find((r) => r.s.site_id === selected);
  const pick = (id: string) => setSelected(id);

  return (
    <>
      <Filters>
        <Input aria-label="Search" placeholder="Company, legal name, CIN or city" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="City" value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="">All cities</option>
          {cities.map((c) => <option key={c.city_id} value={c.city_id}>{c.name}</option>)}
        </Select>
        <Select aria-label="Function" value={fn} onChange={(e) => setFn(e.target.value)}>
          <option value="">All functions</option>
          {FUNCTIONS.map((f) => <option key={f}>{f}</option>)}
        </Select>
        <Select aria-label="Parent country" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All parent countries</option>
          {options('country').map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select aria-label="Industry" value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="">All industries</option>
          {options('sector').map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select aria-label="Legal entity" value={linked} onChange={(e) => setLinked(e.target.value)}>
          <option value="">Entity: any</option>
          <option value="yes">Entity linked</option>
          <option value="no">Entity not linked</option>
        </Select>
        <Muted>{shown.length} of {rows.length} sites</Muted>
      </Filters>

      <Table head={['Company', 'India legal entity', 'City', 'Industry', 'Parent country', 'Function', 'Confidence']}>
        {shown.map((r) => (
          <Tr key={r.s.site_id} selected={r.s.site_id === selected} tabIndex={0}
            onClick={() => pick(r.s.site_id)} onKeyDown={(e) => e.key === 'Enter' && pick(r.s.site_id)}>
            <Td>{r.parent.name}</Td>
            <Td>{r.entity ? `${r.entity.legal_name} (${r.entity.cin || 'no CIN'})` : <span className="text-neutral-500">not yet linked</span>}</Td>
            <Td>{r.city.name}</Td>
            <Td>{r.sector || '-'}</Td>
            <Td>{r.country || '-'}</Td>
            <Td>{r.s.function || '-'}</Td>
            <Td><Badge kind={r.s.confidence} /></Td>
          </Tr>
        ))}
      </Table>

      {sel && (
        <Card className="mt-6">
          <h2 className="font-serif text-lg font-semibold">{sel.parent.name}, {sel.city.name}</h2>
          <Muted>
            HQ {sel.country || '?'} · {sel.sector || 'sector?'} · maturity {sel.s.maturity_stage || 'not assessed'}
            {sel.s.maturity_framework && ` (${sel.s.maturity_framework})`}
          </Muted>
          <Section title="Site"><FactTable subject={`site:${sel.s.site_id}`} /></Section>
          <Section title="Company"><FactTable subject={`parent:${sel.parent.parent_id}`} /></Section>
          {sel.entity && <Section title="Legal entity"><FactTable subject={`entity:${sel.entity.entity_id}`} /></Section>}
        </Card>
      )}
    </>
  );
}
