import { z } from 'zod';

/**
 * Stable keys for the report-alert metric registry. Each key maps to
 * a server-side calculator that returns a single numeric value for a
 * tenant — see `apps/api/src/modules/reports/report-alerts/metric-registry.ts`
 * for the full implementation. The Wave 3 impl 09 worker evaluates every
 * enabled alert against its metric on a 30-minute cron and dispatches
 * inbox notifications when thresholds are crossed.
 *
 * Adding a new key here is the single source of truth: the server
 * registry, the API metric enum, and the alerts CRUD UI all key off
 * `REPORT_ALERT_METRIC_KEYS`. Removing a key is a breaking change —
 * existing tenant alerts referencing it will degrade to `unknown_metric`
 * and silently no-op until updated.
 */
export const REPORT_ALERT_METRIC_KEYS = [
  'overdue_invoices_count',
  'attendance_rate_today',
  'open_safeguarding_concerns_count',
  'at_risk_students_count',
  'unpaid_balance_total',
  'behaviour_incidents_week',
  'teacher_submission_compliance_week',
  'cover_gaps_week',
] as const;

export type ReportAlertMetricKey = (typeof REPORT_ALERT_METRIC_KEYS)[number];

export const reportAlertMetricKeySchema = z.enum(REPORT_ALERT_METRIC_KEYS);

/**
 * The full operator set the worker evaluator supports. The legacy CRUD
 * schema in `reports-enhanced.schema.ts` only accepts `lt | gt | eq` for
 * backwards-compat with existing alerts; the new metric registry adds
 * `lte | gte | ne` so impl 09 / impl 17 can express ≤, ≥, and ≠
 * thresholds without forcing a 1-cent epsilon hack.
 */
export const REPORT_ALERT_OPERATORS = ['lt', 'lte', 'gt', 'gte', 'eq', 'ne'] as const;

export type ReportAlertOperator = (typeof REPORT_ALERT_OPERATORS)[number];

export const reportAlertOperatorSchema = z.enum(REPORT_ALERT_OPERATORS);

/**
 * Outcome of a single alert evaluation, persisted to `report_alert_runs`.
 * Shape matches the Prisma `ReportAlertRunOutcome` enum exactly.
 */
export const REPORT_ALERT_RUN_OUTCOMES = ['ok', 'threshold_crossed', 'error'] as const;

export type ReportAlertRunOutcome = (typeof REPORT_ALERT_RUN_OUTCOMES)[number];

export const reportAlertRunOutcomeSchema = z.enum(REPORT_ALERT_RUN_OUTCOMES);

/**
 * One row in the alert-history listing returned by
 * `GET /v1/reports/alerts/:id/history`. Mirrors the `report_alert_runs`
 * table 1-to-1.
 */
export const reportAlertRunSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  report_alert_id: z.string().uuid(),
  evaluated_at: z.string().datetime(),
  outcome: reportAlertRunOutcomeSchema,
  measured_value: z.number().nullable(),
  threshold_value: z.number().nullable(),
  notified_user_ids: z.array(z.string().uuid()),
  error_message: z.string().nullable(),
});

export type ReportAlertRun = z.infer<typeof reportAlertRunSchema>;

/**
 * Anti-spam window in milliseconds. An alert that fired in the last
 * `ALERT_ANTISPAM_WINDOW_MS` and has not since reverted to `ok` will
 * suppress further dispatch — a single `threshold_crossed` followed by
 * a `threshold_crossed` returns `outcome: threshold_crossed,
 * notified_user_ids: []` so the run row still records the evaluation
 * but no inbox message goes out. Crossing back through `ok` resets the
 * suppression so the next genuine flip-up fires again.
 */
export const ALERT_ANTISPAM_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Notification template key used when an alert fires. The web client's
 * notification list keys off this value to render the alert-specific
 * card layout.
 */
export const REPORT_ALERT_NOTIFICATION_TEMPLATE = 'reports.alert_threshold_crossed';
