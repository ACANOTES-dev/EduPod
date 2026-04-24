import type { KpiCalculatorResult, PrismaTransaction } from './kpi-types';

/**
 * KPI #10: Cover gaps this week.
 *
 * Counts `TeacherAbsence` rows whose `absence_date` falls inside the
 * current ISO week and that have no `SubstitutionRecord` cover assigned.
 * Cancelled absences (`cancelled_at IS NOT NULL`) are ignored.
 *
 * This is a "state" KPI — no meaningful delta, so we omit it (null)
 * and ship with a length-1 sparkline until the snapshot job lands in a
 * later cycle (documented in impl 03 follow-ups).
 */
export async function calculateCoverGapsWeek(
  tx: PrismaTransaction,
  tenantId: string,
): Promise<KpiCalculatorResult> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const absencesWithoutCover = await tx.teacherAbsence.count({
    where: {
      tenant_id: tenantId,
      absence_date: {
        gte: weekStart,
        lt: weekEnd,
      },
      cancelled_at: null,
      substitution_records: {
        none: {},
      },
    },
  });

  return {
    value: absencesWithoutCover,
    value_raw: absencesWithoutCover,
    delta: null,
    sparkline: [absencesWithoutCover],
    severity: absencesWithoutCover > 10 ? 'warning' : null,
  };
}
