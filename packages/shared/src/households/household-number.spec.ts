import {
  HOUSEHOLD_MAX_STUDENTS,
  HOUSEHOLD_NUMBER_LENGTH,
  HOUSEHOLD_NUMBER_PATTERN,
  HOUSEHOLD_STUDENT_INDEX_WIDTH,
  formatStudentNumberFromHousehold,
  isValidHouseholdNumber,
} from './household-number';

describe('household-number constants', () => {
  it('HOUSEHOLD_NUMBER_LENGTH is 6', () => {
    expect(HOUSEHOLD_NUMBER_LENGTH).toBe(6);
  });

  it('HOUSEHOLD_MAX_STUDENTS is 99', () => {
    expect(HOUSEHOLD_MAX_STUDENTS).toBe(99);
  });

  it('HOUSEHOLD_STUDENT_INDEX_WIDTH is 2', () => {
    expect(HOUSEHOLD_STUDENT_INDEX_WIDTH).toBe(2);
  });
});

describe('HOUSEHOLD_NUMBER_PATTERN', () => {
  const valid = ['ABC123', 'XYZ476', 'MKL021', 'BPQ839', 'AAA000', 'ZZZ999'];
  const invalid = [
    'abc123', // lowercase
    'AB1234', // only 2 letters
    'ABCD12', // 4 letters
    'ABC12', // only 5 chars
    'ABC1234', // 7 chars
    '123ABC', // digits first
    'ABC 12', // space
    'ABC-12', // separator
    '', // empty
    'A1B2C3', // interleaved
  ];

  it.each(valid)('matches valid pattern: %s', (v) => {
    expect(HOUSEHOLD_NUMBER_PATTERN.test(v)).toBe(true);
  });

  it.each(invalid)('rejects invalid pattern: %s', (v) => {
    expect(HOUSEHOLD_NUMBER_PATTERN.test(v)).toBe(false);
  });
});

describe('isValidHouseholdNumber', () => {
  it('returns true for valid household numbers', () => {
    expect(isValidHouseholdNumber('XYZ476')).toBe(true);
    expect(isValidHouseholdNumber('AAA000')).toBe(true);
  });

  it('returns false for invalid household numbers', () => {
    expect(isValidHouseholdNumber('xyz476')).toBe(false);
    expect(isValidHouseholdNumber('short')).toBe(false);
    expect(isValidHouseholdNumber('')).toBe(false);
  });
});

describe('formatStudentNumberFromHousehold', () => {
  it('pads single-digit indexes to 2 digits', () => {
    expect(formatStudentNumberFromHousehold('XYZ476', 1)).toBe('XYZ476-01');
    expect(formatStudentNumberFromHousehold('XYZ476', 9)).toBe('XYZ476-09');
  });

  it('keeps double-digit indexes as-is', () => {
    expect(formatStudentNumberFromHousehold('XYZ476', 10)).toBe('XYZ476-10');
    expect(formatStudentNumberFromHousehold('XYZ476', 99)).toBe('XYZ476-99');
  });

  it('handles index 0 (edge case)', () => {
    expect(formatStudentNumberFromHousehold('AAA000', 0)).toBe('AAA000-00');
  });

  it('produces correct format for triple-digit index (beyond cap)', () => {
    // The cap is enforced by the service layer, not the formatter
    expect(formatStudentNumberFromHousehold('XYZ476', 100)).toBe('XYZ476-100');
  });
});
