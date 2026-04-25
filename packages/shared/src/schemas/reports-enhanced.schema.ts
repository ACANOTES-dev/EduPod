import { z } from 'zod';

// ─── Pagination helpers ───────────────────────────────────────────────────────

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const dateRangeSchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

// ─── Unified Dashboard ────────────────────────────────────────────────────────

export const kpiDashboardQuerySchema = z.object({});

export type KpiDashboardQueryDto = z.infer<typeof kpiDashboardQuerySchema>;

// ─── Cross-Module Insights ────────────────────────────────────────────────────

export const crossModuleInsightsQuerySchema = dateRangeSchema.extend({
  year_group_id: z.string().uuid().optional(),
});

export type CrossModuleInsightsQueryDto = z.infer<typeof crossModuleInsightsQuerySchema>;

// ─── Attendance Analytics ────────────────────────────────────────────────────

export const attendanceAnalyticsQuerySchema = dateRangeSchema.extend({
  year_group_id: z.string().uuid().optional(),
  threshold: z.coerce.number().min(0).max(100).default(85),
});

export type AttendanceAnalyticsQueryDto = z.infer<typeof attendanceAnalyticsQuerySchema>;

// ─── Grade Analytics ─────────────────────────────────────────────────────────

export const gradeAnalyticsQuerySchema = z.object({
  year_group_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  academic_period_id: z.string().uuid().optional(),
});

export type GradeAnalyticsQueryDto = z.infer<typeof gradeAnalyticsQuerySchema>;

/**
 * Query schema for the subject-difficulty endpoint's optional "by term"
 * mode (impl 05). When `by=term` is passed the endpoint returns a per-term
 * split instead of the default subject list.
 */
export const subjectDifficultyQuerySchema = z.object({
  year_group_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  by: z.enum(['term']).optional(),
  terms: z.coerce.number().int().min(1).max(12).optional(),
});

export type SubjectDifficultyQueryDto = z.infer<typeof subjectDifficultyQuerySchema>;

// ─── Demographics ────────────────────────────────────────────────────────────

export const demographicsQuerySchema = z.object({
  year_group_id: z.string().uuid().optional(),
});

export type DemographicsQueryDto = z.infer<typeof demographicsQuerySchema>;

/**
 * Query schema for the "enrolment trend by year group" endpoint (impl 05).
 * `year_group_id` travels as a path param; this schema validates the
 * optional `months` window (default 12, max 36).
 */
export const yearGroupTrendQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
});

export type YearGroupTrendQueryDto = z.infer<typeof yearGroupTrendQuerySchema>;

// ─── Student Progress ─────────────────────────────────────────────────────────

export const studentProgressQuerySchema = z.object({
  student_id: z.string().uuid(),
});

export type StudentProgressQueryDto = z.infer<typeof studentProgressQuerySchema>;

/**
 * Query schema for the cohort-trends endpoint (impl 05) — cohort-level
 * attendance + grade aggregates for a single year group across a single
 * academic period. `year_group_id` travels as a path param; this schema
 * validates the required `academic_period_id` query param.
 */
export const cohortTrendsQuerySchema = z.object({
  academic_period_id: z.string().uuid(),
});

export type CohortTrendsQueryDto = z.infer<typeof cohortTrendsQuerySchema>;

// ─── Admissions Analytics ────────────────────────────────────────────────────

export const admissionsAnalyticsQuerySchema = dateRangeSchema;

export type AdmissionsAnalyticsQueryDto = z.infer<typeof admissionsAnalyticsQuerySchema>;

// ─── Staff Analytics ─────────────────────────────────────────────────────────

export const staffAnalyticsQuerySchema = z.object({});

export type StaffAnalyticsQueryDto = z.infer<typeof staffAnalyticsQuerySchema>;

// ─── AI Narrator ─────────────────────────────────────────────────────────────

export const aiNarratorSchema = z.object({
  report_type: z.string().min(1).max(100),
  data: z.record(z.unknown()),
});

export type AiNarratorDto = z.infer<typeof aiNarratorSchema>;

