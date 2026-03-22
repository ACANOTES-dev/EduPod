import { z } from 'zod';

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

export const tenantSettingsSchema = z.object({
  attendance: z
    .object({
      allowTeacherAmendment: z.boolean().default(false),
      autoLockAfterDays: z.number().int().nullable().default(null),
      pendingAlertTimeHour: z.number().int().min(0).max(23).default(14),
      /** Days of the week when school is in session. 0=Sunday, 1=Monday, ..., 6=Saturday. */
      workDays: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
    })
    .default({}),
  gradebook: z
    .object({
      defaultMissingGradePolicy: z.enum(['exclude', 'zero']).default('exclude'),
      requireGradeComment: z.boolean().default(false),
    })
    .default({}),
  admissions: z
    .object({
      requireApprovalForAcceptance: z.boolean().default(true),
      earlyBirdDiscounts: z.array(z.object({
        deadline: z.string(), // ISO date, e.g. "2025-08-01"
        discount_percent: z.number().min(0).max(100),
        label: z.string(),
      })).default([]),
      cashPaymentDeadlineDays: z.number().int().min(1).default(14),
    })
    .default({}),
  finance: z
    .object({
      requireApprovalForInvoiceIssue: z.boolean().default(false),
      defaultPaymentTermDays: z.number().int().min(0).default(30),
      allowPartialPayment: z.boolean().default(true),
    })
    .default({}),
  communications: z
    .object({
      primaryOutboundChannel: z.enum(['email', 'whatsapp']).default('email'),
      requireApprovalForAnnouncements: z.boolean().default(true),
    })
    .default({}),
  payroll: z
    .object({
      requireApprovalForNonPrincipal: z.boolean().default(true),
      defaultBonusMultiplier: z.number().min(0).default(1.0),
      autoPopulateClassCounts: z.boolean().default(true),
    })
    .default({}),
  general: z
    .object({
      parentPortalEnabled: z.boolean().default(true),
      attendanceVisibleToParents: z.boolean().default(true),
      gradesVisibleToParents: z.boolean().default(true),
      inquiryStaleHours: z.number().int().min(1).default(48),
    })
    .default({}),
  scheduling: z
    .object({
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
    })
    .default({}),
  approvals: z
    .object({
      expiryDays: z.number().int().min(1).default(7),
      reminderAfterHours: z.number().int().min(1).default(48),
    })
    .default({}),
  compliance: z
    .object({
      auditLogRetentionMonths: z.number().int().min(1).default(36),
    })
    .default({}),
});

export type TenantSettingsDto = z.infer<typeof tenantSettingsSchema>;

export const updateBrandingSchema = z.object({
  logo_url: z.string().url().nullable().optional(),
  favicon_url: z.string().url().nullable().optional(),
  primary_colour: z.string().max(50).nullable().optional(),
  secondary_colour: z.string().max(50).nullable().optional(),
  login_background_url: z.string().url().nullable().optional(),
  custom_css: z.string().max(10000).nullable().optional(),
});

export type UpdateBrandingDto = z.infer<typeof updateBrandingSchema>;

export const updateNotificationSettingSchema = z.object({
  is_enabled: z.boolean().optional(),
  channels: z.array(z.string().min(1)).optional(),
}).refine(
  (data) => data.is_enabled !== undefined || data.channels !== undefined,
  { message: 'At least one of is_enabled or channels must be provided' },
);

export type UpdateNotificationSettingDto = z.infer<typeof updateNotificationSettingSchema>;

export const toggleModuleSchema = z.object({
  is_enabled: z.boolean(),
});

export type ToggleModuleDto = z.infer<typeof toggleModuleSchema>;
