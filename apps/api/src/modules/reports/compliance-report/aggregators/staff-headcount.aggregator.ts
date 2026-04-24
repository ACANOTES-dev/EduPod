import type { Aggregator } from '../aggregator.types';

/**
 * Active staff headcount. "Active" is `StaffProfile.employment_status =
 * 'active'` — consistent with the board report and staff-analytics.
 */
export const staffHeadcountAggregator: Aggregator = async (tx, ctx) => {
  const count = await tx.staffProfile.count({
    where: {
      tenant_id: ctx.tenantId,
      employment_status: 'active',
    },
  });

  return {
    value: count,
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};
