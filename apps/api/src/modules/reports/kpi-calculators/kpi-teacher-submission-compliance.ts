import type { KpiCalculatorResult, PrismaTransaction } from './kpi-types';

/**
 * KPI #2: Teacher submission compliance.
 *
 * For this week: `(submitted + locked) / (all non-cancelled sessions)`
 * where the sessions are any `AttendanceSession` rows whose
 * `session_date` falls inside the current ISO week.
 *
 * Compared against the same ratio for the previous ISO week.
 */
const SUBMITTED_STATUSES = ['submitted', 'locked'] as const;

export async function calculateTeacherSubmissionCompliance(
  tx: PrismaTransaction,
  tenantId: string,
): Promise<KpiCalculatorResult> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const [expectedThisWeek, submittedThisWeek] = await Promise.all([
    tx.attendanceSession.count({
      where: {
        tenant_id: tenantId,
        session_date: { gte: weekStart, lt: now },
        status: { not: 'cancelled' },
      },
    }),
    tx.attendanceSession.count({
      where: {
        tenant_id: tenantId,
        session_date: { gte: weekStart, lt: now },
        status: { in: [...SUBMITTED_STATUSES] },
      },
    }),
  ]);

  const complianceRate = expectedThisWeek > 0 ? (submittedThisWeek / expectedThisWeek) * 100 : 0;

  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const [expectedLastWeek, submittedLastWeek] = await Promise.all([
    tx.attendanceSession.count({
      where: {
        tenant_id: tenantId,
        session_date: { gte: lastWeekStart, lt: weekStart },
        status: { not: 'cancelled' },
      },
    }),
    tx.attendanceSession.count({
      where: {
        tenant_id: tenantId,
        session_date: { gte: lastWeekStart, lt: weekStart },
        status: { in: [...SUBMITTED_STATUSES] },
      },
    }),
  ]);

  const lastWeekRate = expectedLastWeek > 0 ? (submittedLastWeek / expectedLastWeek) * 100 : 0;

  const delta = {
    value: Number((complianceRate - lastWeekRate).toFixed(1)),
    unit: 'percent' as const,
    direction:
      complianceRate > lastWeekRate
        ? ('up' as const)
        : complianceRate < lastWeekRate
          ? ('down' as const)
          : ('flat' as const),
    better_when: 'up' as const,
  };

  return {
    value: `${complianceRate.toFixed(1)}%`,
    value_raw: Number(complianceRate.toFixed(1)),
    delta,
    sparkline: [Number(complianceRate.toFixed(1))],
    severity: complianceRate < 80 ? 'warning' : null,
  };
}
