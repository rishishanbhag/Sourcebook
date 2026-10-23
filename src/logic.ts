// Pure rules shared by the build script and the UI. The Method page describes these in words.
import type { Claim, FactGroup, Level, Row } from './types';

export const TIER: Record<string, number> = {
  govt: 0.9,
  industry_body: 0.7,
  consultant: 0.6,
  broker: 0.6,
  gcc: 0.6,
  press: 0.5,
  company: 0.5,
  submission: 0.4,
};

export const STALE_MONTHS = 24;

// "YYYY", "YYYY-MM" or "YYYY-MM-DD"
export const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

export function monthsSince(date: string, today: Date): number {
  const [y, m = '1'] = date.split('-');
  return (today.getFullYear() - Number(y)) * 12 + (today.getMonth() + 1 - Number(m));
}

// "~1,700", "about 1700" and "1700" are the same value.
export function normValue(v: string): string {
  return v.toLowerCase().replace(/^about\s+/, '').replace(/[,~\s]/g, '');
}

export function level(c: number): Level {
  return c >= 0.75 ? 'High' : c >= 0.5 ? 'Medium' : 'Low';
}

const tierOf = (c: Claim, sources: Record<string, Row>) => TIER[sources[c.source_id]?.type] ?? 0;

// Claims must already share subject, field, unit and period.
export function resolveGroup(claims: Claim[], sources: Record<string, Row>, today: Date): FactGroup {
  const sorted = [...claims].sort(
    (a, b) => tierOf(b, sources) - tierOf(a, sources) || b.source_date.localeCompare(a.source_date),
  );
  const preferred = sorted[0];
  const values = new Set(sorted.map((c) => normValue(c.value)));
  const disputed = values.size > 1;
  const newest = sorted.map((c) => c.source_date).sort().at(-1)!;
  const stale = monthsSince(newest, today) > STALE_MONTHS ? 0.2 : 0;

  let confidence = tierOf(preferred, sources) - stale;
  if (disputed) confidence -= 0.2;
  else confidence += 0.1 * Math.min(2, new Set(sorted.map((c) => c.source_id)).size - 1);
  confidence = Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100;

  return {
    field: preferred.field,
    unit: preferred.unit,
    period: preferred.period,
    status: disputed ? 'disputed' : sorted.length > 1 ? 'agree' : 'single',
    confidence,
    level: level(confidence),
    preferred,
    claims: sorted,
  };
}

// Organic ranking. Reads engagements only; sponsorships are never an input.
export function rankProviders(providers: Row[], engagements: Row[]) {
  return providers
    .map((p) => {
      const mine = engagements.filter((e) => e.provider_id === p.provider_id);
      const confirmed = mine.filter((e) => e.status === 'gcc_confirmed').length;
      const selfReported = mine.filter((e) => e.status === 'self_reported').length;
      const disputed = mine.filter((e) => e.status === 'disputed').length;
      return { provider: p, confirmed, selfReported, disputed, score: confirmed * 3 + selfReported };
    })
    .filter((r) => r.confirmed + r.selfReported + r.disputed > 0)
    .sort((a, b) => b.score - a.score || a.provider.name.localeCompare(b.provider.name));
}
