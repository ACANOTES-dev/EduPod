import { z } from 'zod';

// ─── Shared Enum Definitions ────────────────────────────────────────────────

const regulatoryDomainEnum = z.enum([
  'tusla_attendance', 'des_september_returns', 'des_october_census',
  'ppod_sync', 'pod_sync', 'child_safeguarding', 'anti_bullying',
  'fssu_financial', 'inspectorate_wse', 'sen_provision',
  'gdpr_compliance', 'seai_energy', 'admissions_compliance', 'board_governance',
]);

const submissionStatusEnum = z.enum([
  'not_started', 'in_progress', 'ready_for_review', 'submitted',
  'accepted', 'rejected', 'overdue',
]);

// ─── Calendar Events ────────────────────────────────────────────────────────

export const createCalendarEventSchema = z.object({
  domain: regulatoryDomainEnum,
  event_type: z.enum(['hard_deadline', 'soft_deadline', 'preparation', 'reminder']),
  title: z.string().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  due_date: z.string().min(1),
  academic_year: z.string().max(20).nullable().optional(),
  is_recurring: z.boolean().optional().default(false),
  recurrence_rule: z.string().max(100).nullable().optional(),
  reminder_days: z.array(z.number().int().min(0).max(365)).optional().default([]),
  notes: z.string().max(5000).nullable().optional(),
});

export type CreateCalendarEventDto = z.infer<typeof createCalendarEventSchema>;

export const updateCalendarEventSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  due_date: z.string().optional(),
  status: submissionStatusEnum.optional(),
  completed_at: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  reminder_days: z.array(z.number().int().min(0).max(365)).optional(),
});

export type UpdateCalendarEventDto = z.infer<typeof updateCalendarEventSchema>;

export const listCalendarEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  domain: regulatoryDomainEnum.optional(),
  status: submissionStatusEnum.optional(),
  academic_year: z.string().optional(),
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});

export type ListCalendarEventsQueryDto = z.infer<typeof listCalendarEventsQuerySchema>;

// ─── Submissions ────────────────────────────────────────────────────────────

