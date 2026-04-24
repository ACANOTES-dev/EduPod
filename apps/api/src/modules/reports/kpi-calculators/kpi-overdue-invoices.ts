import type { KpiCalculatorResult, PrismaTransaction } from './kpi-types';

/**
 * KPI #6: Overdue invoices.
 *
 * `value_raw` is the total count of invoices currently past due with a
 * positive outstanding balance. Void/cancelled/written-off invoices are
 * excluded. Week-on-week delta compares newly-overdue invoices (those
 * whose `due_date` fell inside the past 7 days) against the 7 days
 * before that — a proxy for the month-to-month trend which is what the
 * principal cares about.
 */
const ACTIVE_INVOICE_STATUSES = ['issued', 'partially_paid', 'overdue'] as const;

export async function calculateOverdueInvoices(
  tx: PrismaTransaction,
  tenantId: string,
): Promise<KpiCalculatorResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const [currentCount, thisWeekOverdue, lastWeekOverdue] = await Promise.all([
    tx.invoice.count({
      where: {
        tenant_id: tenantId,
        due_date: { lt: today },
        balance_amount: { gt: 0 },
        status: { in: [...ACTIVE_INVOICE_STATUSES] },
      },
    }),
    tx.invoice.count({
      where: {
        tenant_id: tenantId,
        due_date: { gte: oneWeekAgo, lt: today },
        balance_amount: { gt: 0 },
        status: { in: [...ACTIVE_INVOICE_STATUSES] },
      },
    }),
    tx.invoice.count({
      where: {
        tenant_id: tenantId,
        due_date: { gte: twoWeeksAgo, lt: oneWeekAgo },
        balance_amount: { gt: 0 },
        status: { in: [...ACTIVE_INVOICE_STATUSES] },
      },
    }),
  ]);

  const delta = {
    value: thisWeekOverdue - lastWeekOverdue,
    unit: 'absolute' as const,
    direction:
      thisWeekOverdue > lastWeekOverdue
        ? ('up' as const)
        : thisWeekOverdue < lastWeekOverdue
          ? ('down' as const)
          : ('flat' as const),
    better_when: 'down' as const,
  };

  return {
    value: currentCount,
    value_raw: currentCount,
    delta,
    sparkline: [currentCount],
    severity: currentCount > 10 ? 'warning' : null,
  };
}
