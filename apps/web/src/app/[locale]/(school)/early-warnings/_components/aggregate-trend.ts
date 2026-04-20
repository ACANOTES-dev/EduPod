import type { RiskProfileListItem } from '@/lib/early-warning';

/**
 * Averages the per-student trend_data arrays into a single sparkline series.
 * Returns an empty array if no rows have any data — callers should fall back
 * to a value-only render in that case.
 */
export function aggregateTrend(rows: RiskProfileListItem[]): number[] {
  const lengths = rows.map((r) => r.trend_data.length).filter((n) => n > 0);
  if (lengths.length === 0) return [];
  const len = Math.min(...lengths);
  if (len < 2) return [];
  const out: number[] = [];
  for (let i = 0; i < len; i += 1) {
    let sum = 0;
    let count = 0;
    for (const r of rows) {
      const v = r.trend_data[i];
      if (typeof v === 'number') {
        sum += v;
        count += 1;
      }
    }
    out.push(count === 0 ? 0 : sum / count);
  }
  return out;
}
