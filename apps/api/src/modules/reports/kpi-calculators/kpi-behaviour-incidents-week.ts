import type { KpiCalculatorResult, PrismaTransaction } from './kpi-types';

/**
 * KPI #4: Behaviour incidents this week.
 *
 * Count new `behaviour_incident` records whose `occurred_at` falls inside
 * the current ISO week (Monday 00:00 → today), excluding reversed/appealed
 * records. Compared against the prior 7-day rolling average.
 */
const EXCLUDED_INCIDENT_STATUSES = ['withdrawn', 'closed_after_appeal', 'superseded'] as const;

export async function calculateBehaviourIncidentsWeek(
  tx: PrismaTransaction,
  tenantId: string,
): Promise<KpiCalculatorResult> {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const thisWeekCount = await tx.behaviourIncident.count({
    where: {
      tenant_id: tenantId,
      occurred_at: {
        gte: weekStart,
        lt: now,
      },
      status: { notIn: [...EXCLUDED_INCIDENT_STATUSES] },
    },
  });

  // 7-day rolling average of preceding week (daily incident count averaged)
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const rollingCount = await tx.behaviourIncident.count({
    where: {
      tenant_id: tenantId,
      occurred_at: {
        gte: sevenDaysAgo,
        lt: now,
      },
      status: { notIn: [...EXCLUDED_INCIDENT_STATUSES] },
    },
  });
  const sevenDayAverage = rollingCount / 7;

  const delta = {
    value: Number((thisWeekCount - sevenDayAverage).toFixed(1)),
    unit: 'absolute' as const,
    direction:
      thisWeekCount > sevenDayAverage
        ? ('up' as const)
        : thisWeekCount < sevenDayAverage
          ? ('down' as const)
          : ('flat' as const),
    better_when: 'down' as const,
  };

  return {
    value: thisWeekCount,
    value_raw: thisWeekCount,
    delta,
    sparkline: [thisWeekCount],
    severity: thisWeekCount > 20 ? 'warning' : null,
  };
}