export const aiPredictSchema = z.object({
  report_type: z.string().min(1).max(100),
  historical_data: z.array(z.record(z.unknown())),
});

export type AiPredictDto = z.infer<typeof aiPredictSchema>;

// ─── Custom Report Builder ────────────────────────────────────────────────────

/**
 * Legacy enum (Wave 0) — used by reports already on production. Kept so
 * existing rows still validate on update. New reports MUST use the
 * `REPORT_SUBJECT_KEYS` (Wave 2 / impl 02) — see `data_source` below.
 */
export const reportDataSourceLegacySchema = z.enum([
  'students',
  'attendance',
  'grades',
  'finance',
  'staff',
  'admissions',
]);

/**
 * The 11 new curated subject keys introduced by impl 02. Inlined here
 * (rather than imported from `@school/shared/reports/subjects`) to keep
 * this legacy schemas file self-contained — both copies must stay in
 * sync; the test in `apps/api/test/reports-rebuild-foundation.rls.spec.ts`
 * indirectly enforces the union via fixture round-tripping.
 */
export const reportSubjectKeyLegacyMirrorSchema = z.enum([
  'student',
  'staff',
  'household',
  'class',
  'invoice',
  'application',
  'behaviour_incident',
  'safeguarding_concern',
  'attendance_record',
  'grade',
  'payroll_entry',
]);

/**
 * `data_source` accepts either a legacy enum value (existing reports) or
 * one of the new subject keys. Existing rows continue to read; new rows
 * authored under a new subject key go through the impl-02 query engine.
 */
export const reportDataSourceSchema = z.union([
  reportDataSourceLegacySchema,
  reportSubjectKeyLegacyMirrorSchema,
]);

export type ReportDataSource = z.infer<typeof reportDataSourceSchema>;

export const reportChartTypeSchema = z.enum(['table', 'bar', 'line', 'pie']).nullable();

/**
 * Column spec — accepted in both legacy (string field id) and new
 * (`{field_id, aggregation?}`) shapes. The new shape mirrors
 * `ColumnSpec` from `@school/shared/reports/query-engine`. Mirrored
 * here to keep this schema file dependency-free.
 */
const columnSpecLegacyMirrorSchema = z.union([
  z.string().min(1),
  z.object({
    field_id: z.string().min(1),
    aggregation: z
      .enum(['count', 'sum', 'avg', 'min', 'max', 'percent'])
      .optional(),
  }),
]);

/**
 * Measures spec — accepts the legacy [{field, aggregation}] array OR the
 * new `{sort?: SortSpec[], group_by?: GroupBySpec[]}` object. The
 * deserialiser in `custom-report-builder.service.ts:deserialiseQuery`
 * already handles both shapes.
 */
const measuresLegacySchema = z.array(
  z.object({
    field: z.string(),
    aggregation: z.enum(['count', 'sum', 'average', 'min', 'max', 'percentage', 'rate']),
  }),
);
const measuresNewSchema = z
  .object({
    sort: z
      .array(
        z.object({
          field_id: z.string().min(1),
          direction: z.enum(['asc', 'desc']),
        }),
      )
      .optional(),
    group_by: z
      .array(z.object({ field_id: z.string().min(1) }))
      .optional(),
  })
  .strict();

/**
 * Visibility values mirror the `SavedReportVisibility` Prisma enum from impl
 * 01. The legacy boolean `is_shared` is kept for backwards compatibility —
 * `visibility: 'shared'` and `is_shared: true` round-trip the same row.
 */
export const savedReportVisibilitySchema = z.enum(['private', 'shared']);
export type SavedReportVisibility = z.infer<typeof savedReportVisibilitySchema>;

