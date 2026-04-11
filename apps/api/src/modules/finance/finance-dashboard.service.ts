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

    const receivedPayments = roundMoney(payments.reduce((sum, p) => sum + Number(p.amount), 0));

    const outstanding = roundMoney(expectedRevenue - receivedPayments);
    const collectionRate =
      expectedRevenue > 0 ? roundMoney((receivedPayments / expectedRevenue) * 100) : 0;

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

    // ─── Invoice Status Counts ─────────────────────────────────────────────
    const invoiceStatusRows = await this.prisma.invoice.groupBy({
      by: ['status'],
      where: { tenant_id: tenantId },
      _count: { id: true },
    });

    const invoiceStatusCounts: Record<string, number> = {
      draft: 0,
      pending_approval: 0,
      issued: 0,
      partially_paid: 0,
      paid: 0,
      overdue: 0,
      void: 0,
      cancelled: 0,
      written_off: 0,
    };
    for (const row of invoiceStatusRows) {
      invoiceStatusCounts[row.status] = row._count.id;
    }

    // ─── Aging Summary ─────────────────────────────────��────────────────────
    const now = new Date();
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        status: { in: ['issued', 'partially_paid', 'overdue'] },
        due_date: { lt: now },
        balance_amount: { gt: 0 },
      },
      select: {
        id: true,
        invoice_number: true,
        total_amount: true,
        balance_amount: true,
        due_date: true,
        household: { select: { id: true, household_name: true } },
      },
      orderBy: { due_date: 'asc' },
    });

    const agingBuckets = {
      current: { total: 0, count: 0 },
      '1_30': { total: 0, count: 0 },
      '31_60': { total: 0, count: 0 },
      '61_90': { total: 0, count: 0 },
      '90_plus': { total: 0, count: 0 },
    };

    // Current invoices (not yet overdue)
    const currentInvoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        status: { in: ['issued', 'partially_paid'] },
        due_date: { gte: now },
        balance_amount: { gt: 0 },
      },
      select: { balance_amount: true },
    });
    agingBuckets.current.total = roundMoney(
      currentInvoices.reduce((s, i) => s + Number(i.balance_amount), 0),
    );
    agingBuckets.current.count = currentInvoices.length;

    for (const inv of overdueInvoices) {
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24),
      );
      const balance = Number(inv.balance_amount);
      if (daysOverdue <= 30) {
        agingBuckets['1_30'].total = roundMoney(agingBuckets['1_30'].total + balance);
        agingBuckets['1_30'].count++;
      } else if (daysOverdue <= 60) {
        agingBuckets['31_60'].total = roundMoney(agingBuckets['31_60'].total + balance);
        agingBuckets['31_60'].count++;
      } else if (daysOverdue <= 90) {
        agingBuckets['61_90'].total = roundMoney(agingBuckets['61_90'].total + balance);
        agingBuckets['61_90'].count++;
      } else {
        agingBuckets['90_plus'].total = roundMoney(agingBuckets['90_plus'].total + balance);
        agingBuckets['90_plus'].count++;
      }
    }

    const agingSummary = [
      {
        bucket: 'current' as const,
        total: agingBuckets.current.total,
        invoice_count: agingBuckets.current.count,
      },
      {
        bucket: '1_30' as const,
        total: agingBuckets['1_30'].total,
        invoice_count: agingBuckets['1_30'].count,
      },
      {
        bucket: '31_60' as const,
        total: agingBuckets['31_60'].total,
        invoice_count: agingBuckets['31_60'].count,
      },
      {
        bucket: '61_90' as const,
        total: agingBuckets['61_90'].total,
        invoice_count: agingBuckets['61_90'].count,
      },
      {
        bucket: '90_plus' as const,
        total: agingBuckets['90_plus'].total,
        invoice_count: agingBuckets['90_plus'].count,
      },
    ];

    // ─── Top Overdue Invoices ───────────────────────────────────────────────
    const topOverdueInvoices = overdueInvoices.slice(0, 5).map((inv) => {
      const daysOverdue = Math.floor(
        (now.getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        household_name: inv.household.household_name,
        total_amount: Number(inv.total_amount),
        balance_amount: Number(inv.balance_amount),
        due_date: inv.due_date.toISOString(),
        days_overdue: daysOverdue,
      };
    });

    // ─── Top Debtors ────────────────────────────────────────────────────────
    const debtorMap = new Map<
      string,
      { household_id: string; household_name: string; total_owed: number; invoice_count: number }
    >();
    for (const inv of overdueInvoices) {
      const existing = debtorMap.get(inv.household.id);
      if (existing) {
        existing.total_owed = roundMoney(existing.total_owed + Number(inv.balance_amount));
        existing.invoice_count++;
      } else {
        debtorMap.set(inv.household.id, {
          household_id: inv.household.id,
          household_name: inv.household.household_name,
          total_owed: Number(inv.balance_amount),
          invoice_count: 1,
        });
      }
    }
    const topDebtors = Array.from(debtorMap.values())
      .sort((a, b) => b.total_owed - a.total_owed)
      .slice(0, 5);

    // ─── Pending Payment Plans ─────────────────────────────��────────────────
    const pendingPaymentPlans = await this.prisma.paymentPlanRequest.count({
      where: { tenant_id: tenantId, status: 'pending' },
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
      invoice_status_counts: invoiceStatusCounts,
      aging_summary: agingSummary,
      overdue_invoices: topOverdueInvoices,
      top_debtors: topDebtors,
      pending_payment_plans: pendingPaymentPlans,
      draft_invoices: invoiceStatusCounts.draft ?? 0,
    };
  }

  // ─── Debt Breakdown Detail ──────────────────────────────────────────────────

  async getDebtBreakdown(tenantId: string, bucket?: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        status: { notIn: ['void', 'cancelled'] },
      },
      select: {
        household_id: true,
        total_amount: true,
        balance_amount: true,
        household: { select: { id: true, household_name: true } },
      },
    });

    const householdMap = new Map<
      string,
      { name: string; total: number; balance: number; invoiceCount: number }
    >();
    for (const inv of invoices) {
      const existing = householdMap.get(inv.household_id) ?? {
        name: inv.household.household_name,
        total: 0,
        balance: 0,
        invoiceCount: 0,
      };
      existing.total += Number(inv.total_amount);
      existing.balance += Number(inv.balance_amount);
      existing.invoiceCount++;
      householdMap.set(inv.household_id, existing);
    }

    const rows: Array<{
      household_id: string;
      household_name: string;
      total_billed: number;
      outstanding: number;
      pct_owed: number;
      invoice_count: number;
      bucket: string;
    }> = [];

    for (const [householdId, data] of householdMap) {
      if (data.total <= 0) continue;
      const pctOwed = roundMoney((data.balance / data.total) * 100);
      if (pctOwed <= 0) continue;

      let bucketLabel: string;
      if (pctOwed <= 10) bucketLabel = '0_10';
      else if (pctOwed <= 30) bucketLabel = '10_30';
      else if (pctOwed <= 50) bucketLabel = '30_50';
      else bucketLabel = '50_plus';

      if (bucket && bucket !== bucketLabel) continue;

      rows.push({
        household_id: householdId,
        household_name: data.name,
        total_billed: roundMoney(data.total),
        outstanding: roundMoney(data.balance),
        pct_owed: pctOwed,
        invoice_count: data.invoiceCount,
        bucket: bucketLabel,
      });
    }

    rows.sort((a, b) => b.pct_owed - a.pct_owed);

    return { data: rows };
  }
}
