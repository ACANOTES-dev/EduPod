import type {
  Aggregation as SharedAggregation,
  ColumnSpec as SharedColumnSpec,
  FilterGroup as SharedFilterGroup,
  FilterLeaf as SharedFilterLeaf,
  FilterOperator as SharedFilterOperator,
  GroupBySpec as SharedGroupBySpec,
  QueryColumnDescriptor,
  QueryExecutionResult as SharedQueryExecutionResult,
  SavedReportQuery as SharedSavedReportQuery,
  SortSpec as SharedSortSpec,
} from '@school/shared/reports';

// ─── Re-exported aliases (API-local readable names) ─────────────────────────

export type FilterOperator = SharedFilterOperator;
export type Aggregation = SharedAggregation;
export type FilterLeaf = SharedFilterLeaf;
export type FilterGroup = SharedFilterGroup;
export type QueryColumn = SharedColumnSpec;
export type QuerySort = SharedSortSpec;
export type QueryGroupBy = SharedGroupBySpec;
export type SavedReportQuery = SharedSavedReportQuery;
export type QueryResultColumn = QueryColumnDescriptor;
export type QueryExecutionResult = SharedQueryExecutionResult;

// ─── Operator and aggregation lists ─────────────────────────────────────────

export const QUERY_FILTER_OPERATORS: readonly FilterOperator[] = [
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
] as const;

export const AGGREGATIONS: readonly Aggregation[] = [
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'percent',
] as const;

// ─── Execution options / tunables ────────────────────────────────────────────

/**
 * Row cap: if the naive row-count probe exceeds this value, the engine
 * refuses the query and returns `REPORT_ROW_CAP_EXCEEDED`. Only applies to
 * ungrouped queries; a group-by query is always bounded by the number of
 * distinct group keys.
 */
export const QUERY_ENGINE_ROW_CAP = 50_000;

/**
 * Query timeout (ms). The engine races the Prisma call against a timer and
 * rejects with `REPORT_QUERY_TIMEOUT` if the query takes longer. A 30-second
 * ceiling balances admin impatience with the legitimate cost of building
 * cross-domain reports over large datasets.
 */
export const QUERY_ENGINE_TIMEOUT_MS = 30_000;

export type QueryExecutionOptions = {
  page: number;
  pageSize: number;
};

// ─── Error codes ─────────────────────────────────────────────────────────────

export const QUERY_ENGINE_ERROR_CODES = {
  INVALID_SUBJECT: 'REPORT_INVALID_SUBJECT',
  UNKNOWN_FIELD: 'REPORT_UNKNOWN_FIELD',
  FIELD_NOT_FILTERABLE: 'REPORT_FIELD_NOT_FILTERABLE',
  FIELD_NOT_GROUPABLE: 'REPORT_FIELD_NOT_GROUPABLE',
  INVALID_OPERATOR_FOR_TYPE: 'REPORT_INVALID_OPERATOR_FOR_TYPE',
  INVALID_AGGREGATION_FOR_TYPE: 'REPORT_INVALID_AGGREGATION_FOR_TYPE',
  AGGREGATION_REQUIRED: 'REPORT_AGGREGATION_REQUIRED',
  ROW_CAP_EXCEEDED: 'REPORT_ROW_CAP_EXCEEDED',
  QUERY_TIMEOUT: 'REPORT_QUERY_TIMEOUT',
  PERMISSION_DENIED: 'REPORT_FIELD_PERMISSION_DENIED',
} as const;
