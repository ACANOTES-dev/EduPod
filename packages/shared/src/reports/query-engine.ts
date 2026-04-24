import { z } from 'zod';

import { reportSubjectKeySchema } from './subjects';

/**
 * Zod schemas for the custom-builder query engine. The API uses these to
 * validate incoming preview / execute requests and to emit typed shape
 * guarantees on execution results. The API's internal types mirror these
 * schemas one-to-one (see
 * `apps/api/src/modules/reports/query-engine/query-engine.types.ts`).
 */

// ─── Field types / aggregations / operators ─────────────────────────────────

export const fieldTypeSchema = z.enum(['string', 'number', 'date', 'boolean', 'enum', 'currency']);
export type FieldType = z.infer<typeof fieldTypeSchema>;

export const aggregationSchema = z.enum(['count', 'sum', 'avg', 'min', 'max', 'percent']);
export type Aggregation = z.infer<typeof aggregationSchema>;

export const filterOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'starts_with',
  'ends_with',
  'greater_than',
  'less_than',
  'greater_or_equal',
  'less_or_equal',
  'before',
  'after',
  'on',
  'between',
  'in_list',
  'not_in_list',
  'is_null',
  'is_not_null',
]);
export type FilterOperator = z.infer<typeof filterOperatorSchema>;

// ─── Subject registry descriptor ────────────────────────────────────────────

export interface FieldDescriptor {
  id: string;
  label_key: string;
  domain: string;
  type: FieldType;
  aggregations?: Aggregation[];
  filterable: boolean;
  groupable: boolean;
  permission?: string;
  resolver: string;
  enum_values?: string[];
}

export interface SubjectDescriptor {
  key: string;
  label_key: string;
  icon_name: string;
  primary_model: string;
  fields: FieldDescriptor[];
}

// ─── Query shape ─────────────────────────────────────────────────────────────

export const columnSpecSchema = z.object({
  field_id: z.string().min(1),
  aggregation: aggregationSchema.optional(),
});
export type ColumnSpec = z.infer<typeof columnSpecSchema>;

export const sortSpecSchema = z.object({
  field_id: z.string().min(1),
  direction: z.enum(['asc', 'desc']),
});
export type SortSpec = z.infer<typeof sortSpecSchema>;

export const groupBySpecSchema = z.object({
  field_id: z.string().min(1),
});
export type GroupBySpec = z.infer<typeof groupBySpecSchema>;

export const filterLeafSchema = z.object({
  field_id: z.string().min(1),
  operator: filterOperatorSchema,
  value: z.unknown().optional(),
});
export type FilterLeaf = z.infer<typeof filterLeafSchema>;

/**
 * Recursive AND/OR tree of filter leaves. Parents declare a combinator
 * and a list of children; each child is either another group or a leaf.
 * Unbounded depth is allowed — the builder UI will cap nesting in the
 * UX layer.
 */
export type FilterGroup = {
  combinator: 'and' | 'or';
  filters: Array<FilterLeaf | FilterGroup>;
};

export const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    combinator: z.enum(['and', 'or']),
    filters: z.array(z.union([filterLeafSchema, filterGroupSchema])),
  }),
);

export const savedReportQuerySchema = z.object({
  subject: reportSubjectKeySchema,
  columns: z.array(columnSpecSchema).min(1),
  filters: filterGroupSchema.optional(),
  group_by: z.array(groupBySpecSchema).optional(),
  sort: z.array(sortSpecSchema).optional(),
});
export type SavedReportQuery = z.infer<typeof savedReportQuerySchema>;

// ─── Preview request body ───────────────────────────────────────────────────

/**
 * The body accepted by `POST /v1/reports/builder/preview`. The builder
 * UI posts this on every debounced edit. Pagination is always fixed to
 * 1/50 at the controller — we do not let clients override it because
 * the preview is a UX affordance, not a paged export.
 */
export const previewQuerySchema = z.object({
  query: savedReportQuerySchema,
});
export type PreviewQueryDto = z.infer<typeof previewQuerySchema>;

// ─── Execution result ────────────────────────────────────────────────────────

export interface QueryColumnDescriptor {
  id: string;
  label_key: string;
  type: FieldType;
}

export interface QueryExecutionResult {
  rows: Record<string, unknown>[];
  columns: QueryColumnDescriptor[];
  meta: {
    row_count: number;
    truncated: boolean;
    execution_ms: number;
  };
}

export const queryExecutionResultSchema = z.object({
  rows: z.array(z.record(z.unknown())),
  columns: z.array(
    z.object({
      id: z.string(),
      label_key: z.string(),
      type: fieldTypeSchema,
    }),
  ),
  meta: z.object({
    row_count: z.number(),
    truncated: z.boolean(),
    execution_ms: z.number(),
  }),
});
