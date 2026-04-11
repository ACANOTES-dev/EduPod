// ─── Household number format constants ────────────────────────────────────────
// Single source of truth for both generation and validation. Any code that
// generates or parses a household number must import from here.

export const HOUSEHOLD_NUMBER_LENGTH = 6;

/**
 * Three uppercase letters followed by three digits, no separators.
 * Example: XYZ476, MKL021, BPQ839.
 * Address space: 26^3 x 10^3 = 17,576,000 values per tenant.
 */
export const HOUSEHOLD_NUMBER_PATTERN = /^[A-Z]{3}[0-9]{3}$/;

/** Hard cap on students per household. */
export const HOUSEHOLD_MAX_STUDENTS = 99;

/** Zero-padded per-household student index width (always 2 digits). */
export const HOUSEHOLD_STUDENT_INDEX_WIDTH = 2;

/** Max retry attempts when generating a fresh household number. */
export const HOUSEHOLD_NUMBER_GENERATION_MAX_ATTEMPTS = 8;

export function isValidHouseholdNumber(value: string): boolean {
  return HOUSEHOLD_NUMBER_PATTERN.test(value);
}

export function formatStudentNumberFromHousehold(householdNumber: string, index: number): string {
  return `${householdNumber}-${String(index).padStart(HOUSEHOLD_STUDENT_INDEX_WIDTH, '0')}`;
}
