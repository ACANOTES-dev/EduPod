import { Injectable, NotFoundException } from '@nestjs/common';

import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfRenderingService: PdfRenderingService,
    private readonly sequenceService: SequenceService,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  async createForPayment(
    tenantId: string,
    paymentId: string,
    userId: string | null,
    locale: string,
    tx?: unknown,
  ) {
    const prisma = tx ? (tx as unknown as typeof this.prisma) : this.prisma;

    // Get branding for receipt prefix
    const branding = await prisma.tenantBranding.findUnique({
      where: { tenant_id: tenantId },
    });
    const prefix = branding?.receipt_prefix ?? 'REC';

    const receiptNumber = await this.sequenceService.nextNumber(
      tenantId,
      'receipt',
      tx ?? undefined,
      prefix,
    );

    const receipt = await prisma.receipt.create({
      data: {
        tenant_id: tenantId,
        payment_id: paymentId,
        receipt_number: receiptNumber,
        template_locale: locale,
        issued_at: new Date(),
        issued_by_user_id: userId,
        render_version: '1.0',
      },
    });

    return receipt;
  }

  async findByPayment(tenantId: string, paymentId: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { payment_id: paymentId, tenant_id: tenantId },
    });

    if (!receipt) {
      throw new NotFoundException({
        code: 'RECEIPT_NOT_FOUND',
        message: `Receipt for payment "${paymentId}" not found`,
      });
    }

    return receipt;
  }

  async renderPdf(tenantId: string, paymentId: string, locale: string): Promise<Buffer> {
    // Load receipt, payment, allocations, household, and billing parent data
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, tenant_id: tenantId },
      include: {
        household: {
          select: {
            id: true,
            household_name: true,
            household_number: true,
            billing_parent: {
              select: { first_name: true, last_name: true, phone: true },
            },
          },
        },
        allocations: {
          include: {
            invoice: {
              select: { id: true, invoice_number: true, total_amount: true },
            },
          },
        },
        receipt: true,
      },
    });

    if (!payment) {
      throw new NotFoundException({
        code: 'PAYMENT_NOT_FOUND',
        message: `Payment with id "${paymentId}" not found`,
      });
    }

    // ─── Snapshot balances ────────────────────────────────────────────────────
    // Sum all outstanding invoice balances for this household
    const balanceResult = await this.prisma.invoice.aggregate({
      where: {
        tenant_id: tenantId,
        household_id: payment.household.id,
        status: { in: ['issued', 'partially_paid', 'overdue'] },
      },
      _sum: { balance_amount: true },
    });
    const remainingAfter = Number(balanceResult._sum.balance_amount ?? 0);
    const outstandingBefore = remainingAfter + Number(payment.amount);

    const branding = await this.tenantReadFacade.findBranding(tenantId);

    const tenant = await this.tenantReadFacade.findById(tenantId);

    const billingParent = payment.household.billing_parent;
    const billingParentName = billingParent
      ? `${billingParent.first_name} ${billingParent.last_name}`
      : null;
    const billingParentPhone = billingParent?.phone ?? null;

    const pdfBranding = {
      school_name: branding?.school_name_display ?? tenant?.name ?? '',
      school_name_ar: branding?.school_name_ar ?? undefined,
      logo_url: branding?.logo_url ?? undefined,
      primary_color: branding?.primary_color ?? undefined,
    };

    const receiptData = {
      receipt_number: payment.receipt?.receipt_number ?? '',
      issued_at: payment.receipt?.issued_at?.toISOString() ?? new Date().toISOString(),
      currency_code: payment.currency_code,
      household: {
        household_name: payment.household.household_name,
        household_number: payment.household.household_number ?? '--',
        billing_parent_name: billingParentName,
        billing_parent_phone: billingParentPhone,
      },
      payment: {
        payment_reference: payment.payment_reference,
        payment_method: payment.payment_method,
        amount: Number(payment.amount),
        received_at: payment.received_at.toISOString(),
      },
      outstanding_before: outstandingBefore,
      remaining_after: remainingAfter,
      allocations: payment.allocations.map((a) => ({
        invoice_number: a.invoice.invoice_number,
        invoice_total: Number(a.invoice.total_amount),
        allocated_amount: Number(a.allocated_amount),
      })),
    };

    return this.pdfRenderingService.renderPdf('receipt', locale, receiptData, pdfBranding);
  }
}
