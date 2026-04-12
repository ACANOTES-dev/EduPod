import { z } from 'zod';

// ─── Fee Types ──────────────────────────────────────────────

export const createFeeTypeSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().max(500).optional(),
});
export type CreateFeeTypeDto = z.infer<typeof createFeeTypeSchema>;

export const updateFeeTypeSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(500).nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateFeeTypeDto = z.infer<typeof updateFeeTypeSchema>;

export const feeTypeQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  active: z.coerce.boolean().optional(),
  search: z.string().optional(),
});

// ─── Fee Structures ─────────────────────────────────────────

export const createFeeStructureSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  fee_type_id: z.string().uuid().optional(),
  year_group_id: z.string().uuid().optional(),
  amount: z.number().positive(),
  billing_frequency: z.enum(['one_off', 'term', 'monthly', 'custom']),
});
export type CreateFeeStructureDto = z.infer<typeof createFeeStructureSchema>;

export const updateFeeStructureSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  fee_type_id: z.string().uuid().nullable().optional(),
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

const discountAutoConditionSchema = z.object({
  type: z.enum(['sibling', 'staff']),
  min_students: z.number().int().min(2).optional(),
  applies_to: z.array(z.string().uuid()).optional(),
});

export const createDiscountSchema = z
  .object({
    name: z.string().min(1).max(150),
    discount_type: z.enum(['fixed', 'percent']),
    value: z.number().positive(),
    auto_apply: z.boolean().default(false),
    auto_condition: discountAutoConditionSchema.nullable().optional(),
  })
  .refine((data) => data.discount_type !== 'percent' || data.value <= 100, {
    message: 'Percentage discount value must be <= 100',
    path: ['value'],
  })
  .refine((data) => !data.auto_apply || data.auto_condition != null, {
    message: 'Auto-apply discounts must have a condition',
    path: ['auto_condition'],
  });
export type CreateDiscountDto = z.infer<typeof createDiscountSchema>;

