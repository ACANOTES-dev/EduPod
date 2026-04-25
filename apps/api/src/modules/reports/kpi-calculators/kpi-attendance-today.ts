import type { KpiCalculatorResult, PrismaTransaction } from './kpi-types';

/**
 * KPI #1: Attendance today.
 *
 * Computes today's `present_sessions / expected_sessions` percentage
 * from `AttendanceRecord` rows whose parent `AttendanceSession` has
 * `session_date = today`. Records with status `present`, `late`, or
 * `left_early` all count as present (they attended at some point).
 *
 * The delta compares today's rate to the 7-school-day rolling average
 * preceding today. When no prior data exists the delta is `null` so the
 * UI can render a neutral state instead of a misleading 0.
 */
const PRESENT_STATUSES = ['present', 'late', 'left_early'] as const;

export async function calculateAttendanceToday(
  tx: PrismaTransaction,
  tenantId: string,
): Promise<KpiCalculatorResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayStats = await tx.attendanceRecord.groupBy({
    by: ['status'],
    where: {
      tenant_id: tenantId,
      session: {
        session_date: { gte: today, lt: tomorrow },
      },
    },
    _count: true,
  });

  const presentCount = todayStats
    .filter((g) => (PRESENT_STATUSES as readonly string[]).includes(g.status))
    .reduce((sum, g) => sum + g._count, 0);
  const totalCount = todayStats.reduce((sum, g) => sum + g._count, 0);
  const todayRate = totalCount > 0 ? (presentCount / totalCount) * 100 : 0;

  // 7 school days rolling average — use calendar days here for simplicity.
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const rollingStats = await tx.attendanceRecord.groupBy({
    by: ['status'],
    where: {
      tenant_id: tenantId,
      session: {
        session_date: { gte: sevenDaysAgo, lt: today },
      },
    },
    _count: true,
  });

  const rollingPresent = rollingStats
    .filter((g) => (PRESENT_STATUSES as readonly string[]).includes(g.status))
    .reduce((sum, g) => sum + g._count, 0);
  const rollingTotal = rollingStats.reduce((sum, g) => sum + g._count, 0);
  const rollingRate = rollingTotal > 0 ? (rollingPresent / rollingTotal) * 100 : 0;

  // Delta is only meaningful when BOTH today AND the rolling window have data.
  // Without today's records (e.g. a school holiday or before any registers go in),
  // any "delta vs rolling" reduces to -rollingRate% which renders as "−99.9%" on
  // the dashboard against a blank value — confusing more than it informs.
  const delta =
    rollingTotal > 0 && totalCount > 0
      ? {
          value: Number((todayRate - rollingRate).toFixed(1)),
          unit: 'percent' as const,
          direction:
            todayRate > rollingRate
              ? ('up' as const)
              : todayRate < rollingRate
                ? ('down' as const)
                : ('flat' as const),
          better_when: 'up' as const,
        }
      : null;

  return {
    value: totalCount === 0 ? '—' : `${todayRate.toFixed(1)}%`,
    value_raw: Number(todayRate.toFixed(1)),
    delta,
    sparkline: [Number(todayRate.toFixed(1))],
    severity: totalCount === 0 ? null : todayRate < 80 ? 'warning' : null,
  };
}
