import type { KpiCalculatorResult, PrismaTransaction } from './kpi-types';

/**
 * KPI #8: New applications this week
 * Count of new admissions applications created this week vs last week.
 */
export async function calculateNewApplicationsWeek(
  tx: PrismaTransaction,
  tenantId: string,
): Promise<KpiCalculatorResult> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const thisWeekCount = await tx.application.count({
    where: {
      tenant_id: tenantId,
      created_at: {
        gte: weekStart,
        lt: new Date(),
      },
    },
  });

  // Compare to last week
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const lastWeekCount = await tx.application.count({
    where: {
      tenant_id: tenantId,
      created_at: {
        gte: lastWeekStart,
        lt: weekStart,
      },
    },
  });

  const delta = {
    value: thisWeekCount - lastWeekCount,
    unit: 'absolute' as const,
    direction:
      thisWeekCount > lastWeekCount
        ? ('up' as const)
        : thisWeekCount < lastWeekCount
          ? ('down' as const)
          : ('flat' as const),
    better_when: 'up' as const,
  };

  return {
    value: thisWeekCount,
    value_raw: thisWeekCount,
    delta,
    sparkline: [thisWeekCount],
    severity: null,
  };
}
