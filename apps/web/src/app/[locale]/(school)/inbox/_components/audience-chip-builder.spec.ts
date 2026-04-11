import type { AudienceDefinition } from '@school/shared/inbox';

import { buildAudienceFromRows, rowsFromAudience, type BuilderRow } from './audience-chip-builder';

describe('buildAudienceFromRows', () => {
  it('returns null for an empty row list', () => {
    expect(buildAudienceFromRows([], 'and')).toBeNull();
  });

  it('returns a single leaf when only one row is present', () => {
    const rows: BuilderRow[] = [
      { id: 'r1', negate: false, provider: 'parents_school', params: {} },
    ];
    expect(buildAudienceFromRows(rows, 'and')).toEqual({
      provider: 'parents_school',
      params: {},
    });
  });

  it('wraps a negated row in a NOT node', () => {
    const rows: BuilderRow[] = [{ id: 'r1', negate: true, provider: 'parents_school', params: {} }];
    expect(buildAudienceFromRows(rows, 'and')).toEqual({
      operator: 'not',
      operand: { provider: 'parents_school', params: {} },
    });
  });

  it('composes multiple valid rows with the top-level operator', () => {
    const rows: BuilderRow[] = [
      { id: 'r1', negate: false, provider: 'parents_school', params: {} },
      {
        id: 'r2',
        negate: false,
        provider: 'fees_in_arrears',
        params: { min_overdue_amount: 500 },
      },
    ];
    const def = buildAudienceFromRows(rows, 'and');
    expect(def).toEqual({
      operator: 'and',
      operands: [
        { provider: 'parents_school', params: {} },
        { provider: 'fees_in_arrears', params: { min_overdue_amount: 500 } },
      ],
    });
  });

  it('filters out rows with invalid list params', () => {
    const rows: BuilderRow[] = [
      { id: 'r1', negate: false, provider: 'parents_school', params: {} },
      { id: 'r2', negate: false, provider: 'class_parents', params: {} },
    ];
    expect(buildAudienceFromRows(rows, 'and')).toEqual({
      provider: 'parents_school',
      params: {},
    });
  });

  it('keeps valid list-param rows', () => {
    const rows: BuilderRow[] = [
      {
        id: 'r1',
        negate: false,
        provider: 'class_parents',
        params: { class_ids: ['00000000-0000-0000-0000-000000000001'] },
      },
    ];
    expect(buildAudienceFromRows(rows, 'and')).toEqual({
      provider: 'class_parents',
      params: { class_ids: ['00000000-0000-0000-0000-000000000001'] },
    });
  });
});

describe('rowsFromAudience', () => {
  it('hydrates a single leaf', () => {
    const def: AudienceDefinition = { provider: 'parents_school', params: {} };
    const result = rowsFromAudience(def);
    expect(result?.rows).toHaveLength(1);
    expect(result?.rows[0]).toMatchObject({
      provider: 'parents_school',
      negate: false,
      params: {},
    });
  });

  it('hydrates a NOT leaf', () => {
    const def: AudienceDefinition = {
      operator: 'not',
      operand: { provider: 'parents_school', params: {} },
    };
    const result = rowsFromAudience(def);
    expect(result?.rows[0]?.negate).toBe(true);
  });

  it('hydrates an AND composition', () => {
    const def: AudienceDefinition = {
      operator: 'and',
      operands: [
        { provider: 'parents_school', params: {} },
        { provider: 'fees_in_arrears', params: {} },
      ],
    };
    const result = rowsFromAudience(def);
    expect(result?.operator).toBe('and');
    expect(result?.rows).toHaveLength(2);
  });

  it('returns null for nested trees that cannot be flattened', () => {
    const def: AudienceDefinition = {
      operator: 'and',
      operands: [
        { provider: 'parents_school', params: {} },
        {
          operator: 'or',
          operands: [
            { provider: 'staff_all', params: {} },
            { provider: 'parents_school', params: {} },
          ],
        },
      ],
    };
    expect(rowsFromAudience(def)).toBeNull();
  });
});
