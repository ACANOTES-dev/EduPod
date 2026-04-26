import { z } from 'zod';

/**
 * Mirrors the Prisma `VarianceCachePeriodType` enum on
 * `variance_cache.period_type`.
 *
 * See modeling/PLAN.md §8.
 */
export const VARIANCE_CACHE_PERIOD_TYPES = ['month', 'term', 'year'] as const;

export type VarianceCachePeriodType = (typeof VARIANCE_CACHE_PERIOD_TYPES)[number];

export const varianceCachePeriodTypeSchema = z.enum(VARIANCE_CACHE_PERIOD_TYPES);

// ─── Query DTO ────────────────────────────────────────────────────────────

/**
 * `GET /v1/budgeting/financial-models/:id/variance` query.
 * Defaults to the monthly grain — `period_label` (e.g. "Sep 2026") is
 * optional; when omitted the endpoint returns every cached period.
 */
export const varianceQuerySchema = z.object({
  period_type: varianceCachePeriodTypeSchema.default('month'),
  period_label: z.string().max(32).optional(),
});

export type VarianceQueryDto = z.infer<typeof varianceQuerySchema>;

// ─── Manual actuals upsert DTO ────────────────────────────────────────────

/**
 * `POST /v1/budgeting/financial-models/:id/variance/manual-actuals`
 * body. Used for ops categories that have no Finance/Payroll source
 * (e.g. Operations → Maintenance) — schools type the figure straight
 * into the dashboard.
 *
 * `line_item_key` is the same composite key the engine emits, e.g.
 *  "income.tuition_net", "operations.maintenance",
 *  "staff_costs.<department_slug>". Validated as
 *  `<lowercase_underscore_category>.<freeform_subcategory>`.
 */
export const manualActualEntrySchema = z.object({
  period_type: varianceCachePeriodTypeSchema,
  period_label: z.string().max(32),
  line_item_key: z
    .string()
    .max(128)
    .regex(/^[a-z_]+\.[a-zA-Z0-9_-]+$/),
  amount: z.number().min(0).max(1e10),
});

export type ManualActualEntryDto = z.infer<typeof manualActualEntrySchema>;

// ─── Response row ─────────────────────────────────────────────────────────

/**
 * One row of the variance dashboard. `variance` and `variance_pct` are
 * pre-computed by the variance worker (or by `upsertManualActual` for
 * manual entries); the API never recomputes on read.
 */
export type VarianceRow = {
  category: string;
  subcategory: string;
  line_item_key: string;
  period_label: string;
  planned: number;
  actual: number;
  variance: number;
  variance_pct: number;
  drivers_json: Record<string, unknown> | null;
};
