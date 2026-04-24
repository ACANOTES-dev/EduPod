import { z } from 'zod';

import { reportSubjectKeySchema } from './subjects';

/**
 * `SavedReportDraft` CRUD schemas.
 *
 * A draft is the in-progress builder state persisted per (tenant, user).
 * There is at most ONE draft per user at a time — upsert semantics on
 * `(tenant_id, user_id)`. When the author formally saves a report the
 * draft is cleared.
 *
 * Columns and filters are opaque JSON to the shared layer; the
 * subject-registry service on the backend enforces the per-subject
 * contract (valid field ids, permission scoping, aggregation validity).
 */

// ─── Columns / filters / groupBy / chart config ─────────────────────────────

export const savedReportDraftColumnsSchema = z.object({
  field_ids: z.array(z.string().min(1)).min(1),
});
export type SavedReportDraftColumns = z.infer<typeof savedReportDraftColumnsSchema>;

export const savedReportDraftFilterOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'starts_with',
  'ends_with',
  'greater_than',
  'greater_than_or_equal',
  'less_than',
  'less_than_or_equal',
  'before',
  'after',
  'between',
  'in',
  'not_in',
  'is_null',
  'is_not_null',
]);
export type SavedReportDraftFilterOperator = z.infer<typeof savedReportDraftFilterOperatorSchema>;

export const savedReportDraftFilterSchema = z.object({
  field_id: z.string().min(1),
  operator: savedReportDraftFilterOperatorSchema,
  value: z.unknown().optional(),
});
export type SavedReportDraftFilter = z.infer<typeof savedReportDraftFilterSchema>;

export const savedReportDraftFilterGroupSchema: z.ZodType<{
  combinator: 'and' | 'or';
  filters: Array<SavedReportDraftFilter | { combinator: 'and' | 'or'; filters: unknown[] }>;
}> = z.lazy(() =>
  z.object({
    combinator: z.enum(['and', 'or']),
    filters: z.array(z.union([savedReportDraftFilterSchema, savedReportDraftFilterGroupSchema])),
  }),
);

export const savedReportDraftGroupBySchema = z.object({
  field_id: z.string().min(1),
  measures: z
    .array(
      z.object({
        field_id: z.string().min(1),
        aggregation: z.enum(['count', 'sum', 'avg', 'min', 'max', 'percent']),
      }),
    )
    .optional(),
});
export type SavedReportDraftGroupBy = z.infer<typeof savedReportDraftGroupBySchema>;

export const savedReportChartTypeSchema = z.enum(['table', 'bar', 'line', 'pie', 'kpi']);
export type SavedReportChartType = z.infer<typeof savedReportChartTypeSchema>;

export const savedReportChartConfigSchema = z.object({
  x_axis_field_id: z.string().optional(),
  y_axis_field_id: z.string().optional(),
  series_field_id: z.string().optional(),
});
export type SavedReportChartConfig = z.infer<typeof savedReportChartConfigSchema>;

// ─── Draft DTOs ─────────────────────────────────────────────────────────────

export const upsertSavedReportDraftSchema = z.object({
  subject_key: reportSubjectKeySchema,
  columns_json: savedReportDraftColumnsSchema,
  filters_json: savedReportDraftFilterGroupSchema.default({ combinator: 'and', filters: [] }),
  group_by_json: savedReportDraftGroupBySchema.nullable().optional(),
  chart_type: savedReportChartTypeSchema.nullable().optional(),
  chart_config_json: savedReportChartConfigSchema.nullable().optional(),
});
export type UpsertSavedReportDraftDto = z.infer<typeof upsertSavedReportDraftSchema>;

export const savedReportDraftSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  subject_key: reportSubjectKeySchema,
  columns_json: savedReportDraftColumnsSchema,
  filters_json: savedReportDraftFilterGroupSchema,
  group_by_json: savedReportDraftGroupBySchema.nullable(),
  chart_type: savedReportChartTypeSchema.nullable(),
  chart_config_json: savedReportChartConfigSchema.nullable(),
  updated_at: z.string().datetime(),
});
export type SavedReportDraftDto = z.infer<typeof savedReportDraftSchema>;
