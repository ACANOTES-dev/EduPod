import type {
  Aggregation,
  FieldDescriptor,
  FilterGroup,
  FilterLeaf,
  FilterOperator,
  ReportSubjectKey,
  SavedReportChartType,
  SavedReportQuery,
  SubjectDescriptor,
} from '@school/shared/reports';

export type {
  Aggregation, FieldDescriptor, FilterGroup, FilterLeaf, FilterOperator,
  ReportSubjectKey, SavedReportChartType, SavedReportQuery, SubjectDescriptor,
};

export interface BuilderState {
  subjectKey: ReportSubjectKey | null;
  selectedFieldIds: string[];
  columnAggregations: Record<string, Aggregation>;
  filters: FilterGroup;
  groupByFieldId: string | null;
  chartType: SavedReportChartType;
  chartConfig: { x_axis_field_id?: string; y_axis_field_id?: string; kpi_field_id?: string };
}

export const DEFAULT_BUILDER_STATE: BuilderState = {
  subjectKey: null, selectedFieldIds: [], columnAggregations: {},
  filters: { combinator: 'and', filters: [] }, groupByFieldId: null,
  chartType: 'table', chartConfig: {},
};

export const OPERATORS_BY_TYPE: Record<FieldDescriptor['type'], FilterOperator[]> = {
  string: ['equals', 'not_equals', 'contains', 'starts_with', 'ends_with', 'is_null', 'is_not_null'],
  number: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'between', 'is_null', 'is_not_null'],
  currency: ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'between', 'is_null', 'is_not_null'],
  date: ['on', 'before', 'after', 'between', 'is_null', 'is_not_null'],
  boolean: ['equals', 'is_null', 'is_not_null'],
  enum: ['equals', 'not_equals', 'in_list', 'not_in_list', 'is_null', 'is_not_null'],
};

export const DEFAULT_AGG_BY_TYPE: Record<FieldDescriptor['type'], Aggregation> = {
  string: 'count', enum: 'count', boolean: 'count', number: 'sum', currency: 'sum', date: 'count',
};

let __filterIdCounter = 0;
export function nextFilterId(): string { __filterIdCounter += 1; return `f-${__filterIdCounter}-${Date.now()}`; }

export function toSavedQuery(state: BuilderState): SavedReportQuery | null {
  if (!state.subjectKey || state.selectedFieldIds.length === 0) return null;
  return {
    subject: state.subjectKey,
    columns: state.selectedFieldIds.map((id) => {
      const aggregation = state.columnAggregations[id];
      return aggregation ? { field_id: id, aggregation } : { field_id: id };
    }),
    filters: state.filters.filters.length > 0 ? state.filters : undefined,
    group_by: state.groupByFieldId ? [{ field_id: state.groupByFieldId }] : undefined,
  };
}

export function humaniseFieldLabel(field: FieldDescriptor): string {
  const tail = field.id.split('.').slice(-1)[0] ?? field.id;
  return tail.split('_').map((p) => (p.length === 0 ? '' : p[0]!.toUpperCase() + p.slice(1))).join(' ');
}

export function humaniseDomain(domain: string): string {
  return domain.split('_').map((p) => (p.length === 0 ? '' : p[0]!.toUpperCase() + p.slice(1))).join(' ');
}

export function findField(subject: SubjectDescriptor | null, fieldId: string): FieldDescriptor | undefined {
  if (!subject) return undefined;
  return subject.fields.find((f) => f.id === fieldId);
}

export function filterableFields(subject: SubjectDescriptor | null): FieldDescriptor[] {
  if (!subject) return [];
  return subject.fields.filter((f) => f.filterable);
}

export function groupableFields(subject: SubjectDescriptor | null): FieldDescriptor[] {
  if (!subject) return [];
  return subject.fields.filter((f) => f.groupable);
}

export function isFilterLeaf(node: FilterLeaf | FilterGroup): node is FilterLeaf {
  return Object.prototype.hasOwnProperty.call(node, 'field_id');
}
