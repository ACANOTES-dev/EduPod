import { z } from 'zod';

// ─── Leave Types ─────────────────────────────────────────────────────────────

export const leaveTypeResponseSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  label: z.string(),
  requires_approval: z.boolean(),
  is_paid_default: z.boolean(),
  max_days_per_request: z.number().nullable(),
  requires_evidence: z.boolean(),
  display_order: z.number(),
});

export type LeaveTypeResponse = z.infer<typeof leaveTypeResponseSchema>;

// Admin-facing variant: includes scope (system vs tenant override) and is_active.
// `tenant_id` is the row's own tenant (null = system default, not this tenant's).
export const leaveTypeAdminResponseSchema = leaveTypeResponseSchema.extend({
  tenant_id: z.string().uuid().nullable(),
  is_active: z.boolean(),
  is_system: z.boolean(),
  is_overridden: z.boolean(),
  system_code_match: z.string().nullable(),
});

export type LeaveTypeAdminResponse = z.infer<typeof leaveTypeAdminResponseSchema>;

const LEAVE_CODE_REGEX = /^[a-z][a-z0-9_]*$/;

export const createLeaveTypeSchema = z.object({
  code: z.string().min(1).max(50).regex(LEAVE_CODE_REGEX, {
    message: 'code must be lowercase letters, digits, or underscores',
  }),
  label: z.string().min(1).max(100),
  requires_approval: z.boolean().default(true),
  is_paid_default: z.boolean().default(true),
  max_days_per_request: z.number().int().min(1).max(365).nullable().optional(),
  requires_evidence: z.boolean().default(false),
  display_order: z.number().int().min(0).max(9999).default(100),
});

export type CreateLeaveTypeDto = z.infer<typeof createLeaveTypeSchema>;

export const updateLeaveTypeSchema = z.object({
  label: z.string().min(1).max(100).optional(),
  requires_approval: z.boolean().optional(),
  is_paid_default: z.boolean().optional(),
  max_days_per_request: z.number().int().min(1).max(365).nullable().optional(),
  requires_evidence: z.boolean().optional(),
  display_order: z.number().int().min(0).max(9999).optional(),
  is_active: z.boolean().optional(),
});

export type UpdateLeaveTypeDto = z.infer<typeof updateLeaveTypeSchema>;

// ─── Leave Balance ───────────────────────────────────────────────────────────

export const leaveBalancePerTypeSchema = z.object({
  leave_type_id: z.string().uuid(),
  code: z.string(),
  label: z.string(),
  is_paid_default: z.boolean(),
  days_taken: z.number(),
  days_pending: z.number(),
  approved_requests: z.number(),
  pending_requests: z.number(),
});

export type LeaveBalancePerType = z.infer<typeof leaveBalancePerTypeSchema>;

export const leaveBalanceResponseSchema = z.object({
  staff_profile_id: z.string().uuid().nullable(),
  staff_name: z.string().nullable(),
  academic_year: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      start_date: z.string(),
      end_date: z.string(),
    })
    .nullable(),
  totals: z.object({
    pending_count: z.number(),
    approved_count: z.number(),
    total_days_taken: z.number(),
    total_days_pending: z.number(),
  }),
  per_type: z.array(leaveBalancePerTypeSchema),
});

export type LeaveBalanceResponse = z.infer<typeof leaveBalanceResponseSchema>;

// ─── Leave Request ───────────────────────────────────────────────────────────

export const createLeaveRequestSchema = z
  .object({
    leave_type_id: z.string().uuid(),
    date_from: z.string().date(),
    date_to: z.string().date(),
    full_day: z.boolean().default(true),
    period_from: z.number().int().min(0).nullable().optional(),
    period_to: z.number().int().min(0).nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
    evidence_url: z.string().url().max(500).nullable().optional(),
  })
  .refine((d) => d.date_to >= d.date_from, {
    message: 'date_to must be on or after date_from',
    path: ['date_to'],
  })
  .refine((d) => d.full_day || (d.period_from !== undefined && d.period_from !== null), {
    message: 'period_from is required when full_day is false',
    path: ['period_from'],
  });

export type CreateLeaveRequestDto = z.infer<typeof createLeaveRequestSchema>;

export const reviewLeaveRequestSchema = z.object({
  review_notes: z.string().max(1000).nullable().optional(),
});

export type ReviewLeaveRequestDto = z.infer<typeof reviewLeaveRequestSchema>;

export const leaveRequestQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled', 'withdrawn']).optional(),
  staff_id: z.string().uuid().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type LeaveRequestQuery = z.infer<typeof leaveRequestQuerySchema>;
