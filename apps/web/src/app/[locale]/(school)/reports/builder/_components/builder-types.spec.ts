import {
  DEFAULT_AGG_BY_TYPE, DEFAULT_BUILDER_STATE, filterableFields, findField,
  groupableFields, humaniseDomain, humaniseFieldLabel, isFilterLeaf,
  OPERATORS_BY_TYPE, toSavedQuery,
  type FieldDescriptor, type SubjectDescriptor, type FilterGroup,
} from './builder-types';

describe('builder-types', () => {
  describe('humaniseFieldLabel', () => {
    it('humanises snake_case ids', () => {
      const f: FieldDescriptor = { id: 'student.identity.first_name', label_key: 'x', domain: 'identity', type: 'string', filterable: true, groupable: false, resolver: 'first_name' };
      expect(humaniseFieldLabel(f)).toBe('First Name');
    });
  });
  describe('humaniseDomain', () => {
    it('humanises snake_case', () => { expect(humaniseDomain('attendance_summary')).toBe('Attendance Summary'); });
  });
  const subject: SubjectDescriptor = {
    key: 'student', label_key: 'reports.subjects.student', icon_name: 'user', primary_model: 'student',
    fields: [
      { id: 'student.identity.first_name', label_key: 'x', domain: 'identity', type: 'string', filterable: true, groupable: false, resolver: 'first_name' },
      { id: 'student.enrolment.year_group', label_key: 'x', domain: 'enrolment', type: 'string', filterable: true, groupable: true, resolver: 'year_group' },
      { id: 'student.identity.dob', label_key: 'x', domain: 'identity', type: 'date', filterable: false, groupable: false, resolver: 'dob' },
    ],
  };
  describe('findField', () => {
    it('returns undefined for null subject', () => { expect(findField(null, 'x')).toBeUndefined(); });
    it('finds an existing field', () => { expect(findField(subject, 'student.identity.first_name')?.type).toBe('string'); });
    it('returns undefined for unknown field id', () => { expect(findField(subject, 'unknown')).toBeUndefined(); });
  });
  describe('filterableFields', () => {
    it('returns only filterable fields', () => {
      expect(filterableFields(subject).map((f) => f.id)).toEqual(['student.identity.first_name', 'student.enrolment.year_group']);
    });
  });
  describe('groupableFields', () => {
    it('returns only groupable fields', () => {
      expect(groupableFields(subject).map((f) => f.id)).toEqual(['student.enrolment.year_group']);
    });
  });
  describe('toSavedQuery', () => {
    it('returns null without subject', () => { expect(toSavedQuery(DEFAULT_BUILDER_STATE)).toBeNull(); });
    it('returns null without columns', () => { expect(toSavedQuery({ ...DEFAULT_BUILDER_STATE, subjectKey: 'student' })).toBeNull(); });
    it('builds detail-rows query', () => {
      expect(toSavedQuery({ ...DEFAULT_BUILDER_STATE, subjectKey: 'student', selectedFieldIds: ['student.identity.first_name'] })).toEqual({
        subject: 'student', columns: [{ field_id: 'student.identity.first_name' }],
      });
    });
    it('attaches aggregations', () => {
      const result = toSavedQuery({
        ...DEFAULT_BUILDER_STATE, subjectKey: 'student',
        selectedFieldIds: ['student.identity.first_name', 'student.enrolment.year_group'],
        columnAggregations: { 'student.identity.first_name': 'count' },
      });
      expect(result?.columns).toEqual([
        { field_id: 'student.identity.first_name', aggregation: 'count' },
        { field_id: 'student.enrolment.year_group' },
      ]);
    });
    it('attaches non-empty filters', () => {
      const filters: FilterGroup = { combinator: 'and', filters: [{ field_id: 'a', operator: 'contains', value: 'A' }] };
      const result = toSavedQuery({ ...DEFAULT_BUILDER_STATE, subjectKey: 'student', selectedFieldIds: ['x'], filters });
      expect(result?.filters).toEqual(filters);
    });
    it('omits empty filters', () => {
      expect(toSavedQuery({ ...DEFAULT_BUILDER_STATE, subjectKey: 'student', selectedFieldIds: ['x'], filters: { combinator: 'and', filters: [] } })?.filters).toBeUndefined();
    });
    it('attaches group_by', () => {
      expect(toSavedQuery({ ...DEFAULT_BUILDER_STATE, subjectKey: 'student', selectedFieldIds: ['x'], groupByFieldId: 'student.enrolment.year_group' })?.group_by)
        .toEqual([{ field_id: 'student.enrolment.year_group' }]);
    });
  });
  describe('isFilterLeaf', () => {
    it('returns true for leaf', () => { expect(isFilterLeaf({ field_id: 'a', operator: 'equals', value: 1 })).toBe(true); });
    it('returns false for group', () => { expect(isFilterLeaf({ combinator: 'and', filters: [] })).toBe(false); });
  });
  describe('OPERATORS_BY_TYPE', () => {
    it('exposes operators per type', () => {
      const types: FieldDescriptor['type'][] = ['string', 'number', 'currency', 'date', 'boolean', 'enum'];
      for (const t of types) expect(OPERATORS_BY_TYPE[t].length).toBeGreaterThan(0);
    });
  });
  describe('DEFAULT_AGG_BY_TYPE', () => {
    it('returns sensible defaults', () => {
      expect(DEFAULT_AGG_BY_TYPE.number).toBe('sum');
      expect(DEFAULT_AGG_BY_TYPE.currency).toBe('sum');
      expect(DEFAULT_AGG_BY_TYPE.string).toBe('count');
    });
  });
});
