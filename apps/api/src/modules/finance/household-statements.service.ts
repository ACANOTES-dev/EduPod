import { Injectable, NotFoundException } from '@nestjs/common';

import type { HouseholdStatementData, StatementEntry } from '@school/shared';

import { HouseholdReadFacade } from '../households/household-read.facade';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

import { roundMoney } from './helpers/invoice-status.helper';

interface StatementFilters {
  date_from?: string;
  date_to?: string;
}

@Injectable()
export class HouseholdStatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfRenderingService: PdfRenderingService,
    private readonly householdReadFacade: HouseholdReadFacade,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  async getStatement(
    tenantId: string,
    householdId: string,
    filters: StatementFilters,
  ): Promise<HouseholdStatementData> {
    // Validate household exists
    const household = await this.householdReadFacade.findByIdWithBillingParent(
      tenantId,
      householdId,
    );
    if (!household) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: `Household with id "${householdId}" not found`,
      });
    }

    const tenant = await this.tenantReadFacade.findById(tenantId);

    // Build date range filter — use start-of-day / end-of-day to capture timestamps
    // within the boundary dates. Without this, a payment at 2024-04-11T14:00:00Z
    // would be missed when date_to is "2024-04-11" (parsed as midnight UTC).
    const dateFrom = filters.date_from ? new Date(`${filters.date_from}T00:00:00.000Z`) : undefined;
    const dateTo = filters.date_to ? new Date(`${filters.date_to}T23:59:59.999Z`) : undefined;

    // Gather invoices (not void/cancelled)
    const invoiceWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      household_id: householdId,
      status: { notIn: ['void', 'cancelled'] },
    };
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {};
      if (dateFrom) dateFilter.gte = dateFrom;
      if (dateTo) dateFilter.lte = dateTo;
      invoiceWhere.issue_date = dateFilter;
    }

    const invoices = await this.prisma.invoice.findMany({
      where: invoiceWhere,
      orderBy: { issue_date: 'asc' },
      select: {
        id: true,
        invoice_number: true,
        status: true,
        issue_date: true,
        total_amount: true,
        write_off_amount: true,
        write_off_reason: true,
      },
    });

    // Gather payments (posted, refunded_partial, refunded_full)
    const paymentWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      household_id: householdId,
      status: { in: ['posted', 'refunded_partial', 'refunded_full'] },
    };
    if (dateFrom || dateTo) {
      const dateFilter: Record<string, unknown> = {};
      if (dateFrom) dateFilter.gte = dateFrom;
      if (dateTo) dateFilter.lte = dateTo;
      paymentWhere.received_at = dateFilter;
    }

    const payments = await this.prisma.payment.findMany({
      where: paymentWhere,
      orderBy: { received_at: 'asc' },
      select: {
        id: true,
        payment_reference: true,
        amount: true,
        received_at: true,
        allocations: {
          select: {
            id: true,
            invoice_id: true,
            allocated_amount: true,
            created_at: true,
            invoice: {
              select: { invoice_number: true },
            },
          },
        },
      },
    });

    // Gather refunds (executed)
    const refundWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      payment: { household_id: householdId },
      status: 'executed',
    };

    const refunds = await this.prisma.refund.findMany({
      where: refundWhere,
      orderBy: { executed_at: 'asc' },
      select: {
        id: true,
        refund_reference: true,
        amount: true,
        executed_at: true,
        payment: {
          select: { payment_reference: true },
        },
      },
    });

    // Build chronological entries
    const entries: StatementEntry[] = [];

    // Add invoice entries (debit)
    for (const inv of invoices) {
      if (inv.issue_date) {
        entries.push({
          date: inv.issue_date.toISOString().split('T')[0] as string,
          type: 'invoice_issued',
          reference: inv.invoice_number,
          description: `Invoice ${inv.invoice_number} issued`,
          debit: Number(inv.total_amount),
          credit: null,
          running_balance: 0, // Will be computed after sorting
        });
      }

      // Write-off entry (credit)
      if (inv.write_off_amount && Number(inv.write_off_amount) > 0) {
        entries.push({
          date: (inv.issue_date?.toISOString().split('T')[0] as string) ?? '',
          type: 'write_off',
          reference: inv.invoice_number,
          description: `Write-off: ${inv.write_off_reason ?? inv.invoice_number}`,
          debit: null,
          credit: Number(inv.write_off_amount),
          running_balance: 0,
        });
      }
    }

    // Add payment entries (credit)
    for (const pay of payments) {
      entries.push({
        date: pay.received_at.toISOString().split('T')[0] as string,
        type: 'payment_received',
        reference: pay.payment_reference,
        description: `Payment received: ${pay.payment_reference}`,
        debit: null,
        credit: Number(pay.amount),
        running_balance: 0,
      });
    }

    // Add refund entries (debit — reduces credit)
    for (const ref of refunds) {
      if (ref.executed_at) {
        entries.push({
          date: ref.executed_at.toISOString().split('T')[0] as string,
          type: 'refund',
          reference: ref.refund_reference,
          description: `Refund for payment ${ref.payment.payment_reference}`,
          debit: Number(ref.amount),
          credit: null,
          running_balance: 0,
        });
      }
    }

    // Sort chronologically
    entries.sort((a, b) => a.date.localeCompare(b.date));

    // Compute running balance (debits increase balance, credits decrease)
    let runningBalance = 0;
    for (const entry of entries) {
      if (entry.debit) {
        runningBalance = roundMoney(runningBalance + entry.debit);
      }
      if (entry.credit) {
        runningBalance = roundMoney(runningBalance - entry.credit);
      }
      entry.running_balance = runningBalance;
    }

    const billingParentName = household.billing_parent
      ? `${household.billing_parent.first_name} ${household.billing_parent.last_name}`
      : null;

    return {
      household: {
        id: household.id,
        household_name: household.household_name,
        billing_parent_name: billingParentName,
      },
      entries,
      opening_balance: 0,
      closing_balance: runningBalance,
      currency_code: tenant?.currency_code ?? 'USD',
      date_from: filters.date_from ?? '',
      date_to: filters.date_to ?? '',
    };
  }

  async renderPdf(
    tenantId: string,
    householdId: string,
    locale: string,
    filters: StatementFilters,
  ): Promise<Buffer> {
    const statement = await this.getStatement(tenantId, householdId, filters);

    const branding = await this.tenantReadFacade.findBranding(tenantId);
    const tenant = await this.tenantReadFacade.findById(tenantId);

    const pdfBranding = {
      school_name: branding?.school_name_display ?? tenant?.name ?? '',
      school_name_ar: branding?.school_name_ar ?? undefined,
      logo_url: branding?.logo_url ?? undefined,
      primary_color: branding?.primary_color ?? undefined,
    };

    return this.pdfRenderingService.renderPdf(
      'household-statement',
      locale,
      statement,
      pdfBranding,
    );
  }
}
