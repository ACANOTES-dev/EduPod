import type { Aggregator } from '../aggregator.types';

/**
 * Percent of teaching staff with a recognised "qualified" status.
 *
 * Per impl 07 spec: the `StaffVettingStatus` enum does NOT include a
 * `qualified` value (members are active, expiring_soon, expired,
 * pending_renewal, revoked — those track vetting currency, not
 * qualification). The spec is explicit that if the qualification field
 * is not yet collected, the aggregator must return `has_gap: true` with
 * `gap_reason: 'qualification_field_not_yet_collected'` rather than
 * fabricate a number. When a dedicated qualification field is added,
 * this aggregator flips to computing the real percentage.
 */
export const qualifiedTeachersPercentAggregator: Aggregator = async () => {
  return {
    value: null,
    has_gap: true,
    gap_reason: 'qualification_field_not_yet_collected',
    last_verified_at: new Date().toISOString(),
  };
};
