/**
 * Pure helpers for the AI student summary panel (impl 19).
 * Extracted so period-range math is unit-tested without mounting React.
 */

export type PeriodPreset = '30' | '90' | '180';

export const PERIOD_PRESETS: readonly PeriodPreset[] = ['30', '90', '180'] as const;

export interface PeriodRange {
  from: string;
  to: string;
}

/**
 * Resolve a preset into an inclusive ISO-date range covering the last N days.
 * `to` is today (UTC), `from` is today minus N-1 days so an N-day window
 * includes today.
 */
export function resolvePeriodRange(preset: PeriodPreset, now: Date = new Date()): PeriodRange {
  const days = Number(preset);
  const to = toIsoDate(now);
  const fromDate = new Date(now.getTime());
  fromDate.setUTCDate(fromDate.getUTCDate() - (days - 1));
  const from = toIsoDate(fromDate);
  return { from, to };
}

function toIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
