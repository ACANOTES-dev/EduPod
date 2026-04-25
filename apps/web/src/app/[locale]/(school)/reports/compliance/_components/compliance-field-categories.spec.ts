import { COMPLIANCE_FIELD_KEYS } from '@school/shared/reports';

import {
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_FIELDS_BY_CATEGORY,
} from './compliance-field-categories';

describe('compliance-field-categories', () => {
  it('partitions every catalogue field into exactly one category', () => {
    const flat = COMPLIANCE_CATEGORIES.flatMap((cat) => COMPLIANCE_FIELDS_BY_CATEGORY[cat]);
    const unique = new Set(flat);

    // No duplicates across categories.
    expect(flat.length).toBe(unique.size);

    // Every catalogue key is represented.
    for (const key of COMPLIANCE_FIELD_KEYS) {
      expect(unique.has(key)).toBe(true);
    }

    // No spurious keys outside the catalogue.
    expect(flat.length).toBe(COMPLIANCE_FIELD_KEYS.length);
  });

  it('keeps the four canonical category keys', () => {
    expect(Array.from(COMPLIANCE_CATEGORIES)).toEqual([
      'student_facing',
      'staff_facing',
      'finance',
      'operations',
    ]);
  });

  it('finance category is exactly the three monetary keys', () => {
    expect(COMPLIANCE_FIELDS_BY_CATEGORY.finance).toEqual([
      'fees_collected_ytd',
      'outstanding_balance_total',
      'write_offs_ytd',
    ]);
  });
});
