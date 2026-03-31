import { z } from 'zod';

import { homeworkSettingsSchema } from './homework.schema';
import { parentDigestSettingsSchema } from './parent-digest.schema';

export const createTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase alphanumeric with dashes'),
  default_locale: z.enum(['en', 'ar']),
  timezone: z.string().min(1).max(100),
  date_format: z.string().min(1).max(50),
  currency_code: z.string().min(1).max(10),
  academic_year_start_month: z.number().int().min(1).max(12),
});

export type CreateTenantDto = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  default_locale: z.enum(['en', 'ar']).optional(),
  timezone: z.string().min(1).max(100).optional(),
  date_format: z.string().min(1).max(50).optional(),
  currency_code: z.string().min(1).max(10).optional(),
  academic_year_start_month: z.number().int().min(1).max(12).optional(),
});

export type UpdateTenantDto = z.infer<typeof updateTenantSchema>;

// ─── Per-module settings schemas ──────────────────────────────────────────────
// Each module section is exported individually so consumers can validate a single
// module's settings without parsing the entire blob (DZ-05 mitigation).

export const attendanceSettingsSchema = z.object({
  allowTeacherAmendment: z.boolean().default(false),
  autoLockAfterDays: z.number().int().nullable().default(null),
  pendingAlertTimeHour: z.number().int().min(0).max(23).default(14),
  /** Days of the week when school is in session. 0=Sunday, 1=Monday, ..., 6=Saturday. */
  workDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  defaultPresentEnabled: z.boolean().default(false),
  notifyParentOnAbsence: z.boolean().default(false),
  patternDetection: z
    .object({
      enabled: z.boolean().default(false),
      excessiveAbsenceThreshold: z.number().int().min(1).default(5),
      excessiveAbsenceWindowDays: z.number().int().min(1).default(14),
      recurringDayThreshold: z.number().int().min(1).default(3),
      recurringDayWindowDays: z.number().int().min(1).default(30),
      tardinessThreshold: z.number().int().min(1).default(4),
      tardinessWindowDays: z.number().int().min(1).default(14),
      parentNotificationMode: z.enum(['auto', 'manual']).default('manual'),
    })
    .default({}),
});

export type AttendanceSettingsDto = z.infer<typeof attendanceSettingsSchema>;

export const gradebookSettingsSchema = z.object({
  defaultMissingGradePolicy: z.enum(['exclude', 'zero']).default('exclude'),
  requireGradeComment: z.boolean().default(false),
  riskDetection: z
    .object({
      enabled: z.boolean().default(false),
    })
    .default({}),
});

export type GradebookSettingsDto = z.infer<typeof gradebookSettingsSchema>;

export const admissionsSettingsSchema = z.object({
  requireApprovalForAcceptance: z.boolean().default(true),
  earlyBirdDiscounts: z
    .array(
      z.object({
        deadline: z.string(), // ISO date, e.g. "2025-08-01"
        discount_percent: z.number().min(0).max(100),
        label: z.string(),
      }),
    )
    .default([]),
  cashPaymentDeadlineDays: z.number().int().min(1).default(14),
});

export type AdmissionsSettingsDto = z.infer<typeof admissionsSettingsSchema>;

export const financeSettingsSchema = z.object({
  requireApprovalForInvoiceIssue: z.boolean().default(false),
  defaultPaymentTermDays: z.number().int().min(0).default(30),
  allowPartialPayment: z.boolean().default(true),
  paymentReminderEnabled: z.boolean().default(true),
  dueSoonReminderDays: z.number().int().min(1).default(3),
  finalNoticeAfterDays: z.number().int().min(1).default(14),
  reminderChannel: z.enum(['email', 'whatsapp', 'both']).default('email'),
  autoIssueRecurringInvoices: z.boolean().default(false),
  lateFeeEnabled: z.boolean().default(false),
  defaultLateFeeConfigId: z.string().uuid().nullable().default(null),
});

export type FinanceSettingsDto = z.infer<typeof financeSettingsSchema>;

export const communicationsSettingsSchema = z.object({
  primaryOutboundChannel: z.enum(['email', 'whatsapp']).default('email'),
  requireApprovalForAnnouncements: z.boolean().default(true),
});

export type CommunicationsSettingsDto = z.infer<typeof communicationsSettingsSchema>;

export const payrollSettingsSchema = z.object({
  requireApprovalForNonPrincipal: z.boolean().default(true),
  defaultBonusMultiplier: z.number().min(0).default(1.0),
  autoPopulateClassCounts: z.boolean().default(true),
});

export type PayrollSettingsDto = z.infer<typeof payrollSettingsSchema>;

export const generalSettingsSchema = z.object({
  parentPortalEnabled: z.boolean().default(true),
  attendanceVisibleToParents: z.boolean().default(true),
  gradesVisibleToParents: z.boolean().default(true),
  inquiryStaleHours: z.number().int().min(1).default(48),
});

