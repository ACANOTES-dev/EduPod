import type { KpiCalculatorResult, PrismaTransaction } from './kpi-types';

/**
 * KPI #3: New at-risk students this week.
 *
 * Counts `student_academic_risk_alert` rows whose `created_at` falls
 * inside the current ISO week — i.e. students newly flagged as at-risk.
 * Compared to the previous ISO week as an absolute delta.
 */
export async function calculateAtRiskStudentsNew(
  tx: PrismaTransaction,
  tenantId: string,
): Promise<KpiCalculatorResult> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const [thisWeekCount, lastWeekCount] = await Promise.all([
    tx.studentAcademicRiskAlert.count({
      where: {
        tenant_id: tenantId,
        created_at: { gte: weekStart, lt: now },
      },
    }),
    tx.studentAcademicRiskAlert.count({
      where: {
        tenant_id: tenantId,
        created_at: { gte: lastWeekStart, lt: weekStart },
      },
    }),
  ]);

  const delta = {
    value: thisWeekCount - lastWeekCount,
    unit: 'absolute' as const,
    direction:
      thisWeekCount > lastWeekCount
        ? ('up' as const)
        : thisWeekCount < lastWeekCount
          ? ('down' as const)
          : ('flat' as const),
    better_when: 'down' as const,
  };

  return {
    value: thisWeekCount,
    value_raw: thisWeekCount,
    delta,
    sparkline: [thisWeekCount],
    severity: thisWeekCount > 10 ? 'warning' : null,
  };
}
