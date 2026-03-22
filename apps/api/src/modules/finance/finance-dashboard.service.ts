import { Injectable } from '@nestjs/common';
import type { FinanceDashboardData } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { roundMoney } from './helpers/invoice-status.helper';

@Injectable()
export class FinanceDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardData(tenantId: string): Promise<FinanceDashboardData> {
    // ─── Expected Revenue: sum of all invoice totals (non-void, non-cancelled) ──
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        status: { notIn: ['void', 'cancelled'] },
      },
      select: {
        id: true,
        household_id: true,
        total_amount: true,
        balance_amount: true,
      },
    });

    const expectedRevenue = roundMoney(
      invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0),
    );

    // ─── Received Payments: sum of all posted/refunded payments ──────────────
    const payments = await this.prisma.payment.findMany({
      where: {
        tenant_id: tenantId,
        status: { in: ['posted', 'refunded_partial', 'refunded_full'] },
      },
      select: { amount: true },
    });

    const receivedPayments = roundMoney(
      payments.reduce((sum, p) => sum + Number(p.amount), 0),
    );

    const outstanding = roundMoney(expectedRevenue - receivedPayments);
    const collectionRate = expectedRevenue > 0
      ? roundMoney((receivedPayments / expectedRevenue) * 100)
      : 0;

    // ─── Household Debt Breakdown ────────────────────────────────────────────
    // Group invoices by household, compute per-household outstanding percentage
    const householdTotals = new Map<string, { total: number; balance: number }>();
    for (const inv of invoices) {
      const existing = householdTotals.get(inv.household_id) ?? { total: 0, balance: 0 };
      existing.total += Number(inv.total_amount);
      existing.balance += Number(inv.balance_amount);
      householdTotals.set(inv.household_id, existing);
    }

    const breakdown = { pct_0_10: 0, pct_10_30: 0, pct_30_50: 0, pct_50_plus: 0 };
    for (const [, { total, balance }] of householdTotals) {
      if (total <= 0) continue;
      const pctOwed = (balance / total) * 100;
      if (pctOwed <= 0) continue; // fully paid, skip
      if (pctOwed <= 10) breakdown.pct_0_10++;
      else if (pctOwed <= 30) breakdown.pct_10_30++;
      else if (pctOwed <= 50) breakdown.pct_30_50++;
      else breakdown.pct_50_plus++;
    }

    // ─── Pending Refund Approvals ────────────────────────────────────────────
    const pendingRefundApprovals = await this.prisma.refund.count({
      where: { tenant_id: tenantId, status: 'pending_approval' },
    });

    // ─── Recent Payments ─────────────────────────────────────────────────────
    const recentPayments = await this.prisma.payment.findMany({
      where: { tenant_id: tenantId },
      orderBy: { received_at: 'desc' },
      take: 10,
      include: {
        household: {
          select: { id: true, household_name: true },
        },
      },
    });

    return {
      expected_revenue: expectedRevenue,
      received_payments: receivedPayments,
      outstanding,
      collection_rate: collectionRate,
      household_debt_breakdown: breakdown,
      pending_refund_approvals: pendingRefundApprovals,
      recent_payments: recentPayments.map((p) => ({
        id: p.id,
        payment_reference: p.payment_reference,
        amount: Number(p.amount),
        household_id: p.household.id,
        household_name: p.household.household_name,
        received_at: p.received_at.toISOString(),
        status: p.status,
      })),
    };
  }
}
