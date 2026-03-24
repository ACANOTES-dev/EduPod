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

// ─── Demographics ────────────────────────────────────────────────────────────

export const demographicsQuerySchema = z.object({
  year_group_id: z.string().uuid().optional(),
});

export type DemographicsQueryDto = z.infer<typeof demographicsQuerySchema>;

// ─── Student Progress ─────────────────────────────────────────────────────────

export const studentProgressQuerySchema = z.object({
  student_id: z.string().uuid(),
});

export type StudentProgressQueryDto = z.infer<typeof studentProgressQuerySchema>;

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

export const reportDataSourceSchema = z.enum([
  'students',
  'attendance',
  'grades',
  'finance',
  'staff',
  'admissions',
]);

export type ReportDataSource = z.infer<typeof reportDataSourceSchema>;

export const reportChartTypeSchema = z.enum(['table', 'bar', 'line', 'pie']).nullable();

export const createSavedReportSchema = z.object({
  name: z.string().min(1).max(255),
  data_source: reportDataSourceSchema,
  dimensions_json: z.array(z.string()),
  measures_json: z.array(
    z.object({
      field: z.string(),
      aggregation: z.enum(['count', 'sum', 'average', 'min', 'max', 'percentage', 'rate']),
    }),
  ),
  filters_json: z.record(z.unknown()),
  chart_type: reportChartTypeSchema.optional(),
  is_shared: z.boolean().default(false),
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

export const createScheduledReportSchema = z.object({
  name: z.string().min(1).max(255),
  report_type: z.string().min(1).max(100),
  parameters_json: z.record(z.unknown()),
  schedule_cron: z.string().min(1).max(100),
  recipient_emails: z.array(z.string().email()),
  format: z.enum(['pdf', 'csv', 'xlsx']),
  active: z.boolean().default(true),
});

export type CreateScheduledReportDto = z.infer<typeof createScheduledReportSchema>;

export const updateScheduledReportSchema = createScheduledReportSchema.partial();

export type UpdateScheduledReportDto = z.infer<typeof updateScheduledReportSchema>;

export const scheduledReportsQuerySchema = paginationSchema;

export type ScheduledReportsQueryDto = z.infer<typeof scheduledReportsQuerySchema>;

// ─── Report Alerts ────────────────────────────────────────────────────────────

export const reportAlertMetricSchema = z.enum([
  'attendance_rate',
  'collection_rate',
  'overdue_invoice_count',
  'at_risk_student_count',
  'average_grade',
  'staff_absence_rate',
]);

export type ReportAlertMetric = z.infer<typeof reportAlertMetricSchema>;

export const reportAlertOperatorSchema = z.enum(['lt', 'gt', 'eq']);

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

// ─── Export ───────────────────────────────────────────────────────────────────

export const reportExportQuerySchema = z.object({
  format: z.enum(['xlsx', 'pdf']).default('xlsx'),
});

export type ReportExportQueryDto = z.infer<typeof reportExportQuerySchema>;
