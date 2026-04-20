import type { RiskProfileListItem, RiskTier, SignalDomain } from '@/lib/early-warning';

export type InsightTier = Extract<RiskTier, 'red' | 'amber'>;

export interface Theme {
  key:
    | 'concentrated_year_group'
    | 'concentrated_class'
    | 'dominant_domain'
    | 'upward_trend'
    | 'unassigned_reds';
  weight: number;
  params: Record<string, string | number>;
}

export interface InsightSummary {
  flagged_total: number;
  red_total: number;
  amber_total: number;
  themes: Theme[];
}

const RISK_TIERS: InsightTier[] = ['red', 'amber'];

function isFlagged(
  row: RiskProfileListItem,
): row is RiskProfileListItem & { risk_tier: InsightTier } {
  return (RISK_TIERS as readonly RiskTier[]).includes(row.risk_tier);
}

function inferDomainFromSignal(signal: string | null): SignalDomain | null {
  if (!signal) return null;
  const lower = signal.toLowerCase();
  if (lower.includes('attendance') || lower.includes('absent') || lower.includes('late')) {
    return 'attendance';
  }
  if (lower.includes('grade') || lower.includes('score') || lower.includes('mark')) {
    return 'grades';
  }
  if (lower.includes('behaviour') || lower.includes('incident') || lower.includes('sanction')) {
    return 'behaviour';
  }
  if (lower.includes('wellbeing') || lower.includes('mood') || lower.includes('concern')) {
    return 'wellbeing';
  }
  if (
    lower.includes('engagement') ||
    lower.includes('participation') ||
    lower.includes('homework')
  ) {
    return 'engagement';
  }
  return null;
}

function isTrendingUp(trend: number[]): boolean {
  if (trend.length < 3) return false;
  const head = trend.slice(0, Math.ceil(trend.length / 3));
  const tail = trend.slice(-Math.ceil(trend.length / 3));
  const avg = (xs: number[]): number =>
    xs.length === 0 ? 0 : xs.reduce((acc, x) => acc + x, 0) / xs.length;
  return avg(tail) - avg(head) >= 5;
}

/**
 * Derives 0-3 narrative "themes" from a list of flagged students, without an
 * LLM. Used as a deterministic stand-in until the AI narrative endpoint ships.
 */
export function computeInsights(rows: RiskProfileListItem[]): InsightSummary {
  const flagged = rows.filter(isFlagged);
  const red = flagged.filter((r) => r.risk_tier === 'red');
  const amber = flagged.filter((r) => r.risk_tier === 'amber');

  const themes: Theme[] = [];

  // 1. Year-group concentration — if > 40% of flagged sit in one year group.
  const yearCounts = new Map<string, number>();
  for (const r of flagged) {
    const label = r.year_group_name ?? '';
    if (!label) continue;
    yearCounts.set(label, (yearCounts.get(label) ?? 0) + 1);
  }
  const topYear = [...yearCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topYear && flagged.length >= 3 && topYear[1] / flagged.length >= 0.4) {
    themes.push({
      key: 'concentrated_year_group',
      weight: topYear[1] / flagged.length,
      params: { year_group: topYear[0], count: topYear[1], total: flagged.length },
    });
  }

  // 2. Class concentration — similar rule but needs ≥ 3 in one class.
  const classCounts = new Map<string, number>();
  for (const r of flagged) {
    const label = r.class_name ?? '';
    if (!label) continue;
    classCounts.set(label, (classCounts.get(label) ?? 0) + 1);
  }
  const topClass = [...classCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topClass && topClass[1] >= 3) {
    themes.push({
      key: 'concentrated_class',
      weight: topClass[1] / Math.max(flagged.length, 1),
      params: { class_name: topClass[0], count: topClass[1] },
    });
  }

  // 3. Dominant indicator domain — if a single domain owns ≥ 40% of signals.
  const domainCounts = new Map<SignalDomain, number>();
  for (const r of flagged) {
    const d = inferDomainFromSignal(r.top_signal);
    if (!d) continue;
    domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
  }
  const topDomain = [...domainCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const classifiedTotal = [...domainCounts.values()].reduce((acc, n) => acc + n, 0);
  if (topDomain && classifiedTotal >= 3 && topDomain[1] / classifiedTotal >= 0.4) {
    themes.push({
      key: 'dominant_domain',
      weight: topDomain[1] / classifiedTotal,
      params: { domain: topDomain[0], count: topDomain[1] },
    });
  }

  // 4. Upward trend — how many students' composite is rising.
  const trendingUpCount = flagged.filter((r) => isTrendingUp(r.trend_data)).length;
  if (flagged.length >= 5 && trendingUpCount / flagged.length >= 0.3) {
    themes.push({
      key: 'upward_trend',
      weight: trendingUpCount / flagged.length,
      params: { count: trendingUpCount, total: flagged.length },
    });
  }

  // 5. Unassigned reds — operational theme.
  const unassignedReds = red.filter((r) => !r.assigned_to_name).length;
  if (unassignedReds > 0) {
    themes.push({
      key: 'unassigned_reds',
      weight: unassignedReds / Math.max(red.length, 1),
      params: { count: unassignedReds },
    });
  }

  themes.sort((a, b) => b.weight - a.weight);

  return {
    flagged_total: flagged.length,
    red_total: red.length,
    amber_total: amber.length,
    themes: themes.slice(0, 3),
  };
}

// ─── Domain filtering helper ─────────────────────────────────────────────────

export function filterByDomain(
  rows: RiskProfileListItem[],
  domain: SignalDomain | 'all',
): RiskProfileListItem[] {
  if (domain === 'all') return rows;
  return rows.filter((r) => inferDomainFromSignal(r.top_signal) === domain);
}

// ─── Year-group cohort breakdown ─────────────────────────────────────────────

export interface YearGroupRow {
  year_group: string;
  red: number;
  amber: number;
  total: number;
}

export function groupByYearTier(rows: RiskProfileListItem[]): YearGroupRow[] {
  const map = new Map<string, YearGroupRow>();
  for (const r of rows) {
    if (!isFlagged(r)) continue;
    const key = r.year_group_name ?? '—';
    const current = map.get(key) ?? { year_group: key, red: 0, amber: 0, total: 0 };
    if (r.risk_tier === 'red') current.red += 1;
    else if (r.risk_tier === 'amber') current.amber += 1;
    current.total += 1;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export interface ClassRow {
  class_name: string;
  year_group: string | null;
  at_risk: number;
}

export function topClassesByAtRisk(rows: RiskProfileListItem[], limit = 10): ClassRow[] {
  const map = new Map<string, ClassRow>();
  for (const r of rows) {
    if (!isFlagged(r) || !r.class_name) continue;
    const key = r.class_name;
    const current = map.get(key) ?? {
      class_name: key,
      year_group: r.year_group_name,
      at_risk: 0,
    };
    current.at_risk += 1;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.at_risk - a.at_risk).slice(0, limit);
}
