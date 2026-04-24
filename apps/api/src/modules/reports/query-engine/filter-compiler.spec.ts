import { BadRequestException } from '@nestjs/common';

import type { FieldDescriptor } from '../subject-registry/types';

import { coerceValue, compileFilterGroup } from './filter-compiler';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const stringField: FieldDescriptor = {
  id: 'student.first_name',
  label_key: 'x',
  domain: 'identity',
  type: 'string',
  filterable: true,
  groupable: false,
  resolver: 'first_name',
};

const numberField: FieldDescriptor = {
  id: 'student.age',
  label_key: 'x',
  domain: 'identity',
  type: 'number',
  filterable: true,
  groupable: true,
  resolver: 'age',
};

const dateField: FieldDescriptor = {
  id: 'student.entry_date',
  label_key: 'x',
  domain: 'enrolment',
  type: 'date',
  filterable: true,
  groupable: false,
  resolver: 'entry_date',
};

const enumField: FieldDescriptor = {
  id: 'student.status',
  label_key: 'x',
  domain: 'identity',
  type: 'enum',
  filterable: true,
  groupable: true,
  enum_values: ['active', 'inactive'],
  resolver: 'status',
};

const nonFilterableField: FieldDescriptor = {
  id: 'student.age_computed',
  label_key: 'x',
  domain: 'identity',
  type: 'number',
  filterable: false,
  groupable: true,
  resolver: 'computed_age',
};

const nestedField: FieldDescriptor = {
  id: 'student.household.city',
  label_key: 'x',
  domain: 'household',
  type: 'string',
  filterable: true,
  groupable: true,
  resolver: 'household_city',
};

function buildMap(fields: FieldDescriptor[]): Map<string, FieldDescriptor> {
  return new Map(fields.map((f) => [f.id, f]));
}

