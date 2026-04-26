import type { Drivers, PartialDrivers } from './drivers';
import { mergeDriverOverrides, resolveDriversForYear } from './scenario-merge';

const YG_A = '11111111-1111-4111-8111-111111111111';
const YG_B = '22222222-2222-4222-8222-222222222222';
const DEPT_TEACHING = '33333333-3333-4333-8333-333333333333';
const DEPT_ADMIN = '44444444-4444-4444-8444-444444444444';

const buildBase = (): Drivers => ({
  enrollment_growth_pct_by_year_group: { [YG_A]: 3, [YG_B]: 4 },
  fee_uplift_pct_by_year_group: { [YG_A]: 0, [YG_B]: 0 },
  staff_headcount_delta_by_department: { [DEPT_TEACHING]: 0, [DEPT_ADMIN]: 0 },
  salary_uplift_pct: 3,
  discount_capture_pct: 4,
  scholarship_capture_pct: 2,
  utilities_inflation_pct: 4,
  materials_inflation_pct: 3,
  capex_items: [{ id: 'cx1', name: 'Library refurb', amount: 25_000, fiscal_year: 1 }],
  donations_forecast: 10_000,
  grants_forecast: 5_000,
  custom: { existing: 'value' },
});

describe('mergeDriverOverrides', () => {
  it('returns a structural clone equal to base when overrides are empty', () => {
    const base = buildBase();
    const merged = mergeDriverOverrides(base, {});
    expect(merged).toEqual(base);
    // Mutating the merged result must not affect the base — proves clone.
    merged.salary_uplift_pct = 99;
    merged.capex_items.push({ id: 'cx-new', name: 'x', amount: 1, fiscal_year: 1 });
    merged.custom.existing = 'mutated';
    expect(base.salary_uplift_pct).toBe(3);
    expect(base.capex_items).toHaveLength(1);
    expect(base.custom.existing).toBe('value');
  });

  it('replaces top-level scalar fields when overrides are present', () => {
    const base = buildBase();
    const overrides: PartialDrivers = {
      salary_uplift_pct: 7,
      donations_forecast: 25_000,
    };
    const merged = mergeDriverOverrides(base, overrides);
    expect(merged.salary_uplift_pct).toBe(7);
    expect(merged.donations_forecast).toBe(25_000);
    // Untouched scalars stay at base.
    expect(merged.discount_capture_pct).toBe(base.discount_capture_pct);
    expect(merged.utilities_inflation_pct).toBe(base.utilities_inflation_pct);
  });

  it('shallow-merges per-year-group records (override some keys, keep others)', () => {
    const base = buildBase();
    const overrides: PartialDrivers = {
      enrollment_growth_pct_by_year_group: { [YG_A]: 8 },
      fee_uplift_pct_by_year_group: { [YG_B]: 5 },
    };
    const merged = mergeDriverOverrides(base, overrides);
    expect(merged.enrollment_growth_pct_by_year_group).toEqual({ [YG_A]: 8, [YG_B]: 4 });
    expect(merged.fee_uplift_pct_by_year_group).toEqual({ [YG_A]: 0, [YG_B]: 5 });
  });

  it('shallow-merges per-department headcount deltas', () => {
    const base = buildBase();
    const overrides: PartialDrivers = {
      staff_headcount_delta_by_department: { [DEPT_TEACHING]: 2 },
    };
    const merged = mergeDriverOverrides(base, overrides);
    expect(merged.staff_headcount_delta_by_department).toEqual({
      [DEPT_TEACHING]: 2,
      [DEPT_ADMIN]: 0,
    });
  });

  it('replaces capex_items entirely when an override is provided (REPLACE semantics)', () => {
    const base = buildBase();
    const overrides: PartialDrivers = {
      capex_items: [{ id: 'cx2', name: 'IT refresh', amount: 50_000, fiscal_year: 2 }],
    };
    const merged = mergeDriverOverrides(base, overrides);
    expect(merged.capex_items).toEqual(overrides.capex_items);
    // Base capex item is gone.
    expect(merged.capex_items.find((c) => c.id === 'cx1')).toBeUndefined();
  });

  it('blanks capex_items when override is the empty array', () => {
    const base = buildBase();
    const merged = mergeDriverOverrides(base, { capex_items: [] });
    expect(merged.capex_items).toEqual([]);
  });

  it('shallow-merges custom keys (override wins)', () => {
    const base = buildBase();
    const overrides: PartialDrivers = {
      custom: { existing: 'overridden', extra: 42 },
    };
    const merged = mergeDriverOverrides(base, overrides);
    expect(merged.custom).toEqual({ existing: 'overridden', extra: 42 });
  });

  it('shallow-merges per_year per year (override one year, leave others)', () => {
    const base = buildBase();
    base.per_year = {
      '1': { salary_uplift_pct: 2 },
      '2': { salary_uplift_pct: 3 },
    };
    const overrides: PartialDrivers = {
      per_year: {
        '2': { salary_uplift_pct: 6 },
        '3': { salary_uplift_pct: 4 },
      },
    };
    const merged = mergeDriverOverrides(base, overrides);
    expect(merged.per_year).toEqual({
      '1': { salary_uplift_pct: 2 },
      '2': { salary_uplift_pct: 6 },
      '3': { salary_uplift_pct: 4 },
    });
  });
});

describe('resolveDriversForYear', () => {
  it('returns input unchanged when no per_year override is defined', () => {
    const base = buildBase();
    const resolved = resolveDriversForYear(base, 1);
    expect(resolved).toEqual(base);
  });

  it('applies per_year[N] override on top of the base for year N', () => {
    const base = buildBase();
    base.per_year = {
      '2': { salary_uplift_pct: 10, donations_forecast: 99_999 },
    };
    const year1 = resolveDriversForYear(base, 1);
    const year2 = resolveDriversForYear(base, 2);
    expect(year1.salary_uplift_pct).toBe(3);
    expect(year1.donations_forecast).toBe(10_000);
    expect(year2.salary_uplift_pct).toBe(10);
    expect(year2.donations_forecast).toBe(99_999);
  });

  it('leaves other years untouched when only one year has an override', () => {
    const base = buildBase();
    base.per_year = { '2': { salary_uplift_pct: 9 } };
    const year3 = resolveDriversForYear(base, 3);
    expect(year3.salary_uplift_pct).toBe(3);
  });
});
