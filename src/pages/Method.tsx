import type { ReactNode } from 'react';
import { STALE_MONTHS, TIER } from '../logic';
import { Card } from '../components/ui';

const tiers = Object.entries(TIER).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(', ');

const ITEMS: [string, ReactNode][] = [
  ['Units', 'A "GCC" can mean a parent company, an Indian legal entity or a physical site. Every count here states which one it counts. A company with two entities and offices in two cities is 1 company, 2 entities, 2 sites.'],
  ['Receipts', 'Every figure is a claim with a source, a date and a method (manual entry, import, submission or derived). A site or provider engagement with no claim is rejected at build time.'],
  ['Disagreements', "Claims about the same field, unit and period are grouped. If values differ, the field is marked disputed and every value is shown with its source and that source's commercial interest. Nothing is silently picked. The value listed first is ordered by source type, then recency."],
  ['Confidence', `0 to 1: source type weight (${tiers}), plus 0.1 per additional independent agreeing source (max +0.2), minus 0.2 if the newest claim is older than ${STALE_MONTHS} months, minus 0.2 if disputed. High is 0.75 or more, Medium 0.5 to 0.75, Low below 0.5. A site stays at Medium at most until its Indian legal entity is linked.`],
  ['Matching names', 'Company names from government and company registers are matched to companies here by a simple score (shared core name, same state, parent name in legal name). A person reviews every match; nothing is linked automatically except an identical CIN.'],
  ['Providers', 'Ordered by 3 × engagements confirmed by the GCC + 1 × self-reported engagements, then by name. Confirmed and self-reported counts are shown separately. Paid placement is not used, and is stored apart from this ranking. Anonymised case studies are never attributed to a client by guesswork.'],
  ['Corrections', 'Every figure has a "Suggest a correction" link. Corrections are added as new claims, so the earlier claim and the disagreement stay visible.'],
  ['Not stored', 'Director names, personal contact details, individual employees, LinkedIn data.'],
  ['Coverage', 'This registry lists some GCCs, not all. Coverage is shown against the most recent official site count.'],
];

export default function Method() {
  return (
    <Card>
      <h2 className="mb-4 font-serif text-lg font-semibold">How this registry works</h2>
      <dl className="space-y-4 text-sm">
        {ITEMS.map(([title, body]) => (
          <div key={title}>
            <dt className="font-semibold">{title}</dt>
            <dd className="text-neutral-700">{body}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
