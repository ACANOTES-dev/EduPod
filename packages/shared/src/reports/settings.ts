import { z } from 'zod';

import { reportsAiModuleKeySchema } from './ai-flags';
import { reportKpiKeySchema } from './kpi';

// `reportKpiKeySchema` is the shared enum produced by impl 03; the settings
// endpoint surfaces the hidden list using the same key shape.

/**
 * Reports Settings shared schemas (impl 21).
 *
 * Backs `/v1/reports/settings` (consolidated GET/PUT) and the per-tenant
 * `Settings → Reports` admin page. The endpoint glues three storage areas
 * into one read-modify-write surface:
 *
 *   1. `reports_tenant_settings` — defaults (export format, schedule timezone,
 *      share visibility). One row per tenant; created lazily.
 *   2. `reports_kpi_tenant_preferences` — `hidden_kpi_keys[]`. One row per
 *      tenant (impl 01).
 *   3. `tenant_ai_flags` — three AI feature toggles (`reports_narration`,
 *      `reports_ask_ai`, `reports_predictions`). Seeded `enabled = false`
 *      by impl 01.
 *
 * Each AI flag's `enabled` state is mutated via the existing
 * `PATCH /v1/ai-flags/:moduleKey` endpoint. The settings GET payload includes
 * a denormalised view so the frontend can render the toggles without a
 * separate round-trip.
 */

// ─── Defaults ────────────────────────────────────────────────────────────────

/**
 * Allowed default export formats for the export menu. Mirrors the renderers
 * registered in `apps/api/src/modules/reports/exports/` (impl 04). Extending
 * this list requires shipping a new renderer in the same wave.
 */
export const REPORTS_DEFAULT_EXPORT_FORMATS = ['pdf', 'xlsx', 'docx'] as const;
export type ReportsDefaultExportFormat = (typeof REPORTS_DEFAULT_EXPORT_FORMATS)[number];
export const reportsDefaultExportFormatSchema = z.enum(REPORTS_DEFAULT_EXPORT_FORMATS);

/**
 * Default share visibility for newly-saved reports. Mirrors the
 * `SavedReportVisibility` Prisma enum.
 */
export const reportsDefaultShareVisibilitySchema = z.enum(['private', 'shared']);
export type ReportsDefaultShareVisibility = z.infer<typeof reportsDefaultShareVisibilitySchema>;

/**
 * The `reports_tenant_settings` row shape (excluding metadata).
 *
 * `default_schedule_timezone` is a free-form IANA tz string (e.g.
 * `Europe/Dublin`, `Asia/Riyadh`) — the backend treats anything resolvable
 * by `Intl.DateTimeFormat` as valid. The UI offers a curated dropdown but
 * the API accepts any non-empty string for schedule-cron compatibility.
 */
export const reportsDefaultsSchema = z.object({
  default_export_format: reportsDefaultExportFormatSchema,
  default_schedule_timezone: z.string().min(1).max(64),
  default_share_visibility: reportsDefaultShareVisibilitySchema,
});
export type ReportsDefaultsDto = z.infer<typeof reportsDefaultsSchema>;

/**
 * `PUT /v1/reports/settings/defaults` request body. Every field optional;
 * unsupplied fields are left untouched.
 */
export const updateReportsDefaultsSchema = reportsDefaultsSchema.partial();
export type UpdateReportsDefaultsDto = z.infer<typeof updateReportsDefaultsSchema>;

// ─── KPI visibility ──────────────────────────────────────────────────────────
//
// `updateReportsKpiVisibilitySchema` and its DTO live in `./kpi` (impl 03)
// and are re-used by the settings endpoint without redeclaration.

// ─── AI usage view (read-only, included in GET) ──────────────────────────────

/**
 * Per-flag usage rollup attached to every AI feature in the GET response.
 * Counts are calendar-month-to-date for the tenant's primary timezone.
 *
 * Source: `ai_processing_logs` filtered by `module_key`.
 */
export const reportsAiFeatureUsageSchema = z.object({
  monthly_usage: z.number().int().nonnegative(),
  cost_estimate_usd: z.number().nonnegative(),
});
export type ReportsAiFeatureUsage = z.infer<typeof reportsAiFeatureUsageSchema>;

/**
 * One AI feature's full state in the settings view.
 */
export const reportsAiFeatureStateSchema = z.object({
  module_key: reportsAiModuleKeySchema,
  enabled: z.boolean(),
  updated_at: z.string().datetime(),
  updated_by: z.string().uuid().nullable(),
  usage: reportsAiFeatureUsageSchema,
});
export type ReportsAiFeatureState = z.infer<typeof reportsAiFeatureStateSchema>;

// ─── GET /v1/reports/settings response ───────────────────────────────────────

export const reportsSettingsResponseSchema = z.object({
  defaults: reportsDefaultsSchema,
  kpi_preferences: z.object({
    hidden_kpi_keys: z.array(reportKpiKeySchema),
    updated_at: z.string().datetime().nullable(),
    updated_by: z.string().uuid().nullable(),
  }),
  ai_features: z.array(reportsAiFeatureStateSchema),
  snapshot_retention_days: z.number().int().nonnegative(),
});
export type ReportsSettingsResponse = z.infer<typeof reportsSettingsResponseSchema>;

/**
 * Snapshot retention is informational-only for impl 21 — the cleanup cron is
 * not yet built. The constant lives here so the UI can surface it without
 * hard-coding 90 in two places.
 */
export const REPORTS_SHARE_SNAPSHOT_RETENTION_DAYS = 90;
