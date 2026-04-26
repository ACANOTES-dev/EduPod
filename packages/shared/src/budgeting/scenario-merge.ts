import type { Drivers, PartialDrivers } from './drivers';

/**
 * Merge a base case's drivers with a scenario's overrides per the rules in
 * modeling/PLAN.md §5.2.
 *
 *   - Top-level scalar fields: replace if present.
 *   - Per-year-group / per-department records: shallow merge (override
 *     the keys that appear; keep base values for the others).
 *   - capex_items: REPLACE — a scenario can blank or change capex
 *     entirely without inheriting base items.
 *   - custom: shallow merge.
 *   - per_year: shallow merge per year (year-N overrides replace
 *     year-N base; other years untouched).
 *
 * Pure function. No IO, no mutation of inputs (uses structuredClone).
 */
export const mergeDriverOverrides = (base: Drivers, overrides: PartialDrivers): Drivers => {
  const merged: Drivers = structuredClone(base);

  // ─── Top-level scalar fields ─────────────────────────────────────────────
  const scalarKeys = [
    'salary_uplift_pct',
    'discount_capture_pct',
    'scholarship_capture_pct',
    'utilities_inflation_pct',
    'materials_inflation_pct',
    'donations_forecast',
    'grants_forecast',
  ] as const;
  for (const key of scalarKeys) {
    const value = overrides[key];
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  // ─── Per-year-group records — shallow merge ──────────────────────────────
  const yearGroupRecordKeys = [
    'enrollment_growth_pct_by_year_group',
    'fee_uplift_pct_by_year_group',
  ] as const;
  for (const key of yearGroupRecordKeys) {
    const override = overrides[key];
    if (override) {
      merged[key] = { ...base[key], ...override };
    }
  }

  if (overrides.staff_headcount_delta_by_department) {
    merged.staff_headcount_delta_by_department = {
      ...base.staff_headcount_delta_by_department,
      ...overrides.staff_headcount_delta_by_department,
    };
  }

  // ─── Capex — REPLACE semantics ──────────────────────────────────────────
  if (overrides.capex_items !== undefined) {
    merged.capex_items = overrides.capex_items;
  }

  // ─── Custom — shallow merge ──────────────────────────────────────────────
  if (overrides.custom) {
    merged.custom = { ...base.custom, ...overrides.custom };
  }

  // ─── per_year — shallow merge per year ───────────────────────────────────
  if (overrides.per_year) {
    merged.per_year = { ...(base.per_year ?? {}), ...overrides.per_year };
  }

  return merged;
};

/**
 * Resolve effective drivers for a specific fiscal year, applying
 * `per_year[N]` overrides on top of the (already-merged) drivers.
 *
 * If no `per_year` override exists for the given year, returns the
 * input drivers unchanged.
 */
export const resolveDriversForYear = (drivers: Drivers, fiscal_year: number): Drivers => {
  const yearOverride = drivers.per_year?.[String(fiscal_year)];
  if (!yearOverride) return drivers;
  return mergeDriverOverrides(drivers, yearOverride);
};
