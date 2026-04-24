import type { Aggregator } from '../aggregator.types';

/**
 * Percentage of staff whose vetting is currently valid. "Current" =
 * StaffVettingStatus = 'active' AND expiry_date >= today. Excludes
 * expiring_soon, expired, pending_renewal, revoked.
 *
 * Numerator: distinct staff with any current vetting.
 * Denominator: distinct active staff — if never vetted, they drag the
 * percentage down.
 */
export const vettingCurrentPercentAggregator: Aggregator = async (tx, ctx) => {
  const activeStaffCount = await tx.staffProfile.count({
    where: {
      tenant_id: ctx.tenantId,
      employment_status: 'active',
    },
  });

  if (activeStaffCount === 0) {
    return {
      value: null,
      has_gap: true,
      gap_reason: 'no_active_staff',
      last_verified_at: new Date().toISOString(),
    };
  }

  const now = new Date();
  const currentVettingStaff = await tx.staffVettingRecord.findMany({
    where: {
      tenant_id: ctx.tenantId,
      status: 'active',
      expiry_date: { gte: now },
      user: {
        staff_profiles: {
          some: { tenant_id: ctx.tenantId, employment_status: 'active' },
        },
      },
    },
    select: { user_id: true },
    distinct: ['user_id'],
  });

  const percent = Number(((currentVettingStaff.length / activeStaffCount) * 100).toFixed(2));

  return {
    value: percent,
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};
