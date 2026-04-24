import type { Aggregator } from '../aggregator.types';

/**
 * Sum of scheduled instruction hours this academic year.
 *
 * We currently have no structured column that records session duration
 * — `AttendanceSession` tracks date + class + teacher but not start/end
 * times. The schedule system stores periods on a `schedule_period_template`
 * and assigns them to sessions implicitly, but there is no cross-cutting
 * "how many minutes" aggregate available without walking several joins
 * that aren't all guaranteed to be populated.
 *
 * Per the spec (§2 field 18) honest gaps are preferred to fabricated
 * numbers. We return `has_gap: true` with a stable reason so regulators
 * know the column is deliberately absent — and the frontend can render
 * the yellow "awaiting data source" treatment.
 *
 * TODO(post-Wave-2): once the schedule-period → session link is
 * populated uniformly, replace this with a real sum.
 */
export const instructionHoursHeldAggregator: Aggregator = async () => {
  return {
    value: null,
    has_gap: true,
    gap_reason: 'session_duration_field_not_yet_collected',
    last_verified_at: new Date().toISOString(),
  };
};
