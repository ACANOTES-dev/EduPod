import { z } from 'zod';

// ─── Fee Structures ─────────────────────────────────────────

export const createFeeStructureSchema = z.object({
  name: z.string().min(1).max(150),
  year_group_id: z.string().uuid().optional(),
  amount: z.number().positive(),
  billing_frequency: z.enum(['one_off', 'term', 'monthly', 'custom']),
});
export type CreateFeeStructureDto = z.infer<typeof createFeeStructureSchema>;

export const updateFeeStructureSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  year_group_id: z.string().uuid().nullable().optional(),
  amount: z.number().positive().optional(),
  billing_frequency: z.enum(['one_off', 'term', 'monthly', 'custom']).optional(),
  active: z.boolean().optional(),
});
export type UpdateFeeStructureDto = z.infer<typeof updateFeeStructureSchema>;

export const feeStructureQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  active: z.coerce.boolean().optional(),
  year_group_id: z.string().uuid().optional(),
  search: z.string().optional(),
});

// ─── Discounts ──────────────────────────────────────────────

export const createDiscountSchema = z.object({
  name: z.string().min(1).max(150),
  discount_type: z.enum(['fixed', 'percent']),
  value: z.number().positive(),
}).refine(
  (data) => data.discount_type !== 'percent' || data.value <= 100,
  { message: 'Percentage discount value must be <= 100', path: ['value'] },
);
export type CreateDiscountDto = z.infer<typeof createDiscountSchema>;

export const updateDiscountSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  discount_type: z.enum(['fixed', 'percent']).optional(),
  value: z.number().positive().optional(),
  active: z.boolean().optional(),
});
export type UpdateDiscountDto = z.infer<typeof updateDiscountSchema>;

export const discountQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  active: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

// ─── Fee Assignments ────────────────────────────────────────

export const createFeeAssignmentSchema = z.object({
  household_id: z.string().uuid(),
  student_id: z.string().uuid().optional(),
  fee_structure_id: z.string().uuid(),
  discount_id: z.string().uuid().optional(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type CreateFeeAssignmentDto = z.infer<typeof createFeeAssignmentSchema>;

export const updateFeeAssignmentSchema = z.object({
  discount_id: z.string().uuid().nullable().optional(),
  effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type UpdateFeeAssignmentDto = z.infer<typeof updateFeeAssignmentSchema>;

export const feeAssignmentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  household_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  fee_structure_id: z.string().uuid().optional(),
  active_only: z.coerce.boolean().optional(),
});

// ─── Fee Generation ─────────────────────────────────────────

export const feeGenerationPreviewSchema = z.object({
  year_group_ids: z.array(z.string().uuid()).min(1),
  fee_structure_ids: z.array(z.string().uuid()).min(1),
  billing_period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  billing_period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type FeeGenerationPreviewDto = z.infer<typeof feeGenerationPreviewSchema>;

export const feeGenerationConfirmSchema = z.object({
  year_group_ids: z.array(z.string().uuid()).min(1),
  fee_structure_ids: z.array(z.string().uuid()).min(1),
  billing_period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  billing_period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  excluded_household_ids: z.array(z.string().uuid()).default([]),
});
export type FeeGenerationConfirmDto = z.infer<typeof feeGenerationConfirmSchema>;

// ─── Invoices ───────────────────────────────────────────────

const invoiceLineSchema = z.object({
  description: z.string().min(1).max(255),
  quantity: z.number().positive(),
  unit_amount: z.number().positive(),
  student_id: z.string().uuid().optional(),
  fee_structure_id: z.string().uuid().optional(),
});

export const createInvoiceSchema = z.object({
  household_id: z.string().uuid(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(invoiceLineSchema).min(1),
});
export type CreateInvoiceDto = z.infer<typeof createInvoiceSchema>;

export const updateInvoiceSchema = z.object({
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  lines: z.array(invoiceLineSchema).min(1).optional(),
  expected_updated_at: z.string().datetime(),
});
export type UpdateInvoiceDto = z.infer<typeof updateInvoiceSchema>;

export const writeOffSchema = z.object({
  write_off_reason: z.string().min(1).max(1000),
});
export type WriteOffDto = z.infer<typeof writeOffSchema>;

export const invoiceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.union([
    z.enum(['draft', 'pending_approval', 'issued', 'partially_paid', 'paid', 'overdue', 'void', 'cancelled', 'written_off']),
    z.string().transform(s => s.split(',')),
  ]).optional(),
  household_id: z.string().uuid().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export const invoicePdfQuerySchema = z.object({
  locale: z.enum(['en', 'ar']).optional(),
});

// ─── Installments ───────────────────────────────────────────

const installmentItemSchema = z.object({
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
});

export const createInstallmentsSchema = z.object({
  installments: z.array(installmentItemSchema).min(1),
});
export type CreateInstallmentsDto = z.infer<typeof createInstallmentsSchema>;

// ─── Payments ───────────────────────────────────────────────

export const createPaymentSchema = z.object({
  household_id: z.string().uuid(),
  payment_method: z.enum(['cash', 'bank_transfer', 'card_manual']),
  payment_reference: z.string().min(1).max(100),
  amount: z.number().positive(),
  received_at: z.string().datetime(),
  reason: z.string().max(1000).optional(),
});
export type CreatePaymentDto = z.infer<typeof createPaymentSchema>;

export const paymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  household_id: z.string().uuid().optional(),
  status: z.enum(['pending', 'posted', 'failed', 'voided', 'refunded_partial', 'refunded_full']).optional(),
  payment_method: z.enum(['stripe', 'cash', 'bank_transfer', 'card_manual']).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().optional(),
});

const allocationItemSchema = z.object({
  invoice_id: z.string().uuid(),
  amount: z.number().positive(),
});

export const confirmAllocationsSchema = z.object({
  allocations: z.array(allocationItemSchema).min(1),
});
export type ConfirmAllocationsDto = z.infer<typeof confirmAllocationsSchema>;

// ─── Stripe ─────────────────────────────────────────────────

export const checkoutSessionSchema = z.object({
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});
export type CheckoutSessionDto = z.infer<typeof checkoutSessionSchema>;

// ─── Refunds ────────────────────────────────────────────────

export const createRefundSchema = z.object({
  payment_id: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().min(1).max(1000),
});
export type CreateRefundDto = z.infer<typeof createRefundSchema>;

export const refundQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending_approval', 'approved', 'executed', 'failed', 'rejected']).optional(),
  payment_id: z.string().uuid().optional(),
});

export const refundApprovalCommentSchema = z.object({
  comment: z.string().max(1000).optional(),
});

export const refundRejectionCommentSchema = z.object({
  comment: z.string().min(1).max(1000),
});

// ─── Household Statement ────────────────────────────────────

export const statementQuerySchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const statementPdfQuerySchema = z.object({
  locale: z.enum(['en', 'ar']).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
