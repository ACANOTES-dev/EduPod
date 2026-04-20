/**
 * Pure-logic tests for the AI student summary period-range helper (impl 19).
 */

import { PERIOD_PRESETS, resolvePeriodRange } from './ai-student-summary-projection';

describe('resolvePeriodRange', () => {
  const anchor = new Date('2026-04-20T12:00:00Z');

  it('30-day preset gives today + 29 days back', () => {
    const { from, to } = resolvePeriodRange('30', anchor);
    expect(to).toBe('2026-04-20');
    expect(from).toBe('2026-03-22');
  });

  it('90-day preset gives today + 89 days back', () => {
    const { from, to } = resolvePeriodRange('90', anchor);
    expect(to).toBe('2026-04-20');
    expect(from).toBe('2026-01-21');
  });

  it('180-day preset gives today + 179 days back', () => {
    const { from, to } = resolvePeriodRange('180', anchor);
    expect(to).toBe('2026-04-20');
    expect(from).toBe('2025-10-23');
  });

  it('handles year rollover in UTC', () => {
    const earlyJan = new Date('2026-01-05T12:00:00Z');
    const { from, to } = resolvePeriodRange('30', earlyJan);
    expect(to).toBe('2026-01-05');
    expect(from).toBe('2025-12-07');
  });

  it('uses UTC (not local TZ) to stay deterministic across server / browser', () => {
    // A moment at UTC midnight — local time zones would shift the day
    const midnight = new Date('2026-04-20T00:00:00Z');
    expect(resolvePeriodRange('30', midnight).to).toBe('2026-04-20');
  });

  it('exports a canonical preset list', () => {
    expect(PERIOD_PRESETS).toEqual(['30', '90', '180']);
  });
});