export type GeneralSettingsDto = z.infer<typeof generalSettingsSchema>;

export const schedulingSettingsSchema = z.object({
  teacherWeeklyMaxPeriods: z.number().int().nullable().default(null),
  autoSchedulerEnabled: z.boolean().default(true),
  requireApprovalForNonPrincipal: z.boolean().default(true),
  maxSolverDurationSeconds: z.number().int().min(1).default(120),
  preferenceWeights: z
    .object({
      low: z.number().int().min(0).default(1),
      medium: z.number().int().min(0).default(2),
      high: z.number().int().min(0).default(3),
    })
    .default({}),
  globalSoftWeights: z
    .object({
      evenSubjectSpread: z.number().int().min(0).default(2),
      minimiseTeacherGaps: z.number().int().min(0).default(1),
      roomConsistency: z.number().int().min(0).default(1),
      workloadBalance: z.number().int().min(0).default(1),
    })
    .default({}),
});

export type SchedulingSettingsDto = z.infer<typeof schedulingSettingsSchema>;

export const approvalsSettingsSchema = z.object({
  expiryDays: z.number().int().min(1).default(7),
  reminderAfterHours: z.number().int().min(1).default(48),
});

export type ApprovalsSettingsDto = z.infer<typeof approvalsSettingsSchema>;

export const complianceSettingsSchema = z.object({
  auditLogRetentionMonths: z.number().int().min(1).default(36),
});

export type ComplianceSettingsDto = z.infer<typeof complianceSettingsSchema>;

export const aiSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  gradingEnabled: z.boolean().default(false),
  commentsEnabled: z.boolean().default(false),
  progressSummariesEnabled: z.boolean().default(false),
  nlQueriesEnabled: z.boolean().default(false),
  reportNarrationEnabled: z.boolean().default(false),
  predictionsEnabled: z.boolean().default(false),
  substitutionRankingEnabled: z.boolean().default(false),
  attendanceScanEnabled: z.boolean().default(false),
});

export type AiSettingsDto = z.infer<typeof aiSettingsSchema>;

// ─── Composite settings schema ───────────────────────────────────────────────
// Composed from the individual module schemas above.

export const tenantSettingsSchema = z.object({
  attendance: attendanceSettingsSchema.default({}),
  gradebook: gradebookSettingsSchema.default({}),
  admissions: admissionsSettingsSchema.default({}),
  finance: financeSettingsSchema.default({}),
  communications: communicationsSettingsSchema.default({}),
  payroll: payrollSettingsSchema.default({}),
  general: generalSettingsSchema.default({}),
  scheduling: schedulingSettingsSchema.default({}),
  approvals: approvalsSettingsSchema.default({}),
  compliance: complianceSettingsSchema.default({}),
  ai: aiSettingsSchema.default({}),
  homework: homeworkSettingsSchema.default({}),
  parent_digest: parentDigestSettingsSchema.default({}),
});

export type TenantSettingsDto = z.infer<typeof tenantSettingsSchema>;

// ─── Per-module schema lookup map ────────────────────────────────────────────
// Used by the settings service to validate only the module section being written.

export const TENANT_SETTINGS_MODULE_SCHEMAS = {
  attendance: attendanceSettingsSchema,
  gradebook: gradebookSettingsSchema,
  admissions: admissionsSettingsSchema,
  finance: financeSettingsSchema,
  communications: communicationsSettingsSchema,
  payroll: payrollSettingsSchema,
  general: generalSettingsSchema,
  scheduling: schedulingSettingsSchema,
  approvals: approvalsSettingsSchema,
  compliance: complianceSettingsSchema,
  ai: aiSettingsSchema,
  homework: homeworkSettingsSchema,
  parent_digest: parentDigestSettingsSchema,
} as const;

/** Valid module keys for per-module settings validation */
export type TenantSettingsModuleKey = keyof typeof TENANT_SETTINGS_MODULE_SCHEMAS;

export const updateBrandingSchema = z.object({
  logo_url: z.string().url().nullable().optional(),
  favicon_url: z.string().url().nullable().optional(),
  primary_colour: z.string().max(50).nullable().optional(),
  secondary_colour: z.string().max(50).nullable().optional(),
  login_background_url: z.string().url().nullable().optional(),
  custom_css: z.string().max(10000).nullable().optional(),
});

export type UpdateBrandingDto = z.infer<typeof updateBrandingSchema>;

export const updateNotificationSettingSchema = z
  .object({
    is_enabled: z.boolean().optional(),
    channels: z.array(z.string().min(1)).optional(),
  })
  .refine((data) => data.is_enabled !== undefined || data.channels !== undefined, {
    message: 'At least one of is_enabled or channels must be provided',
  });

export type UpdateNotificationSettingDto = z.infer<typeof updateNotificationSettingSchema>;

export const toggleModuleSchema = z.object({
  is_enabled: z.boolean(),
});

export type ToggleModuleDto = z.infer<typeof toggleModuleSchema>;
