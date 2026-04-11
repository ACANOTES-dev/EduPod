import { Injectable, Logger } from '@nestjs/common';

import { InvoicesService } from '../finance/invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdmissionsFinanceParams {
  tenantId: string;
  householdId: string;
  studentId: string;
  studentFirstName: string;
  studentLastName: string;
  yearGroupId: string;
  academicYearId: string;
  /** The amount the parent actually paid (in cents). 0 for full waiver. */
  paymentAmountCents: number;
  paymentSource: 'stripe' | 'cash' | 'bank_transfer' | 'override';
  actingUserId: string;
  /** Stripe-specific fields for the payment record */
  stripeSessionId?: string;
  stripePaymentIntentId?: string;
  /** Cash/bank transfer reference */
  externalReference?: string;
  /** The Prisma transaction client (already inside RLS context) */
  db: PrismaService;
}

export interface AdmissionsFinanceResult {
  invoiceId: string;
  invoiceNumber: string;
  paymentId: string | null;
  invoiceTotalCents: number;
  paymentCents: number;
  balanceCents: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AdmissionsFinanceBridgeService {
  private readonly logger = new Logger(AdmissionsFinanceBridgeService.name);

  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly sequenceService: SequenceService,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  /**
   * Create full financial records after a student is materialised from an
   * approved admissions application. Must be called inside the caller's RLS
   * transaction (passed as `params.db`).
   *
   * Creates:
   * 1. HouseholdFeeAssignment — links student to the year-group fee structure
   * 2. Invoice + InvoiceLine — the annual fee for the student
   * 3. Payment record — the amount actually paid
   * 4. PaymentAllocation — links payment to invoice
   * 5. Recalculates the invoice balance
   */
  async createFinancialRecords(params: AdmissionsFinanceParams): Promise<AdmissionsFinanceResult> {
    const {
      tenantId,
      householdId,
      studentId,
      studentFirstName,
      studentLastName,
      yearGroupId,
      academicYearId,
      paymentAmountCents,
      paymentSource,
      actingUserId,
      stripeSessionId,
      stripePaymentIntentId,
      externalReference,
      db,
    } = params;

    // ─── 1. Resolve tenant config ─────────────────────────────────────────────
    // Use the transaction client (db) for RLS-protected tables; fall back to
    // the facade only for platform-level tables that don't have RLS.

    const currencyCode = (await this.tenantReadFacade.findCurrencyCode(tenantId)) ?? 'EUR';
    const branding = await db.tenantBranding.findUnique({ where: { tenant_id: tenantId } });
    const invoicePrefix = branding?.invoice_prefix ?? 'INV';

    // ─── 2. Find fee structures for this year group ───────────────────────────

    const feeStructures = await db.feeStructure.findMany({
      where: {
        tenant_id: tenantId,
        year_group_id: yearGroupId,
        active: true,
      },
    });

    if (feeStructures.length === 0) {
      this.logger.warn(
        `[createFinancialRecords] No active fee structures for year group ${yearGroupId} — skipping invoice creation`,
      );
      return {
        invoiceId: '',
        invoiceNumber: '',
        paymentId: null,
        invoiceTotalCents: 0,
        paymentCents: 0,
        balanceCents: 0,
      };
    }

    // ─── 3. Get term count for annual amount calculation ──────────────────────

    const academicYear = await db.academicYear.findFirst({
      where: { id: academicYearId, tenant_id: tenantId },
      include: { periods: { select: { id: true } } },
    });
    const termCount = academicYear?.periods?.length ?? 3;

    // ─── 4. Create fee assignments + build invoice lines ──────────────────────

    const lineData: Array<{
      tenant_id: string;
      description: string;
      quantity: number;
      unit_amount: number;
      line_total: number;
      student_id: string;
      fee_structure_id: string | null;
    }> = [];

    let subtotal = 0;

    for (const fs of feeStructures) {
      // Create HouseholdFeeAssignment
      await db.householdFeeAssignment.create({
        data: {
          tenant_id: tenantId,
          household_id: householdId,
          student_id: studentId,
          fee_structure_id: fs.id,
          effective_from: new Date(),
        },
      });

      // Calculate annual amount
      const baseAmount = Number(fs.amount);
      let annualAmount: number;
      switch (fs.billing_frequency) {
        case 'term':
          annualAmount = roundMoney(baseAmount * termCount);
          break;
        case 'monthly':
          annualAmount = roundMoney(baseAmount * 12);
          break;
        default:
          annualAmount = baseAmount;
      }

      lineData.push({
        tenant_id: tenantId,
        description: `${fs.name} — ${studentFirstName} ${studentLastName}`,
        quantity: 1,
        unit_amount: annualAmount,
        line_total: annualAmount,
        student_id: studentId,
        fee_structure_id: fs.id,
      });

      subtotal += annualAmount;
    }

    subtotal = roundMoney(subtotal);
    const totalAmount = subtotal;

    // ─── 5. Create invoice ────────────────────────────────────────────────────

    const invoiceNumber = await this.sequenceService.nextNumber(
      tenantId,
      'invoice',
      undefined,
      invoicePrefix,
    );

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const invoice = await db.invoice.create({
      data: {
        tenant_id: tenantId,
        household_id: householdId,
        invoice_number: invoiceNumber,
        status: 'issued',
        issue_date: new Date(),
        due_date: dueDate,
        subtotal_amount: subtotal,
        discount_amount: 0,
        total_amount: totalAmount,
        balance_amount: totalAmount,
        currency_code: currencyCode,
        created_by_user_id: actingUserId,
        lines: { create: lineData },
      },
    });

    this.logger.log(
      `[createFinancialRecords] Created invoice ${invoiceNumber} (${totalAmount} ${currencyCode}) for household ${householdId}`,
    );

    // ─── 6. Record payment (if amount > 0) ────────────────────────────────────

    let paymentId: string | null = null;
    const paymentCents = paymentAmountCents;
    const paymentAmount = roundMoney(paymentCents / 100);

    if (paymentAmount > 0) {
      const paymentRef =
        paymentSource === 'stripe' && stripeSessionId
          ? `STRIPE-${stripeSessionId}`
          : await this.sequenceService.nextNumber(tenantId, 'payment', undefined, 'PAY');

      const payment = await db.payment.create({
        data: {
          tenant_id: tenantId,
          household_id: householdId,
          payment_reference: paymentRef,
          payment_method: paymentSource === 'override' ? 'card_manual' : paymentSource,
          external_provider: paymentSource === 'stripe' ? 'stripe' : null,
          external_event_id: stripePaymentIntentId ?? null,
          amount: paymentAmount,
          currency_code: currencyCode,
          status: 'posted',
          received_at: new Date(),
          posted_by_user_id: actingUserId,
          reason: externalReference
            ? `Admissions payment (${paymentSource}) — ref: ${externalReference}`
            : `Admissions payment (${paymentSource})`,
        },
      });

      paymentId = payment.id;

      // Allocate payment to invoice
      const allocAmount = roundMoney(Math.min(paymentAmount, totalAmount));
      if (allocAmount > 0) {
        await db.paymentAllocation.create({
          data: {
            tenant_id: tenantId,
            payment_id: payment.id,
            invoice_id: invoice.id,
            allocated_amount: allocAmount,
          },
        });
      }

      // Recalculate invoice balance
      await this.invoicesService.recalculateBalance(tenantId, invoice.id, db);

      this.logger.log(
        `[createFinancialRecords] Recorded payment ${paymentRef} (${paymentAmount} ${currencyCode}) allocated to invoice ${invoiceNumber}`,
      );
    }

    // Re-read the invoice to get updated balance
    const updatedInvoice = await db.invoice.findFirst({
      where: { id: invoice.id, tenant_id: tenantId },
    });

    const balanceCents = Math.round(Number(updatedInvoice?.balance_amount ?? totalAmount) * 100);

    return {
      invoiceId: invoice.id,
      invoiceNumber,
      paymentId,
      invoiceTotalCents: Math.round(totalAmount * 100),
      paymentCents,
      balanceCents,
    };
  }
}
