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

/**
 * Delta indicator on a KPI card — shows change vs. a prior period.
 */
export const kpiDeltaSchema = z.object({
  value: z.number(),
  unit: z.enum(['percent', 'absolute']),
  direction: z.enum(['up', 'down', 'flat']),
  better_when: z.enum(['up', 'down']),
});
export type KpiDelta = z.infer<typeof kpiDeltaSchema>;

/**
 * A single KPI card on the reports dashboard.
 */
export const kpiCardSchema = z.object({
  key: reportKpiKeySchema,
  label_key: z.string(),
  tooltip_key: z.string(),
  value: z.union([z.string(), z.number()]),
  value_raw: z.number(),
  delta: kpiDeltaSchema.nullable(),
  sparkline: z.array(z.number()),
  drill_down_href: z.string(),
  severity: z.enum(['normal', 'warning', 'critical']).nullable(),
});
export type KpiCard = z.infer<typeof kpiCardSchema>;

/**
 * Full KPI dashboard response including trends.
 */
export const kpiDashboardResponseSchema = z.object({
  data: z.object({
    generated_at: z.string().datetime(),
    kpis: z.array(kpiCardSchema),
    trends: z.object({
      weeks: z.array(z.string()),
      attendance: z.array(z.number()),
      grades: z.array(z.number()),
      collection: z.array(z.number()),
    }),
  }),
  meta: z.object({
    cache_hit: z.boolean(),
  }),
});
export type KpiDashboardResponse = z.infer<typeof kpiDashboardResponseSchema>;
