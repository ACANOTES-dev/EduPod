import type { KpiCalculatorResult, PrismaTransaction } from './kpi-types';

/**
 * KPI #7: Grades submission lag.
 *
 * Counts `Assessment` rows whose `grading_deadline` has passed and whose
 * grades have not yet been published (`grades_published_at IS NULL`).
 * Compared week-on-week.
 */
export async function calculateGradesSubmissionLag(
  tx: PrismaTransaction,
  tenantId: string,
): Promise<KpiCalculatorResult> {
  const now = new Date();

  const overdueCount = await tx.assessment.count({
    where: {
      tenant_id: tenantId,
      grading_deadline: { lt: now },
      grades_published_at: null,
    },
  });

  const oneWeekAgo = new Date(now);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const lastWeekOverdue = await tx.assessment.count({
    where: {
      tenant_id: tenantId,
      grading_deadline: { gte: oneWeekAgo, lt: now },
      grades_published_at: null,
    },
  });

  const delta = {
    value: overdueCount - lastWeekOverdue,
    unit: 'absolute' as const,
    direction:
      overdueCount > lastWeekOverdue
        ? ('up' as const)
        : overdueCount < lastWeekOverdue
          ? ('down' as const)
          : ('flat' as const),
    better_when: 'down' as const,
  };

  return {
    value: overdueCount,
    value_raw: overdueCount,
    delta,
    sparkline: [overdueCount],
    severity: overdueCount > 5 ? 'warning' : null,
  };
}
