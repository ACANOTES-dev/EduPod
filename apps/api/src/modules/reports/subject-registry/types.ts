import type { ReportSubjectKey } from '@school/shared/reports';

import type { Aggregation, FilterOperator } from '../query-engine/query-engine.types';

// ─── Field descriptor ────────────────────────────────────────────────────────

/**
 * A field's intrinsic type. Determines valid filter operators, valid
 * aggregations, and how the value is rendered in the builder UI.
 */
export type FieldType = 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'currency';

/**
 * One leaf in the subject's curated field tree. A field is selectable as a
 * column, as a filter (if `filterable`), or as a group-by key (if
 * `groupable`). Optional `permission` gates visibility — users without the
 * permission never see the field in the tree and cannot reference it in a
 * query.
 *
 * `resolver` is a string key into the subject's resolver map. The query
 * engine invokes the resolver with the raw Prisma row to produce the flat
 * value returned to the client. This indirection lets the field tree
 * reference computed fields (age, attendance rate, overdue amount) that
 * don't map 1-to-1 to a database column.
 */
export type FieldDescriptor = {
  id: string;
  label_key: string;
  domain: string;
  type: FieldType;
  aggregations?: readonly Aggregation[];
  filterable: boolean;
  groupable: boolean;
  permission?: string;
  resolver: string;
  /**
   * Optional enum values exposed to the builder UI. Populated only for
   * `type: 'enum'` fields — a Gender enum, a Status enum, etc. Surfacing
   * these to the frontend lets the filter picker render a select instead
   * of a free-text input.
   */
  enum_values?: readonly string[];
};

export type SubjectDescriptor = {
  key: ReportSubjectKey;
  label_key: string;
  icon_name: string;
  primary_model: string;
  fields: readonly FieldDescriptor[];
};

// ─── Operator / aggregation legality tables ─────────────────────────────────

/**
 * Which filter operators are legal for each field type. The query engine
 * checks this before compiling; a mismatch is a 400 citing the field id.
 */
export const OPERATOR_TYPE_MATRIX: Readonly<Record<FieldType, readonly FilterOperator[]>> = {
  string: [
    'equals',
    'not_equals',
    'contains',
    'starts_with',
    'ends_with',
    'in_list',
    'not_in_list',
    'is_null',
    'is_not_null',
  ],
  number: [
    'equals',
    'not_equals',
    'greater_than',
    'less_than',
    'greater_or_equal',
    'less_or_equal',
    'between',
    'in_list',
    'not_in_list',
    'is_null',
    'is_not_null',
  ],
  date: ['equals', 'not_equals', 'before', 'after', 'on', 'between', 'is_null', 'is_not_null'],
  boolean: ['equals', 'not_equals', 'is_null', 'is_not_null'],
  enum: ['equals', 'not_equals', 'in_list', 'not_in_list', 'is_null', 'is_not_null'],
  currency: [
    'equals',
    'not_equals',
    'greater_than',
    'less_than',
    'greater_or_equal',
    'less_or_equal',
    'between',
    'is_null',
    'is_not_null',
  ],
};

/**
 * Which aggregations are meaningful for each field type when the field is
 * used as a measure under a group-by. Used to reject nonsense combinations
 * (e.g. `avg` on a boolean, `sum` on a string).
 */
export const DEFAULT_AGGREGATIONS_BY_TYPE: Readonly<Record<FieldType, readonly Aggregation[]>> = {
  string: ['count'],
  number: ['count', 'sum', 'avg', 'min', 'max'],
  date: ['count', 'min', 'max'],
  boolean: ['count', 'percent'],
  enum: ['count'],
  currency: ['count', 'sum', 'avg', 'min', 'max'],
};
