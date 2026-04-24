import { z } from 'zod';

// ─── Field catalogue (mirror of apps/api compliance-fields.ts) ───────────────

/**
 * Compliance field keys. This list is the contract between the API and any
 * frontend / regulator-facing export. Bumping the list requires bumping
 * `COMPLIANCE_CATALOGUE_VERSION` on the API side so regulators asking about
 * historical reports can be told which catalogue version produced which run.
 */
export const COMPLIANCE_FIELD_KEYS = [
  // Student-facing
  'student_headcount',
  'attendance_rate_annual',
  'chronic_absenteeism_count',
  'exclusions_this_year',
  'sen_register_count',
  'safeguarding_concerns_raised_this_year',
  'critical_incidents_this_year',
  // Staff-facing
  'staff_headcount',
  'teacher_headcount',
  'pupil_teacher_ratio',
  'qualified_teachers_percent',
  'vetting_current_percent',
  'staff_absence_rate_annual',
  // Finance
  'fees_collected_ytd',
  'outstanding_balance_total',
  'write_offs_ytd',
  // Operations
  'school_days_held',
  'instruction_hours_held',
  'teacher_absence_days_uncovered',
] as const;

export type ComplianceFieldKey = (typeof COMPLIANCE_FIELD_KEYS)[number];

export const complianceFieldKeySchema = z.enum(COMPLIANCE_FIELD_KEYS);

export const COMPLIANCE_FIELD_UNITS = ['percent', 'count', 'hours', 'ratio', 'currency'] as const;

export const complianceFieldUnitSchema = z.enum(COMPLIANCE_FIELD_UNITS).nullable();

// ─── Request: generate ───────────────────────────────────────────────────────

/**
 * Request body for `POST /v1/reports/compliance/generate`. `fields` is
 * optional — omitted means "every field in the catalogue at the current
 * version". When present, the service filters the response to the
 * intersection of requested fields and the catalogue.
 */
export const generateComplianceReportSchema = z
  .object({
    academic_year_id: z.string().uuid(),
    fields: z.array(complianceFieldKeySchema).nonempty().optional(),
  })
  .strict();

export type GenerateComplianceReportDto = z.infer<typeof generateComplianceReportSchema>;

// ─── Response: ComplianceField ───────────────────────────────────────────────

/**
 * One field in the generated report. `source` is a plain-English explanation
 * of where the number came from — regulators ask for this. `has_gap = true`
 * means we could not source this field reliably; `gap_reason` explains why
 * so the reader never sees a fabricated number.
 */
export const complianceFieldSchema = z.object({
  key: complianceFieldKeySchema,
  label_key: z.string(),
  value: z.union([z.string(), z.number(), z.null()]),
  unit: complianceFieldUnitSchema,
  source: z.string(),
  last_verified_at: z.string().datetime(),
  has_gap: z.boolean(),
  gap_reason: z.string().optional(),
});

export type ComplianceField = z.infer<typeof complianceFieldSchema>;

// ─── Response: ComplianceReport ──────────────────────────────────────────────

export const complianceReportMetaSchema = z.object({
  catalogue_version: z.string(),
  generated_at: z.string().datetime(),
  generated_by_user_id: z.string().uuid(),
  generation_id: z.string().uuid(),
});

export type ComplianceReportMeta = z.infer<typeof complianceReportMetaSchema>;

export const complianceReportResponseSchema = z.object({
  tenant: z.object({
    id: z.string().uuid(),
    name: z.string(),
    academic_year: z.object({
      id: z.string().uuid(),
      name: z.string(),
      start_date: z.string(),
      end_date: z.string(),
    }),
  }),
  fields: z.array(complianceFieldSchema),
  meta: complianceReportMetaSchema,
});

export type ComplianceReportResponse = z.infer<typeof complianceReportResponseSchema>;

// ─── History ────────────────────────────────────────────────────────────────

export const complianceHistoryQuerySchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ComplianceHistoryQueryDto = z.infer<typeof complianceHistoryQuerySchema>;

export const complianceHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  academic_year_id: z.string().uuid(),
  generated_at: z.string().datetime(),
  generated_by: z.string().uuid(),
  catalogue_version: z.string(),
  field_count: z.number().int(),
  gap_count: z.number().int(),
});

export type ComplianceHistoryEntry = z.infer<typeof complianceHistoryEntrySchema>;