export const updateDiscountSchema = z
  .object({
    name: z.string().min(1).max(150).optional(),
    discount_type: z.enum(['fixed', 'percent']).optional(),
    value: z.number().positive().optional(),
    active: z.boolean().optional(),
    auto_apply: z.boolean().optional(),
    auto_condition: discountAutoConditionSchema.nullable().optional(),
  })
  // Carry the create-time refinements into update so PATCH requests are
  // blocked at the validation boundary rather than leaking to the service.
  // We only enforce the percent cap when a value is actually being set.
  .refine((data) => data.discount_type !== 'percent' || data.value == null || data.value <= 100, {
    message: 'Percentage discount value must be <= 100',
    path: ['value'],
  })
  .refine((data) => !data.auto_apply || data.auto_condition != null, {
    message: 'Auto-apply discounts must have a condition',
    path: ['auto_condition'],
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
  effective_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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

// ─── Financial Reports — shared query schema ────────────────
// Used by aging, revenue-by-period, collection-by-year-group,
// payment-methods, and fee-structure-performance. Previously inlined inside
// `finance-enhanced.controller.ts` — exported here so test fixtures and the
// frontend can share the same validation rules.

export const reportQuerySchema = z.object({
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type ReportQueryDto = z.infer<typeof reportQuerySchema>;

const dateOrderRefinement = {
  message: 'billing_period_end must be on or after billing_period_start',
  path: ['billing_period_end'],
};
const dueDateRefinement = {
  message: 'due_date must be on or after billing_period_start',
  path: ['due_date'],
};

export const feeGenerationPreviewSchema = z
  .object({
    year_group_ids: z.array(z.string().uuid()).min(1),
    fee_structure_ids: z.array(z.string().uuid()).min(1),
    billing_period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    billing_period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((d) => d.billing_period_end >= d.billing_period_start, dateOrderRefinement)
  .refine((d) => d.due_date >= d.billing_period_start, dueDateRefinement);
export type FeeGenerationPreviewDto = z.infer<typeof feeGenerationPreviewSchema>;

export const feeGenerationConfirmSchema = z
  .object({
    year_group_ids: z.array(z.string().uuid()).min(1),
    fee_structure_ids: z.array(z.string().uuid()).min(1),
    billing_period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    billing_period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    excluded_household_ids: z.array(z.string().uuid()).default([]),
  })
  .refine((d) => d.billing_period_end >= d.billing_period_start, dateOrderRefinement)
  .refine((d) => d.due_date >= d.billing_period_start, dueDateRefinement);
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
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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
  status: z
    .union([
      z.enum([
        'draft',
        'pending_approval',
        'issued',
        'partially_paid',
        'paid',
        'overdue',
        'void',
        'cancelled',
        'written_off',
      ]),
      z.string().transform((s) => s.split(',')),
    ])
    .optional(),
  household_id: z.string().uuid().optional(),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  search: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
  include_lines: z.coerce.boolean().optional(),
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
  amount: z.number().positive(),
  received_at: z.string().datetime(),
  reason: z.string().max(1000).optional(),
});
export type CreatePaymentDto = z.infer<typeof createPaymentSchema>;

export const paymentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  household_id: z.string().uuid().optional(),
  status: z
    .enum(['pending', 'posted', 'failed', 'voided', 'refunded_partial', 'refunded_full'])
    .optional(),
  payment_method: z.enum(['stripe', 'cash', 'bank_transfer', 'card_manual']).optional(),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  search: z.string().optional(),
  accepted_by_user_id: z.string().uuid().optional(),
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
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const statementPdfQuerySchema = z.object({
  locale: z.enum(['en', 'ar']).optional(),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

// ─── Credit Notes ────────────────────────────────────────────────────────────

export const createCreditNoteSchema = z.object({
  household_id: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().min(1).max(2000),
});
export type CreateCreditNoteDto = z.infer<typeof createCreditNoteSchema>;

export const applyCreditNoteSchema = z.object({
  credit_note_id: z.string().uuid(),
  invoice_id: z.string().uuid(),
  applied_amount: z.number().positive(),
});
export type ApplyCreditNoteDto = z.infer<typeof applyCreditNoteSchema>;

export const creditNoteQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  household_id: z.string().uuid().optional(),
});
export type CreditNoteQueryDto = z.infer<typeof creditNoteQuerySchema>;

// ─── Late Fees ────────────────────────────────────────────────────────────────

export const createLateFeeConfigSchema = z.object({
  name: z.string().min(1).max(200),
  fee_type: z.enum(['fixed', 'percent']),
  value: z.number().positive(),
  grace_period_days: z.number().int().min(0).default(0),
  max_applications: z.number().int().min(1).default(1),
  frequency_days: z.number().int().min(1).optional(),
});
export type CreateLateFeeConfigDto = z.infer<typeof createLateFeeConfigSchema>;

export const updateLateFeeConfigSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  fee_type: z.enum(['fixed', 'percent']).optional(),
  value: z.number().positive().optional(),
  grace_period_days: z.number().int().min(0).optional(),
  max_applications: z.number().int().min(1).optional(),
  frequency_days: z.number().int().min(1).nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateLateFeeConfigDto = z.infer<typeof updateLateFeeConfigSchema>;

export const lateFeeConfigQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  active: z.coerce.boolean().optional(),
});
export type LateFeeConfigQueryDto = z.infer<typeof lateFeeConfigQuerySchema>;

// ─── Scholarships ────────────────────────────────────────────────────────────

export const createScholarshipSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  discount_type: z.enum(['fixed', 'percent']),
  value: z.number().positive(),
  student_id: z.string().uuid(),
  award_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  renewal_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  fee_structure_id: z.string().uuid().optional(),
});
export type CreateScholarshipDto = z.infer<typeof createScholarshipSchema>;

export const revokeScholarshipSchema = z.object({
  reason: z.string().min(1).max(2000),
});
export type RevokeScholarshipDto = z.infer<typeof revokeScholarshipSchema>;

export const scholarshipQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  status: z.enum(['active', 'expired', 'revoked']).optional(),
});
export type ScholarshipQueryDto = z.infer<typeof scholarshipQuerySchema>;

// ─── Recurring Invoice Configs ────────────────────────────────────────────────