export const createSubmissionSchema = z.object({
  domain: regulatoryDomainEnum,
  submission_type: z.string().min(1).max(100),
  academic_year: z.string().min(1).max(20),
  period_label: z.string().max(50).nullable().optional(),
  status: submissionStatusEnum,
  record_count: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export type CreateSubmissionDto = z.infer<typeof createSubmissionSchema>;

export const updateSubmissionSchema = z.object({
  status: submissionStatusEnum.optional(),
  submitted_at: z.string().nullable().optional(),
  file_key: z.string().max(500).nullable().optional(),
  file_hash: z.string().max(64).nullable().optional(),
  record_count: z.number().int().min(0).nullable().optional(),
  validation_errors: z.array(z.object({
    field: z.string(),
    message: z.string(),
    severity: z.enum(['error', 'warning']),
  })).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export type UpdateSubmissionDto = z.infer<typeof updateSubmissionSchema>;

export const listSubmissionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  domain: regulatoryDomainEnum.optional(),
  status: submissionStatusEnum.optional(),
  academic_year: z.string().optional(),
});

export type ListSubmissionsQueryDto = z.infer<typeof listSubmissionsQuerySchema>;

// ─── Tusla Absence Code Mappings ────────────────────────────────────────────

export const createTuslaAbsenceCodeMappingSchema = z.object({
  attendance_status: z.enum(['absent_excused', 'absent_unexcused', 'absent', 'late', 'left_early']),
  reason_pattern: z.string().max(255).nullable().optional(),
  tusla_category: z.enum(['illness', 'urgent_family_reason', 'holiday', 'suspension', 'expulsion', 'other', 'unexplained']),
  display_label: z.string().min(1).max(100),
  is_default: z.boolean().optional().default(false),
});

export type CreateTuslaAbsenceCodeMappingDto = z.infer<typeof createTuslaAbsenceCodeMappingSchema>;

// ─── Reduced School Days ────────────────────────────────────────────────────

export const createReducedSchoolDaySchema = z.object({
  student_id: z.string().uuid(),
  start_date: z.string().min(1),
  end_date: z.string().nullable().optional(),
  hours_per_day: z.number().min(0).max(24),
  reason: z.enum(['behaviour_management', 'medical_needs', 'phased_return', 'assessment_pending', 'other']),
  reason_detail: z.string().max(5000).nullable().optional(),
  parent_consent_date: z.string().nullable().optional(),
  review_date: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export type CreateReducedSchoolDayDto = z.infer<typeof createReducedSchoolDaySchema>;

export const updateReducedSchoolDaySchema = z.object({
  end_date: z.string().nullable().optional(),
  hours_per_day: z.number().min(0).max(24).optional(),
  reason_detail: z.string().max(5000).nullable().optional(),
  parent_consent_date: z.string().nullable().optional(),
  review_date: z.string().nullable().optional(),
  tusla_notified: z.boolean().optional(),
  is_active: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export type UpdateReducedSchoolDayDto = z.infer<typeof updateReducedSchoolDaySchema>;

// ─── DES Subject Code Mappings ──────────────────────────────────────────────

export const createDesSubjectCodeMappingSchema = z.object({
  subject_id: z.string().uuid(),
  des_code: z.string().min(1).max(10),
  des_name: z.string().min(1).max(150),
  des_level: z.string().max(50).nullable().optional(),
  is_verified: z.boolean().optional().default(false),
});

export type CreateDesSubjectCodeMappingDto = z.infer<typeof createDesSubjectCodeMappingSchema>;

// ─── Tusla Report Generation ────────────────────────────────────────────────

export const generateTuslaSarSchema = z.object({
  academic_year: z.string().min(1).max(20),
  period: z.number().int().min(1).max(2),
  start_date: z.string().min(1),
  end_date: z.string().min(1),
});

export type GenerateTuslaSarDto = z.infer<typeof generateTuslaSarSchema>;

export const generateTuslaAarSchema = z.object({
  academic_year: z.string().min(1).max(20),
});

export type GenerateTuslaAarDto = z.infer<typeof generateTuslaAarSchema>;

export const tuslaThresholdConfigSchema = z.object({
  threshold_days: z.number().int().min(1).max(365).default(20),
});

export type TuslaThresholdConfigDto = z.infer<typeof tuslaThresholdConfigSchema>;

// ─── DES Returns ────────────────────────────────────────────────────────────

export const desReadinessCheckSchema = z.object({
  academic_year: z.string().min(1).max(20),
});

export type DesReadinessCheckDto = z.infer<typeof desReadinessCheckSchema>;

export const octoberReturnsReadinessSchema = z.object({
  academic_year: z.string().min(1).max(20),
});

export type OctoberReturnsReadinessDto = z.infer<typeof octoberReturnsReadinessSchema>;

// ─── PPOD Sync ──────────────────────────────────────────────────────────────

export const ppodImportSchema = z.object({
  database_type: z.enum(['ppod', 'pod']),
  file_content: z.string().min(1),
});

export type PpodImportDto = z.infer<typeof ppodImportSchema>;

export const ppodExportSchema = z.object({
  database_type: z.enum(['ppod', 'pod']),
  scope: z.enum(['full', 'incremental']).default('incremental'),
});

export type PpodExportDto = z.infer<typeof ppodExportSchema>;

// ─── CBA Sync ───────────────────────────────────────────────────────────────

export const cbaSyncSchema = z.object({
  academic_year: z.string().min(1).max(20),
  subject_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
});

export type CbaSyncDto = z.infer<typeof cbaSyncSchema>;

// ─── Inter-School Transfers ─────────────────────────────────────────────────

export const createTransferSchema = z.object({
  student_id: z.string().uuid(),
  direction: z.enum(['inbound', 'outbound']),
  other_school_roll_no: z.string().min(1).max(20),
  other_school_name: z.string().max(255).nullable().optional(),
  transfer_date: z.string().min(1),
  leaving_reason: z.string().max(100).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export type CreateTransferDto = z.infer<typeof createTransferSchema>;

export const updateTransferSchema = z.object({
  status: z.enum(['pending', 'accepted', 'rejected', 'completed', 'cancelled']).optional(),
  ppod_confirmed: z.boolean().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export type UpdateTransferDto = z.infer<typeof updateTransferSchema>;

export const listTransfersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  direction: z.enum(['inbound', 'outbound']).optional(),
  status: z.enum(['pending', 'accepted', 'rejected', 'completed', 'cancelled']).optional(),
  student_id: z.string().uuid().optional(),
});

export type ListTransfersQueryDto = z.infer<typeof listTransfersQuerySchema>;

// ─── Seed Defaults ──────────────────────────────────────────────────────────

export const seedDefaultsSchema = z.object({
  academic_year: z.string().min(1).max(20),
});

export type SeedDefaultsDto = z.infer<typeof seedDefaultsSchema>;
