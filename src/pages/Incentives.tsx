import { useContext } from 'react';
import { DbCtx, Fact, label } from '../Fact';
import { ExtLink, Muted, Table, Td } from '../components/ui';

export default function Incentives() {
  const { policies, facts } = useContext(DbCtx);
  if (!policies.length) return <Muted>No policies in data/policies.csv yet.</Muted>;
  const fields = [...new Set(policies.flatMap((p) => Object.keys(facts[`policy:${p.policy_id}`] ?? {})))].sort();
  return (
    <>
      <Muted className="mb-3">Each cell is a sourced claim; open it for the page reference. "No published figure" means none was found, not zero.</Muted>
      <Table head={['Incentive', ...policies.map((p) => (
        <span key={p.policy_id} className="normal-case tracking-normal">
          <span className="block uppercase tracking-wide">{p.state}</span>
          <ExtLink href={p.doc_url}>{p.name}</ExtLink> {p.period}
        </span>
      ))]}>
        {fields.map((f) => (
          <tr key={f}>
            <Td className="font-medium">{label(f)}</Td>
            {policies.map((p) => {
              const gs = facts[`policy:${p.policy_id}`]?.[f];
              return (
                <Td key={p.policy_id}>
                  {gs ? gs.map((g) => <Fact key={g.unit + g.period} g={g} />) : <span className="text-neutral-500">No published figure</span>}
                </Td>
              );
            })}
          </tr>
        ))}
      </Table>
    </>
  );
}
