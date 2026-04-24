import { z } from 'zod';

/**
 * Stable keys for the 10 KPI cards on the reports dashboard. Each key
 * maps to a tooltip, drill-down route, and backend data provider — see
 * reports-rebuild/PLAN.md §3 for the full specification.
 *
 * Order in this array is the default display order on the dashboard.
 */
export const REPORT_KPI_KEYS = [
  'attendance_today',
  'teacher_submission_compliance',
  'at_risk_students',
  'behaviour_incidents_this_week',
  'open_safeguarding_concerns',
  'overdue_invoices',
  'grades_submission_lag',
  'new_applications_this_week',
  'parent_escalations',
  'cover_gaps_this_week',
] as const;

export type ReportKpiKey = (typeof REPORT_KPI_KEYS)[number];

export const reportKpiKeySchema = z.enum(REPORT_KPI_KEYS);

/**
 * Tooltip metadata surfaced on every KPI card. The backend produces these
 * alongside the card value; the UI renders them behind the info icon.
 *
 * `calculation` is plain English ("present / expected sessions"), not a
 * SQL snippet — non-technical admins read it.
 */
export const reportKpiTooltipSchema = z.object({
  what_it_means: z.string().min(1),
  how_calculated: z.string().min(1),
  why_it_matters: z.string().min(1),
});
export type ReportKpiTooltip = z.infer<typeof reportKpiTooltipSchema>;

/**
 * Input shape for `PATCH /v1/reports/settings/kpi-visibility`.
 * Replaces the full hidden-keys list per request (not a diff).
 */
export const updateReportsKpiVisibilitySchema = z.object({
  hidden_kpi_keys: z.array(reportKpiKeySchema),
});
export type UpdateReportsKpiVisibilityDto = z.infer<typeof updateReportsKpiVisibilitySchema>;

export const reportsKpiTenantPreferencesSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  hidden_kpi_keys: z.array(reportKpiKeySchema),
  updated_at: z.string().datetime(),
  updated_by: z.string().uuid().nullable(),
});
export type ReportsKpiTenantPreferencesDto = z.infer<typeof reportsKpiTenantPreferencesSchema>;
