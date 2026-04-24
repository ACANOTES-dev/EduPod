import type { KpiCalculatorResult, PrismaTransaction } from './kpi-types';

/**
 * KPI #5: Open safeguarding concerns.
 *
 * Returns the number of open (non-resolved, non-sealed) safeguarding
 * concerns, plus the age in days of the oldest open concern. Card turns
 * critical once the oldest open concern is more than 14 days old.
 *
 * The Prisma enum value for the resolved SafeguardingStatus is
 * `sg_resolved` (mapped to the DB literal `resolved`). We exclude both
 * `sg_resolved` and `sealed` — sealed concerns are archived and should
 * not contribute to the live backlog.
 */
const OPEN_STATUSES = [
  'reported',
  'acknowledged',
  'under_investigation',
  'referred',
  'sg_monitoring',
] as const;

export async function calculateOpenSafeguardingConcerns(
  tx: PrismaTransaction,
  tenantId: string,
): Promise<KpiCalculatorResult> {
  const oldestOpen = await tx.safeguardingConcern.findFirst({
    where: {
      tenant_id: tenantId,
      status: { in: [...OPEN_STATUSES] },
    },
    select: { created_at: true },
    orderBy: { created_at: 'asc' },
  });

  const count = await tx.safeguardingConcern.count({
    where: {
      tenant_id: tenantId,
      status: { in: [...OPEN_STATUSES] },
    },
  });

  const now = new Date();
  const oldestAgeDays = oldestOpen
    ? Math.floor((now.getTime() - oldestOpen.created_at.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const severity: 'normal' | 'warning' | 'critical' | null =
    oldestAgeDays > 14 ? 'critical' : count > 5 ? 'warning' : null;

  return {
    value: count === 0 ? 0 : `${count} (${oldestAgeDays}d oldest)`,
    value_raw: count,
    delta: null,
    sparkline: [count],
    severity,
  };
}