export const createSavedReportSchema = z.object({
  name: z.string().min(1).max(255),
  data_source: reportDataSourceSchema,
  dimensions_json: z.array(columnSpecLegacyMirrorSchema),
  measures_json: z.union([measuresLegacySchema, measuresNewSchema]),
  // Either legacy free-form record (which the new query engine ignores)
  // OR a structured FilterGroup with `combinator: 'and' | 'or'`. The
  // deserialiser keeps the structured shape and discards the legacy one.
  filters_json: z.record(z.unknown()),
  chart_type: reportChartTypeSchema.optional(),
  is_shared: z.boolean().default(false),
  // Impl 19 — accept the new metadata fields backed by impl 01's columns.
  // All three are optional so existing call sites continue to validate.
  description: z.string().trim().max(2000).nullable().optional(),
  is_favorite: z.boolean().optional(),
  visibility: savedReportVisibilitySchema.optional(),
});

export type CreateSavedReportDto = z.infer<typeof createSavedReportSchema>;

export const updateSavedReportSchema = createSavedReportSchema.partial();

export type UpdateSavedReportDto = z.infer<typeof updateSavedReportSchema>;

export const executeSavedReportSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ExecuteSavedReportDto = z.infer<typeof executeSavedReportSchema>;

export const savedReportsQuerySchema = paginationSchema.extend({
  include_shared: z.coerce.boolean().default(true),
});

export type SavedReportsQueryDto = z.infer<typeof savedReportsQuerySchema>;

// ─── Board Reports ────────────────────────────────────────────────────────────

export const createBoardReportSchema = z.object({
  title: z.string().min(1).max(255),
  academic_period_id: z.string().uuid().optional(),
  report_type: z.enum(['termly', 'annual']),
  sections_json: z.array(z.string()),
});

export type CreateBoardReportDto = z.infer<typeof createBoardReportSchema>;

export const boardReportsQuerySchema = paginationSchema;

export type BoardReportsQueryDto = z.infer<typeof boardReportsQuerySchema>;

// ─── Compliance Report Templates ─────────────────────────────────────────────

export const createComplianceTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  country_code: z.string().length(2),
  fields_json: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      data_type: z.string(),
    }),
  ),
});

export type CreateComplianceTemplateDto = z.infer<typeof createComplianceTemplateSchema>;

export const updateComplianceTemplateSchema = createComplianceTemplateSchema.partial();

export type UpdateComplianceTemplateDto = z.infer<typeof updateComplianceTemplateSchema>;

// ─── Scheduled Reports ────────────────────────────────────────────────────────

/**
 * `format` accepts the legacy 3-format set (`pdf | csv | xlsx`) AND the
 * two new export-pipeline format keys (`excel | word`) introduced by
 * impl 04. `excel` is a strict synonym for `xlsx` (the worker passes the
 * value through to the format dispatcher which normalises both). `word`
 * is the new docx renderer. Backward compatible — every legacy schedule
 * row continues to validate.
 */
export const scheduledReportFormatSchema = z.enum(['pdf', 'csv', 'xlsx', 'excel', 'word']);

export type ScheduledReportFormat = z.infer<typeof scheduledReportFormatSchema>;

export const createScheduledReportSchema = z.object({
  name: z.string().min(1).max(255),
  report_type: z.string().min(1).max(100),
  parameters_json: z.record(z.unknown()),
  schedule_cron: z.string().min(1).max(100),
  recipient_emails: z.array(z.string().email()),
  format: scheduledReportFormatSchema,
  active: z.boolean().default(true),
});

export type CreateScheduledReportDto = z.infer<typeof createScheduledReportSchema>;

export const updateScheduledReportSchema = createScheduledReportSchema.partial();

export type UpdateScheduledReportDto = z.infer<typeof updateScheduledReportSchema>;

export const scheduledReportsQuerySchema = paginationSchema;

export type ScheduledReportsQueryDto = z.infer<typeof scheduledReportsQuerySchema>;

/**
 * Query schema for `GET /v1/reports/scheduled/:reportId/runs` (impl 17).
 * Lists the most recent `scheduled_report_runs` entries for a single
 * scheduled report. Supports pagination; defaults to a sensible 50-row
 * window per the impl 17 spec.
 */
export const scheduledReportRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type ScheduledReportRunsQueryDto = z.infer<typeof scheduledReportRunsQuerySchema>;

