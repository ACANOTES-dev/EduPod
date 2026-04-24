import type { Aggregator } from '../aggregator.types';

import { TEACHER_JOB_TITLES } from './teacher-headcount.aggregator';

/**
 * Pupil:teacher ratio = active_students / active_teachers. Expressed as
 * a single decimal number (e.g. 12.5 for 1:12.5). Gap when the tenant
 * has zero teachers with a recognised title — we refuse to divide by
 * zero.
 */
export const pupilTeacherRatioAggregator: Aggregator = async (tx, ctx) => {
  const [students, teachers] = await Promise.all([
    tx.student.count({
      where: { tenant_id: ctx.tenantId, status: 'active' },
    }),
    tx.staffProfile.count({
      where: {
        tenant_id: ctx.tenantId,
        employment_status: 'active',
        job_title: { in: TEACHER_JOB_TITLES },
      },
    }),
  ]);

  if (teachers === 0) {
    return {
      value: null,
      has_gap: true,
      gap_reason: 'no_active_teachers_to_divide_by',
      last_verified_at: new Date().toISOString(),
    };
  }

  return {
    value: Number((students / teachers).toFixed(2)),
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};
