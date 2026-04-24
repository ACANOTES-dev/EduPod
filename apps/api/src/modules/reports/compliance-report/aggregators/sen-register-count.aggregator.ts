import type { Aggregator } from '../aggregator.types';

/**
 * Students on the SEN register this academic year. Counts distinct
 * `sen_profile_id` from `sen_support_plan` rows filtered by the plan's
 * `academic_year_id` — a student may have several plan versions in a
 * year and we want the head count of students, not plans.
 */
export const senRegisterCountAggregator: Aggregator = async (tx, ctx) => {
  const plans = await tx.senSupportPlan.findMany({
    where: {
      tenant_id: ctx.tenantId,
      academic_year_id: ctx.academicYear.id,
    },
    select: { sen_profile_id: true },
    distinct: ['sen_profile_id'],
  });

  return {
    value: plans.length,
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};