export const createRecurringInvoiceConfigSchema = z.object({
  fee_structure_id: z.string().uuid(),
  frequency: z.enum(['monthly', 'term']),
  next_generation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type CreateRecurringInvoiceConfigDto = z.infer<typeof createRecurringInvoiceConfigSchema>;

export const updateRecurringInvoiceConfigSchema = z.object({
  frequency: z.enum(['monthly', 'term']).optional(),
  next_generation_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  active: z.boolean().optional(),
});
export type UpdateRecurringInvoiceConfigDto = z.infer<typeof updateRecurringInvoiceConfigSchema>;

export const recurringInvoiceConfigQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  active: z.coerce.boolean().optional(),
});
export type RecurringInvoiceConfigQueryDto = z.infer<typeof recurringInvoiceConfigQuerySchema>;

// ─── Payment Plans ────────────────────────────────────────────────────────────

const proposedInstallmentSchema = z.object({
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
});

export const requestPaymentPlanSchema = z.object({
  proposed_installments: z.array(proposedInstallmentSchema).min(1),
  reason: z.string().min(1).max(2000),
});
export type RequestPaymentPlanDto = z.infer<typeof requestPaymentPlanSchema>;

export const approvePaymentPlanSchema = z.object({
  admin_notes: z.string().max(2000).optional(),
});
export type ApprovePaymentPlanDto = z.infer<typeof approvePaymentPlanSchema>;

export const rejectPaymentPlanSchema = z.object({
  admin_notes: z.string().min(1).max(2000),
});
export type RejectPaymentPlanDto = z.infer<typeof rejectPaymentPlanSchema>;

export const counterOfferPaymentPlanSchema = z.object({
  proposed_installments: z.array(proposedInstallmentSchema).min(1),
  admin_notes: z.string().max(2000).optional(),
});
export type CounterOfferPaymentPlanDto = z.infer<typeof counterOfferPaymentPlanSchema>;

export const paymentPlanRequestQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum([
      'pending',
      'approved',
      'rejected',
      'counter_offered',
      'active',
      'completed',
      'cancelled',
    ])
    .optional(),
});
export type PaymentPlanRequestQueryDto = z.infer<typeof paymentPlanRequestQuerySchema>;

export const createAdminPaymentPlanSchema = z.object({
  household_id: z.string().uuid(),
  original_balance: z.number().positive(),
  discount_amount: z.number().min(0).default(0),
  discount_reason: z.string().max(2000).optional(),
  installments: z
    .array(
      z.object({
        due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amount: z.number().positive(),
      }),
    )
    .min(1),
  admin_notes: z.string().max(2000).optional(),
});
export type CreateAdminPaymentPlanDto = z.infer<typeof createAdminPaymentPlanSchema>;

// ─── Finance Audit ────────────────────────────────────────────────────────────

export const financeAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  entity_type: z.string().optional(),
  entity_id: z.string().uuid().optional(),
  search: z.string().optional(),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type FinanceAuditQueryDto = z.infer<typeof financeAuditQuerySchema>;

// ─── Bulk Operations ──────────────────────────────────────────────────────────

export const bulkInvoiceIdsSchema = z.object({
  invoice_ids: z.array(z.string().uuid()).min(1).max(200),
});
export type BulkInvoiceIdsDto = z.infer<typeof bulkInvoiceIdsSchema>;

export const bulkExportSchema = z.object({
  invoice_ids: z.array(z.string().uuid()).min(1).max(200),
  format: z.enum(['csv', 'pdf']).default('csv'),
});
export type BulkExportDto = z.infer<typeof bulkExportSchema>;

// ─── Custom Report ───────────────────────────────────────────────────────────

export const customFinanceReportQuerySchema = z.object({
  year_group_ids: z
    .preprocess(
      (val) => (typeof val === 'string' ? val.split(',').filter(Boolean) : val),
      z.array(z.string().uuid()),
    )
    .optional(),
  fee_type_ids: z
    .preprocess(
      (val) => (typeof val === 'string' ? val.split(',').filter(Boolean) : val),
      z.array(z.string().uuid()),
    )
    .optional(),
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  status: z.enum(['all', 'outstanding', 'paid']).default('all'),
});
export type CustomFinanceReportQueryDto = z.infer<typeof customFinanceReportQuerySchema>;

// ─── Household Overview ──────────────────────────────────────────────────────

export const householdOverviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(['fully_paid', 'partially_paid', 'unpaid']).optional(),
  overdue: z.coerce.boolean().optional(),
});
