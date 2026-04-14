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
