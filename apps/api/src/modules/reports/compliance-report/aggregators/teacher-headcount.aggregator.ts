import type { Aggregator } from '../aggregator.types';

/**
 * Count of active teaching staff. "Teaching" = staff with a `job_title`
 * matching the standard teacher titles used across the product. The
 * product does not yet have an `is_teacher` boolean column — this
 * matches the convention used by the staff-analytics service.
 */
const TEACHER_JOB_TITLES = [
  'Teacher',
  'Class Teacher',
  'Subject Teacher',
  'Head of Department',
  'SNA',
  'Vice Principal',
  'Deputy Principal',
  'Principal',
];

export const teacherHeadcountAggregator: Aggregator = async (tx, ctx) => {
  const count = await tx.staffProfile.count({
    where: {
      tenant_id: ctx.tenantId,
      employment_status: 'active',
      job_title: { in: TEACHER_JOB_TITLES },
    },
  });

  if (count === 0) {
    return {
      value: 0,
      has_gap: true,
      gap_reason: 'no_staff_with_recognised_teacher_job_title',
      last_verified_at: new Date().toISOString(),
    };
  }

  return {
    value: count,
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};

export { TEACHER_JOB_TITLES };
