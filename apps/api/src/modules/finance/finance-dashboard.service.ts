import { Injectable } from '@nestjs/common';
import type { FinanceDashboardData } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { roundMoney } from './helpers/invoice-status.helper';

@Injectable()
export class FinanceDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardData(tenantId: string): Promise<FinanceDashboardData> {
    const now = new Date();

    // ─── Overdue Summary with Ageing Buckets ────────────────────

    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        status: 'overdue',
      },
      select: {
        id: true,
        balance_amount: true,
        due_date: true,
      },
    });

    const ageing = {
      days_1_30: { count: 0, amount: 0 },
      days_31_60: { count: 0, amount: 0 },
      days_61_90: { count: 0, amount: 0 },
      days_90_plus: { count: 0, amount: 0 },
    };
    let totalOverdueAmount = 0;

    for (const inv of overdueInvoices) {
      const balance = Number(inv.balance_amount);
      totalOverdueAmount += balance;

      const daysDiff = Math.floor(
        (now.getTime() - inv.due_date.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysDiff <= 30) {
        ageing.days_1_30.count++;
        ageing.days_1_30.amount += balance;
      } else if (daysDiff <= 60) {
        ageing.days_31_60.count++;
        ageing.days_31_60.amount += balance;
      } else if (daysDiff <= 90) {
        ageing.days_61_90.count++;
        ageing.days_61_90.amount += balance;
      } else {
        ageing.days_90_plus.count++;
        ageing.days_90_plus.amount += balance;
      }
    }

    // Round ageing amounts
    ageing.days_1_30.amount = roundMoney(ageing.days_1_30.amount);
    ageing.days_31_60.amount = roundMoney(ageing.days_31_60.amount);
    ageing.days_61_90.amount = roundMoney(ageing.days_61_90.amount);
    ageing.days_90_plus.amount = roundMoney(ageing.days_90_plus.amount);

    // ─── Invoice Pipeline Counts ────────────────────────────────

    const pipelineStatuses = ['draft', 'pending_approval', 'issued', 'overdue', 'paid'] as const;
    const pipelineData: Record<string, { count: number; amount: number }> = {};

    for (const status of pipelineStatuses) {
      const invoices = await this.prisma.invoice.findMany({
        where: { tenant_id: tenantId, status },
        select: { total_amount: true },
      });
      pipelineData[status] = {
        count: invoices.length,
        amount: roundMoney(invoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0)),
      };
    }

    // ─── Unallocated Payments ───────────────────────────────────

    const postedPayments = await this.prisma.payment.findMany({
      where: { tenant_id: tenantId, status: 'posted' },
      include: {
        allocations: {
          select: { allocated_amount: true },
        },
      },
    });

    let unallocatedCount = 0;
    let unallocatedTotal = 0;
    for (const payment of postedPayments) {
      const allocated = payment.allocations.reduce(
        (sum, a) => sum + Number(a.allocated_amount),
        0,
      );
      const unallocated = roundMoney(Number(payment.amount) - allocated);
      if (unallocated > 0.01) {
        unallocatedCount++;
        unallocatedTotal += unallocated;
      }
    }

    // ─── Pending Refund Approvals ───────────────────────────────

    const pendingRefundApprovals = await this.prisma.refund.count({
      where: { tenant_id: tenantId, status: 'pending_approval' },
    });

    // ─── Recent Payments ────────────────────────────────────────

    const recentPayments = await this.prisma.payment.findMany({
      where: { tenant_id: tenantId },
      orderBy: { received_at: 'desc' },
      take: 10,
      include: {
        household: {
          select: { household_name: true },
        },
      },
    });

    // ─── Revenue Summary ────────────────────────────────────────

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

    // Current month collected (posted payments with allocations)
    const currentMonthPayments = await this.prisma.payment.findMany({
      where: {
        tenant_id: tenantId,
        status: { in: ['posted', 'refunded_partial', 'refunded_full'] },
        received_at: { gte: currentMonthStart },
      },
      select: { amount: true },
    });
    const currentMonthCollected = roundMoney(
      currentMonthPayments.reduce((sum, p) => sum + Number(p.amount), 0),
    );

    // Previous month collected
    const previousMonthPayments = await this.prisma.payment.findMany({
      where: {
        tenant_id: tenantId,
        status: { in: ['posted', 'refunded_partial', 'refunded_full'] },
        received_at: { gte: previousMonthStart, lte: previousMonthEnd },
      },
      select: { amount: true },
    });
    const previousMonthCollected = roundMoney(
      previousMonthPayments.reduce((sum, p) => sum + Number(p.amount), 0),
    );

    // Current month invoiced
    const currentMonthInvoices = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        status: { notIn: ['void', 'cancelled', 'draft'] },
        issue_date: { gte: currentMonthStart },
      },
      select: { total_amount: true },
    });
    const currentMonthInvoiced = roundMoney(
      currentMonthInvoices.reduce((sum, inv) => sum + Number(inv.total_amount), 0),
    );

    return {
      overdue_summary: {
        total_overdue_amount: roundMoney(totalOverdueAmount),
        overdue_count: overdueInvoices.length,
        ageing,
      },
      invoice_pipeline: {
        draft: pipelineData.draft ?? { count: 0, amount: 0 },
        pending_approval: pipelineData.pending_approval ?? { count: 0, amount: 0 },
        issued: pipelineData.issued ?? { count: 0, amount: 0 },
        overdue: pipelineData.overdue ?? { count: 0, amount: 0 },
        paid: pipelineData.paid ?? { count: 0, amount: 0 },
      },
      unallocated_payments: {
        count: unallocatedCount,
        total_amount: roundMoney(unallocatedTotal),
      },
      pending_refund_approvals: pendingRefundApprovals,
      recent_payments: recentPayments.map((p) => ({
        id: p.id,
        payment_reference: p.payment_reference,
        amount: Number(p.amount),
        household_name: p.household.household_name,
        received_at: p.received_at.toISOString(),
        status: p.status,
      })),
      revenue_summary: {
        current_month_collected: currentMonthCollected,
        previous_month_collected: previousMonthCollected,
        current_month_invoiced: currentMonthInvoiced,
      },
    };
  }
}
