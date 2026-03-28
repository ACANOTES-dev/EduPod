import { z } from 'zod';

import { paginationQuerySchema } from '../schemas/pagination.schema';

// ─── Data Categories ────────────────────────────────────────────────────────

export const RETENTION_DATA_CATEGORIES = [
  'active_student_records',
  'graduated_withdrawn_students',
  'rejected_admissions',
  'financial_records',
  'payroll_records',
  'staff_records_post_employment',
  'attendance_records',
  'behaviour_records',
  'child_protection_safeguarding',
  'communications_notifications',
  'audit_logs',
  'contact_form_submissions',
  'parent_inquiry_messages',
  'nl_query_history',
  'ai_processing_logs',
  'tokenisation_usage_logs',
  's3_compliance_exports',
] as const;

export type RetentionDataCategory = (typeof RETENTION_DATA_CATEGORIES)[number];

export const RETENTION_EXPIRY_ACTIONS = ['anonymise', 'delete', 'archive'] as const;
export type RetentionExpiryAction = (typeof RETENTION_EXPIRY_ACTIONS)[number];

// ─── Response Schemas ───────────────────────────────────────────────────────

export const retentionPolicySchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid().nullable(),
  data_category: z.enum(RETENTION_DATA_CATEGORIES),
  retention_months: z.number().int().min(0),
  action_on_expiry: z.enum(RETENTION_EXPIRY_ACTIONS),
  is_overridable: z.boolean(),
  statutory_basis: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  // Computed field: whether this is a tenant override or platform default
  is_override: z.boolean().optional(),
  // Computed field: the platform default value (for comparison in UI)
  default_retention_months: z.number().int().min(0).optional(),
});
export type RetentionPolicyDto = z.infer<typeof retentionPolicySchema>;

// ─── Update Schema ──────────────────────────────────────────────────────────

export const updateRetentionPolicySchema = z.object({
  retention_months: z.number().int().min(1),
});
export type UpdateRetentionPolicyDto = z.infer<typeof updateRetentionPolicySchema>;

// ─── Preview Schema ─────────────────────────────────────────────────────────

export const retentionPreviewRequestSchema = z.object({
  data_category: z.enum(RETENTION_DATA_CATEGORIES).optional(),
});
export type RetentionPreviewRequestDto = z.infer<typeof retentionPreviewRequestSchema>;

export const retentionPreviewResultSchema = z.object({
  data_category: z.enum(RETENTION_DATA_CATEGORIES),
  retention_months: z.number().int(),
  action_on_expiry: z.enum(RETENTION_EXPIRY_ACTIONS),
  affected_count: z.number().int().min(0),
});
export type RetentionPreviewResultDto = z.infer<typeof retentionPreviewResultSchema>;

// ─── Retention Hold Schemas ─────────────────────────────────────────────────

export const RETENTION_HOLD_SUBJECT_TYPES = ['student', 'parent', 'staff', 'household'] as const;
export type RetentionHoldSubjectType = (typeof RETENTION_HOLD_SUBJECT_TYPES)[number];

export const createRetentionHoldSchema = z.object({
  subject_type: z.enum(RETENTION_HOLD_SUBJECT_TYPES),
  subject_id: z.string().uuid(),
  reason: z.string().min(1).max(5000),
});
export type CreateRetentionHoldDto = z.infer<typeof createRetentionHoldSchema>;

export const retentionHoldSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  subject_type: z.enum(RETENTION_HOLD_SUBJECT_TYPES),
  subject_id: z.string().uuid(),
  reason: z.string(),
  held_by_user_id: z.string().uuid(),
  held_at: z.string().datetime(),
  released_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});
export type RetentionHoldDto = z.infer<typeof retentionHoldSchema>;

export const retentionHoldsQuerySchema = paginationQuerySchema.pick({
  page: true,
  pageSize: true,
});
export type RetentionHoldsQueryDto = z.infer<typeof retentionHoldsQuerySchema>;