const columnMap: Record<string, string | null> = {
  'student.first_name': 'first_name',
  'student.age': 'age',
  'student.entry_date': 'entry_date',
  'student.status': 'status',
  'student.household.city': 'household.city',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('compileFilterGroup — operator × type matrix', () => {
  const scoped = buildMap([stringField, numberField, dateField, enumField, nestedField]);

  it('returns empty object for an empty filter group', () => {
    expect(compileFilterGroup(undefined, scoped, columnMap)).toEqual({});
    expect(compileFilterGroup({ combinator: 'and', filters: [] }, scoped, columnMap)).toEqual({});
  });

  it('compiles `equals` on string into a direct column comparison', () => {
    const out = compileFilterGroup(
      {
        combinator: 'and',
        filters: [{ field_id: 'student.first_name', operator: 'equals', value: 'Alice' }],
      },
      scoped,
      columnMap,
    );
    expect(out).toEqual({ first_name: 'Alice' });
  });

  it('compiles `contains` with case-insensitive mode', () => {
    const out = compileFilterGroup(
      {
        combinator: 'and',
        filters: [{ field_id: 'student.first_name', operator: 'contains', value: 'al' }],
      },
      scoped,
      columnMap,
    );
    expect(out).toEqual({ first_name: { contains: 'al', mode: 'insensitive' } });
  });

  it('compiles `greater_than` on number → `gt`', () => {
    const out = compileFilterGroup(
      {
        combinator: 'and',
        filters: [{ field_id: 'student.age', operator: 'greater_than', value: 12 }],
      },
      scoped,
      columnMap,
    );
    expect(out).toEqual({ age: { gt: 12 } });
  });

  it('compiles `before` on date → `lt` with a Date', () => {
    const out = compileFilterGroup(
      {
        combinator: 'and',
        filters: [{ field_id: 'student.entry_date', operator: 'before', value: '2025-01-01' }],
      },
      scoped,
      columnMap,
    );
    expect(out).toHaveProperty('entry_date');
    const predicate = (out as { entry_date: { lt: Date } }).entry_date;
    expect(predicate.lt).toBeInstanceOf(Date);
  });

  it('compiles `between` on number into { gte, lte }', () => {
    const out = compileFilterGroup(
      {
        combinator: 'and',
        filters: [{ field_id: 'student.age', operator: 'between', value: [10, 12] }],
      },
      scoped,
      columnMap,
    );
    expect(out).toEqual({ age: { gte: 10, lte: 12 } });
  });

  it('compiles `in_list` on enum → `in`', () => {
    const out = compileFilterGroup(
      {
        combinator: 'and',
        filters: [
          { field_id: 'student.status', operator: 'in_list', value: ['active', 'inactive'] },
        ],
      },
      scoped,
      columnMap,
    );
    expect(out).toEqual({ status: { in: ['active', 'inactive'] } });
  });

  it('compiles `is_null` to `null`', () => {
    const out = compileFilterGroup(
      { combinator: 'and', filters: [{ field_id: 'student.entry_date', operator: 'is_null' }] },
      scoped,
      columnMap,
    );
    expect(out).toEqual({ entry_date: null });
  });

  it('compiles `is_not_null` to { not: null }', () => {
    const out = compileFilterGroup(
      { combinator: 'and', filters: [{ field_id: 'student.entry_date', operator: 'is_not_null' }] },
      scoped,
      columnMap,
    );
    expect(out).toEqual({ entry_date: { not: null } });
  });

  it('compiles nested dotted column path into a nested object', () => {
    const out = compileFilterGroup(
      {
        combinator: 'and',
        filters: [{ field_id: 'student.household.city', operator: 'equals', value: 'Dublin' }],
      },
      scoped,
      columnMap,
    );
    expect(out).toEqual({ household: { city: 'Dublin' } });
  });

  it('joins sibling leaves with AND when combinator is `and`', () => {
    const out = compileFilterGroup(
      {
        combinator: 'and',
        filters: [
          { field_id: 'student.first_name', operator: 'equals', value: 'Alice' },
          { field_id: 'student.status', operator: 'equals', value: 'active' },
        ],
      },
      scoped,
      columnMap,
    );
    expect(out).toEqual({ AND: [{ first_name: 'Alice' }, { status: 'active' }] });
  });

  it('joins sibling leaves with OR when combinator is `or`', () => {
    const out = compileFilterGroup(
      {
        combinator: 'or',
        filters: [
          { field_id: 'student.first_name', operator: 'equals', value: 'Alice' },
          { field_id: 'student.first_name', operator: 'equals', value: 'Bob' },
        ],
      },
      scoped,
      columnMap,
    );
    expect(out).toEqual({ OR: [{ first_name: 'Alice' }, { first_name: 'Bob' }] });
  });

  it('rejects unknown field ids with REPORT_UNKNOWN_FIELD', () => {
    expect(() =>
      compileFilterGroup(
        { combinator: 'and', filters: [{ field_id: 'nope.gone', operator: 'equals', value: 1 }] },
        scoped,
        columnMap,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects filtering on a non-filterable field', () => {
    const withComputed = buildMap([nonFilterableField]);
    expect(() =>
      compileFilterGroup(
        {
          combinator: 'and',
          filters: [{ field_id: 'student.age_computed', operator: 'equals', value: 12 }],
        },
        withComputed,
        { 'student.age_computed': null },
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a type-incompatible operator (contains on number)', () => {
    expect(() =>
      compileFilterGroup(
        {
          combinator: 'and',
          filters: [{ field_id: 'student.age', operator: 'contains', value: '12' }],
        },
        scoped,
        columnMap,
      ),
    ).toThrow(BadRequestException);
  });
});

describe('coerceValue', () => {
  it('coerces ISO date strings to Date for date fields', () => {
    const out = coerceValue('2026-04-01', 'date');
    expect(out).toBeInstanceOf(Date);
  });

  it('coerces numeric strings to numbers for number fields', () => {
    expect(coerceValue('42', 'number')).toBe(42);
  });

  it('coerces "true" to true for boolean fields', () => {
    expect(coerceValue('true', 'boolean')).toBe(true);
  });

  it('leaves string values untouched for string fields', () => {
    expect(coerceValue('Alice', 'string')).toBe('Alice');
  });

  it('throws on invalid date strings', () => {
    expect(() => coerceValue('not-a-date', 'date')).toThrow(BadRequestException);
  });

  it('throws on invalid numeric strings', () => {
    expect(() => coerceValue('twelve', 'number')).toThrow(BadRequestException);
  });
});