// ─── Report Alerts ────────────────────────────────────────────────────────────

/**
 * Legacy alert metrics — pre-impl-09. Kept as a permanent enum so historical
 * `report_alerts` rows continue to validate on update. New alerts authored
 * via the impl 17 UI use the 8-key new metric registry below.
 */
export const reportAlertMetricLegacySchema = z.enum([
  'attendance_rate',
  'collection_rate',
  'overdue_invoice_count',
  'at_risk_student_count',
  'average_grade',
  'staff_absence_rate',
]);

export type ReportAlertMetricLegacy = z.infer<typeof reportAlertMetricLegacySchema>;

/**
 * The 8-key metric registry introduced by impl 09 and surfaced in the
 * impl 17 UI. Inlined here (rather than imported from
 * `@school/shared/reports/alerts`) to keep this legacy schemas file
 * self-contained — both copies must stay in sync; the unit test in
 * `apps/api/src/modules/reports/report-alerts.service.spec.ts` indirectly
 * enforces it via fixture round-tripping. Keep this mirror updated when
 * the registry grows.
 */
export const reportAlertMetricNewMirrorSchema = z.enum([
  'overdue_invoices_count',
  'attendance_rate_today',
  'open_safeguarding_concerns_count',
  'at_risk_students_count',
  'unpaid_balance_total',
  'behaviour_incidents_week',
  'teacher_submission_compliance_week',
  'cover_gaps_week',
]);

/**
 * Union of legacy + new metric keys. The widening mirrors the
 * `data_source` widening in commit `c36a16ae` (saved-report subject keys).
 * Every existing alert continues to validate; new alerts authored via the
 * impl 17 UI flow through the new 8-key set.
 */
export const reportAlertMetricSchema = z.union([
  reportAlertMetricLegacySchema,
  reportAlertMetricNewMirrorSchema,
]);

export type ReportAlertMetric = z.infer<typeof reportAlertMetricSchema>;

/**
 * Operator union — legacy 3 (`lt | gt | eq`) plus the three new operators
 * impl 09 added to the worker (`lte | gte | ne`). The legacy
 * `ReportAlertsService.evaluate()` switch is extended in impl 17 to
 * handle the three new cases.
 */
export const reportAlertOperatorLegacySchema = z.enum(['lt', 'gt', 'eq']);

export type ReportAlertOperatorLegacy = z.infer<typeof reportAlertOperatorLegacySchema>;

export const reportAlertOperatorSchema = z.enum(['lt', 'lte', 'gt', 'gte', 'eq', 'ne']);

export type ReportAlertOperator = z.infer<typeof reportAlertOperatorSchema>;

export const createReportAlertSchema = z.object({
  name: z.string().min(1).max(255),
  metric: reportAlertMetricSchema,
  operator: reportAlertOperatorSchema,
  threshold: z.number(),
  check_frequency: z.enum(['daily', 'weekly']),
  notification_recipients_json: z.array(z.string().email()),
  active: z.boolean().default(true),
});

export type CreateReportAlertDto = z.infer<typeof createReportAlertSchema>;

export const updateReportAlertSchema = createReportAlertSchema.partial();

export type UpdateReportAlertDto = z.infer<typeof updateReportAlertSchema>;

export const reportAlertsQuerySchema = paginationSchema;

export type ReportAlertsQueryDto = z.infer<typeof reportAlertsQuerySchema>;

/**
 * Query schema for `GET /v1/reports/alerts/:alertId/history` (impl 09 +
 * impl 17). Defaults to a 50-row window per impl 17's history-drawer
 * design.
 */
export const reportAlertHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type ReportAlertHistoryQueryDto = z.infer<typeof reportAlertHistoryQuerySchema>;

// ─── Export ───────────────────────────────────────────────────────────────────

export const reportExportQuerySchema = z.object({
  format: z.enum(['xlsx', 'pdf']).default('xlsx'),
});

export type ReportExportQueryDto = z.infer<typeof reportExportQuerySchema>;
