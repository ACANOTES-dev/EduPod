import type { Aggregator } from '../aggregator.types';

/**
 * Count of teacher-absence days this academic year that have no
 * substitution record. `teacher_absence.absence_date` is the date, and
 * `substitution_records.absence_id` links cover → absence. Absences
 * with at least one non-cancelled substitution record are counted as
 * "covered"; the remainder are counted here.
 *
 * We exclude cancelled absences (`cancelled_at IS NOT NULL`) because a
 * cancelled absence never happened — no cover was needed.
 */
export const teacherAbsenceDaysUncoveredAggregator: Aggregator = async (tx, ctx) => {
  const count = await tx.teacherAbsence.count({
    where: {
      tenant_id: ctx.tenantId,
      cancelled_at: null,
      absence_date: {
        gte: ctx.academicYear.start_date,
        lte: ctx.academicYear.end_date,
      },
      substitution_records: { none: {} },
    },
  });

  return {
    value: count,
    has_gap: false,
    last_verified_at: new Date().toISOString(),
  };
};
