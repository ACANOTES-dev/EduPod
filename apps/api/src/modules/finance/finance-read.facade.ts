/**
 * FinanceReadFacade — Centralized read service for finance data.
 *
 * PURPOSE:
 * Three modules read finance tables directly via Prisma:
 *  - compliance/dsar-traversal.service.ts: reads invoice, payment, refund,
 *    creditNote, paymentPlanRequest, scholarship
 *  - compliance/retention-policies.service.ts: counts invoices before a date
 *  - registration/registration.service.ts: reads feeStructure and discount
 *
 * This facade provides a single, well-typed entry point for all cross-module
 * finance reads. Select clauses are centralized here so schema changes
 * propagate through a single file instead of multiple consumer modules.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Batch methods return arrays (empty array = nothing found).
 */
import { Injectable } from '@nestjs/common';
import type {
  BillingFrequency,
  CreditNoteStatus,
  DiscountType,
  InvoiceStatus,
  PaymentMethod,
  PaymentPlanStatus,
  PaymentStatus,
  Prisma,
  RefundStatus,
  ScholarshipStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

// ─── Common select shapes ─────────────────────────────────────────────────────

const INVOICE_SELECT = {
  id: true,
  household_id: true,
  invoice_number: true,
  status: true,
  issue_date: true,
  due_date: true,
  subtotal_amount: true,
  discount_amount: true,
  total_amount: true,
  balance_amount: true,
  currency_code: true,
  created_at: true,
  updated_at: true,
} as const;

const PAYMENT_SELECT = {
  id: true,
  household_id: true,
  payment_reference: true,
  payment_method: true,
  amount: true,
  currency_code: true,
  status: true,
  received_at: true,
  created_at: true,
  updated_at: true,
} as const;

const REFUND_SELECT = {
  id: true,
  payment_id: true,
  refund_reference: true,
  amount: true,
  status: true,
  reason: true,
  executed_at: true,
  created_at: true,
  updated_at: true,
} as const;

const CREDIT_NOTE_SELECT = {
  id: true,
  household_id: true,
  credit_note_number: true,
  amount: true,
  remaining_balance: true,
  reason: true,
  status: true,
  issued_at: true,
  created_at: true,
  updated_at: true,
} as const;

const PAYMENT_PLAN_REQUEST_SELECT = {
  id: true,
  invoice_id: true,
  household_id: true,
  requested_by_parent_id: true,
  proposed_installments_json: true,
  reason: true,
  status: true,
  admin_notes: true,
  reviewed_at: true,
  created_at: true,
  updated_at: true,
} as const;

const SCHOLARSHIP_SELECT = {
  id: true,
  name: true,
  description: true,
  discount_type: true,
  value: true,
  student_id: true,
  award_date: true,
  renewal_date: true,
  status: true,
  revocation_reason: true,
  fee_structure_id: true,
  created_at: true,
  updated_at: true,
} as const;

const FEE_STRUCTURE_SELECT = {
  id: true,
  name: true,
  year_group_id: true,
  amount: true,
  billing_frequency: true,
  active: true,
  created_at: true,
  updated_at: true,
} as const;

const DISCOUNT_SELECT = {
  id: true,
  name: true,
  discount_type: true,
  value: true,
  active: true,
  created_at: true,
  updated_at: true,
} as const;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface InvoiceRow {
  id: string;
  household_id: string;
  invoice_number: string;
  status: InvoiceStatus;
  issue_date: Date | null;
  due_date: Date;
  subtotal_amount: unknown;
  discount_amount: unknown;
  total_amount: unknown;
  balance_amount: unknown;
  currency_code: string;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentRow {
  id: string;
  household_id: string;
  payment_reference: string;
  payment_method: PaymentMethod;
  amount: unknown;
  currency_code: string;
  status: PaymentStatus;
  received_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RefundRow {
  id: string;
  payment_id: string;
  refund_reference: string;
  amount: unknown;
  status: RefundStatus;
  reason: string;
  executed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreditNoteRow {
  id: string;
  household_id: string;
  credit_note_number: string;
  amount: unknown;
  remaining_balance: unknown;
  reason: string;
  status: CreditNoteStatus;
  issued_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentPlanRequestRow {
  id: string;
  invoice_id: string | null;
  household_id: string;
  requested_by_parent_id: string | null;
  proposed_installments_json: unknown;
  reason: string | null;
  status: PaymentPlanStatus;
  admin_notes: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ScholarshipRow {
  id: string;
  name: string;
  description: string | null;
  discount_type: DiscountType;
  value: unknown;
  student_id: string;
  award_date: Date;
  renewal_date: Date | null;
  status: ScholarshipStatus;
  revocation_reason: string | null;
  fee_structure_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface FeeStructureRow {
  id: string;
  name: string;
  year_group_id: string | null;
  amount: unknown;
  billing_frequency: BillingFrequency;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface DiscountRow {
  id: string;
  name: string;
  discount_type: DiscountType;
  value: unknown;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class FinanceReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * All invoices for a household — used by DSAR traversal.
   */
  async findInvoicesByHousehold(tenantId: string, householdId: string): Promise<InvoiceRow[]> {
    return this.prisma.invoice.findMany({
      where: { tenant_id: tenantId, household_id: householdId },
      select: INVOICE_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Count of invoices created before a cutoff date — used by retention policies.
   */
  async countInvoicesBeforeDate(tenantId: string, cutoffDate: Date): Promise<number> {
    return this.prisma.invoice.count({
      where: {
        tenant_id: tenantId,
        created_at: { lt: cutoffDate },
      },
    });
  }

  /**
   * All payments for a household — used by DSAR traversal.
   */
  async findPaymentsByHousehold(tenantId: string, householdId: string): Promise<PaymentRow[]> {
    return this.prisma.payment.findMany({
      where: { tenant_id: tenantId, household_id: householdId },
      select: PAYMENT_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * All refunds linked to a household via the payment relation — used by DSAR traversal.
   * Refunds do not have a direct household_id; they are accessed via payment.household_id.
   */
  async findRefundsByHousehold(tenantId: string, householdId: string): Promise<RefundRow[]> {
    return this.prisma.refund.findMany({
      where: {
        tenant_id: tenantId,
        payment: { household_id: householdId },
      },
      select: REFUND_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * All credit notes for a household — used by DSAR traversal.
   */
  async findCreditNotesByHousehold(
    tenantId: string,
    householdId: string,
  ): Promise<CreditNoteRow[]> {
    return this.prisma.creditNote.findMany({
      where: { tenant_id: tenantId, household_id: householdId },
      select: CREDIT_NOTE_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * All payment plan requests for a household — used by DSAR traversal.
   */
  async findPaymentPlanRequestsByHousehold(
    tenantId: string,
    householdId: string,
  ): Promise<PaymentPlanRequestRow[]> {
    return this.prisma.paymentPlanRequest.findMany({
      where: { tenant_id: tenantId, household_id: householdId },
      select: PAYMENT_PLAN_REQUEST_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * All scholarships for a student — used by DSAR traversal.
   * Scholarships are linked to the student directly; household context is resolved
   * at the DSAR layer via student.household_id.
   */
  async findScholarshipsByStudent(tenantId: string, studentId: string): Promise<ScholarshipRow[]> {
    return this.prisma.scholarship.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: SCHOLARSHIP_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * All scholarships for students belonging to any of the given households.
   * Used by DSAR traversal when collecting parent-level financial data
   * (scholarships are linked to students, not households directly).
   */
  async findScholarshipsByHouseholds(
    tenantId: string,
    householdIds: string[],
  ): Promise<ScholarshipRow[]> {
    if (householdIds.length === 0) return [];

    return this.prisma.scholarship.findMany({
      where: {
        tenant_id: tenantId,
        student: { household_id: { in: householdIds } },
      },
      select: SCHOLARSHIP_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Active fee structures for a tenant, optionally filtered by year group.
   * Used by registration to resolve applicable fees when enrolling a student.
   */
  async findActiveFeeStructures(
    tenantId: string,
    yearGroupId?: string,
  ): Promise<FeeStructureRow[]> {
    return this.prisma.feeStructure.findMany({
      where: {
        tenant_id: tenantId,
        active: true,
        ...(yearGroupId !== undefined ? { year_group_id: yearGroupId } : {}),
      },
      select: FEE_STRUCTURE_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * All active discounts for a tenant — used by registration.
   */
  async findActiveDiscounts(tenantId: string): Promise<DiscountRow[]> {
    return this.prisma.discount.findMany({
      where: { tenant_id: tenantId, active: true },
      select: DISCOUNT_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Find fee assignments for a household — used by DSAR household traversal.
   */
  async findFeeAssignmentsByHousehold(tenantId: string, householdId: string): Promise<unknown[]> {
    return this.prisma.householdFeeAssignment.findMany({
      where: { household_id: householdId, tenant_id: tenantId },
      orderBy: { effective_from: 'desc' },
    });
  }

  /**
   * Find every household in the tenant that has an outstanding
   * (overdue) invoice matching the supplied thresholds.
   *
   * Used by the inbox `fees_in_arrears` audience provider to target
   * parents whose household has fees overdue. Invoices are
   * household-scoped in this schema — students are not directly billed —
   * so the provider resolves household_ids here and maps them to parent
   * user_ids in its own step via `HouseholdReadFacade`.
   *
   * An invoice counts as "overdue" when:
   *   - status is `issued`, `partially_paid`, or `overdue`
   *   - due_date is in the past by at least `minDays` days (default 0)
   *   - balance_amount ≥ `minAmount` (default 0)
   *
   * Dedupes household_ids so the caller never has to.
   */
  async findHouseholdIdsWithOverdueInvoices(
    tenantId: string,
    filter: { minAmount?: number; minDays?: number } = {},
  ): Promise<string[]> {
    const minAmount = filter.minAmount ?? 0;
    const minDays = filter.minDays ?? 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - minDays);

    const rows = await this.prisma.invoice.findMany({
      where: {
        tenant_id: tenantId,
        status: { in: ['issued', 'partially_paid', 'overdue'] },
        due_date: { lte: cutoff },
        balance_amount: { gte: minAmount },
      },
      select: { household_id: true },
    });
    return [...new Set(rows.map((r) => r.household_id))];
  }

  // ─── Generic Methods (reports-data-access) ─────────────────────────────────

  /**
   * Generic findMany for invoices with arbitrary where/select/orderBy/skip/take.
   * Used by reports-data-access for invoice analytics.
   */
  async findInvoicesGeneric(
    tenantId: string,
    options: {
      where?: Prisma.InvoiceWhereInput;
      select?: Prisma.InvoiceSelect;
      orderBy?: Prisma.InvoiceOrderByWithRelationInput;
      skip?: number;
      take?: number;
    },
  ): Promise<unknown[]> {
    return this.prisma.invoice.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.orderBy && { orderBy: options.orderBy }),
      ...(options.skip !== undefined && { skip: options.skip }),
      ...(options.take !== undefined && { take: options.take }),
    });
  }

  /**
   * Count invoices matching an arbitrary filter.
   * Used by reports-data-access for invoice counts.
   */
  async countInvoices(tenantId: string, where?: Prisma.InvoiceWhereInput): Promise<number> {
    return this.prisma.invoice.count({
      where: { tenant_id: tenantId, ...where },
    });
  }

  /**
   * Aggregate invoice monetary totals. Returns plain number values.
   * Used by reports-data-access for financial summaries.
   */
  async aggregateInvoices(
    tenantId: string,
    where?: Prisma.InvoiceWhereInput,
  ): Promise<{
    _sum: {
      total_amount: number | null;
      balance_amount: number | null;
      discount_amount?: number | null;
    };
  }> {
    return this.prisma.invoice.aggregate({
      where: { tenant_id: tenantId, ...where },
      _sum: { total_amount: true, balance_amount: true },
    }) as unknown as {
      _sum: {
        total_amount: number | null;
        balance_amount: number | null;
        discount_amount?: number | null;
      };
    };
  }

  /**
   * Generic findMany for payments with arbitrary where/select/orderBy/take.
   * Used by reports-data-access for payment analytics.
   */
  async findPaymentsGeneric(
    tenantId: string,
    options: {
      where?: Prisma.PaymentWhereInput;
      select?: Prisma.PaymentSelect;
      orderBy?: Prisma.PaymentOrderByWithRelationInput;
      take?: number;
    },
  ): Promise<unknown[]> {
    return this.prisma.payment.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.orderBy && { orderBy: options.orderBy }),
      ...(options.take !== undefined && { take: options.take }),
    });
  }
}
