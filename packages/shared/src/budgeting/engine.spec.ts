import { buildDefaultDrivers, type Drivers } from './drivers';
import { runEngine, type EngineHorizon } from './engine';
import type { SourceDataSnapshot } from './source-data';

const YG_7 = '11111111-1111-4111-8111-111111111111';
const YG_8 = '22222222-2222-4222-8222-222222222222';
const DEPT_TEACHING = '33333333-3333-4333-8333-333333333333';
const DEPT_ADMIN = '44444444-4444-4444-8444-444444444444';
const TENANT_ID = '55555555-5555-4555-8555-555555555555';
const FEE_TYPE_TUITION = '66666666-6666-4666-8666-666666666666';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const buildSource = (overrides: Partial<SourceDataSnapshot> = {}): SourceDataSnapshot => ({
  captured_at: '2026-04-26T00:00:00.000Z',
  tenant_id: TENANT_ID,
  fiscal_year_start: '2026-09-01',
  fiscal_year_end: '2027-08-31',
  currency_code: 'EUR',
  total_active_students: 200,
  total_active_households: 150,
  students_by_year_group: [
    { year_group_id: YG_7, year_group_name: 'Year 7', active_count: 100 },
    { year_group_id: YG_8, year_group_name: 'Year 8', active_count: 100 },
  ],
  fees_by_year_group: [
    {
      year_group_id: YG_7,
      fee_type_id: FEE_TYPE_TUITION,
      fee_type_name: 'Tuition',
      amount: 5_000,
      billing_frequency: 'one_off',
    },
    {
      year_group_id: YG_8,
      fee_type_id: FEE_TYPE_TUITION,
      fee_type_name: 'Tuition',
      amount: 6_000,
      billing_frequency: 'one_off',
    },
  ],
  staff_by_department: [
    {
      department_id: DEPT_TEACHING,
      department_name: 'Teaching',
      headcount: 20,
      total_annual_payroll: 1_000_000,
    },
    {
      department_id: DEPT_ADMIN,
      department_name: 'Admin',
      headcount: 5,
      total_annual_payroll: 200_000,
    },
  ],
  prior_year_actuals: {
    tuition_revenue: 1_100_000,
    other_income: 30_000,
    staff_costs: 1_180_000,
    utilities: 60_000,
    materials: 25_000,
    donations: 15_000,
    grants: 8_000,
  },
  ...overrides,
});

const buildDrivers = (overrides: Partial<Drivers> = {}): Drivers => ({
  ...buildDefaultDrivers({
    year_group_ids: [YG_7, YG_8],
    department_ids: [DEPT_TEACHING, DEPT_ADMIN],
  }),
  ...overrides,
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('runEngine — happy paths', () => {
  it('default drivers + complete source produce zero-warning, non-empty output', () => {
    const drivers = buildDrivers();
    const source = buildSource();
    const out = runEngine({ drivers, source, horizon_years: 1 });

    expect(out.warnings).toEqual([]);
    expect(out.line_items.length).toBeGreaterThan(0);
    expect(out.totals_by_year).toHaveLength(1);
    expect(out.totals_by_year[0]!.fiscal_year).toBe(1);
    expect(out.totals_by_year[0]!.revenue).toBeGreaterThan(0);
    expect(out.totals_by_year[0]!.expenditure).toBeGreaterThan(0);
    expect(out.per_pupil_unit_economics[0]!.revenue_per_student).toBeGreaterThan(0);
  });

  it('0% growth + 0% uplift produces tuition_gross exactly equal to baseline', () => {
    const drivers = buildDrivers({
      enrollment_growth_pct_by_year_group: { [YG_7]: 0, [YG_8]: 0 },
      fee_uplift_pct_by_year_group: { [YG_7]: 0, [YG_8]: 0 },
    });
    const source = buildSource();
    const out = runEngine({ drivers, source, horizon_years: 1 });

    // Year 7: 100 × 5_000 = 500_000. Year 8: 100 × 6_000 = 600_000. Total: 1_100_000.
    const tuitionGross = out.line_items.find(
      (li) => li.subcategory === 'tuition_gross' && li.fiscal_year === 1,
    );
    expect(tuitionGross).toBeDefined();
    expect(tuitionGross!.amount).toBe(1_100_000);
  });

  it('5% enrollment growth + 5% fee uplift produces tuition ≈ baseline × 1.1025 in year 1', () => {
    const drivers = buildDrivers({
      enrollment_growth_pct_by_year_group: { [YG_7]: 5, [YG_8]: 5 },
      fee_uplift_pct_by_year_group: { [YG_7]: 5, [YG_8]: 5 },
    });
    const source = buildSource();
    const out = runEngine({ drivers, source, horizon_years: 1 });

    const tuitionGross = out.line_items.find(
      (li) => li.subcategory === 'tuition_gross' && li.fiscal_year === 1,
    );
    expect(tuitionGross).toBeDefined();
    // 1_100_000 × 1.05 × 1.05 = 1_212_750
    expect(tuitionGross!.amount).toBeCloseTo(1_212_750, 0);
  });

  it('multi-year compounding: year 3 tuition = baseline × (1.03)^3 with 3% growth/uplift', () => {
    const drivers = buildDrivers({
      enrollment_growth_pct_by_year_group: { [YG_7]: 3, [YG_8]: 3 },
      fee_uplift_pct_by_year_group: { [YG_7]: 3, [YG_8]: 3 },
    });
    const source = buildSource();
    const out = runEngine({ drivers, source, horizon_years: 3 as EngineHorizon });

    const year3Gross = out.line_items.find(
      (li) => li.subcategory === 'tuition_gross' && li.fiscal_year === 3,
    );
    expect(year3Gross).toBeDefined();
    // 1_100_000 × (1.03)^6 (3 years × growth + 3 years × uplift compounded)
    const expected = 1_100_000 * Math.pow(1.03, 6);
    expect(year3Gross!.amount).toBeCloseTo(expected, 0);
  });
});

describe('runEngine — per_year overrides', () => {
  it('per_year[2] enrollment override applies only to year 2', () => {
    const drivers = buildDrivers({
      enrollment_growth_pct_by_year_group: { [YG_7]: 3, [YG_8]: 3 },
      fee_uplift_pct_by_year_group: { [YG_7]: 0, [YG_8]: 0 },
      per_year: {
        '2': {
          enrollment_growth_pct_by_year_group: { [YG_7]: 25, [YG_8]: 25 },
        },
      },
    });
    const source = buildSource();
    const out = runEngine({ drivers, source, horizon_years: 3 as EngineHorizon });

    const grossByYear = (yr: number) =>
      out.line_items.find((li) => li.subcategory === 'tuition_gross' && li.fiscal_year === yr)!
        .amount;

    // Year 1: baseline × 1.03^1 = 1_133_000
    expect(grossByYear(1)).toBeCloseTo(1_100_000 * 1.03, 0);
    // Year 2 uses the per_year override (25% growth) compounding from baseline:
    //   100 × 1.25^2 students × 5_000 + 100 × 1.25^2 × 6_000 = 1_718_750
    expect(grossByYear(2)).toBeCloseTo(1_100_000 * Math.pow(1.25, 2), 0);
    // Year 3 falls back to base (3%): 100 × 1.03^3 students × tuition
    expect(grossByYear(3)).toBeCloseTo(1_100_000 * Math.pow(1.03, 3), 0);
  });
});

describe('runEngine — warnings', () => {
  it('emits NO_FEE_STRUCTURE for a year group missing a fee structure and zero contribution', () => {
    const source = buildSource({
      fees_by_year_group: [
        // Only Year 7 has a fee structure. Year 8 doesn't.
        {
          year_group_id: YG_7,
          fee_type_id: FEE_TYPE_TUITION,
          fee_type_name: 'Tuition',
          amount: 5_000,
          billing_frequency: 'one_off',
        },
      ],
    });
    const out = runEngine({ drivers: buildDrivers(), source, horizon_years: 1 });

    const warning = out.warnings.find((w) => w.code === 'NO_FEE_STRUCTURE');
    expect(warning).toBeDefined();
    expect(warning!.context).toMatchObject({ year_group_id: YG_8, year_group_name: 'Year 8' });

    // Year 8's contribution to tuition_gross should be 0; only Year 7 contributes.
    // With default 3% growth: 100 × 1.03 × 5_000 = 515_000.
    const tuitionGross = out.line_items.find(
      (li) => li.subcategory === 'tuition_gross' && li.fiscal_year === 1,
    );
    expect(tuitionGross!.amount).toBeCloseTo(515_000, 0);
  });

  it('emits NO_PRIOR_ACTUALS once and produces zero operations lines', () => {
    const source = buildSource({ prior_year_actuals: undefined });
    const out = runEngine({ drivers: buildDrivers(), source, horizon_years: 3 as EngineHorizon });

    const noActualsWarnings = out.warnings.filter((w) => w.code === 'NO_PRIOR_ACTUALS');
    expect(noActualsWarnings).toHaveLength(1);

    const operations = out.line_items.filter((li) => li.category === 'operations');
    expect(operations).toEqual([]);
  });

  it('emits NEGATIVE_HEADCOUNT and clamps the projected cost to >= 0', () => {
    const drivers = buildDrivers({
      staff_headcount_delta_by_department: { [DEPT_TEACHING]: -100, [DEPT_ADMIN]: 0 },
    });
    const out = runEngine({ drivers, source: buildSource(), horizon_years: 1 });

    const warning = out.warnings.find((w) => w.code === 'NEGATIVE_HEADCOUNT');
    expect(warning).toBeDefined();
    expect(warning!.context).toMatchObject({ department_id: DEPT_TEACHING });

    const teachingStaff = out.line_items.find(
      (li) => li.category === 'staff_costs' && li.subcategory === DEPT_TEACHING,
    );
    expect(teachingStaff!.amount).toBe(0);
  });

  it('emits CAPEX_OUT_OF_HORIZON when capex_items reference years beyond the horizon', () => {
    const drivers = buildDrivers({
      capex_items: [{ id: 'cx-late', name: 'New gym', amount: 500_000, fiscal_year: 5 }],
    });
    const out = runEngine({ drivers, source: buildSource(), horizon_years: 1 });

    const warning = out.warnings.find((w) => w.code === 'CAPEX_OUT_OF_HORIZON');
    expect(warning).toBeDefined();
    // No capital line items for year 1 since the only capex is in year 5.
    const capital = out.line_items.filter((li) => li.category === 'capital');
    expect(capital).toEqual([]);
  });
});

describe('runEngine — capital', () => {
  it('only lands capex items in their declared fiscal_year', () => {
    const drivers = buildDrivers({
      capex_items: [
        { id: 'cx-y1', name: 'Library refurb', amount: 25_000, fiscal_year: 1 },
        { id: 'cx-y2', name: 'IT refresh', amount: 80_000, fiscal_year: 2 },
        { id: 'cx-y3', name: 'Hall extension', amount: 250_000, fiscal_year: 3 },
      ],
    });
    const out = runEngine({ drivers, source: buildSource(), horizon_years: 3 as EngineHorizon });

    const capitalByYear = (yr: number): number[] =>
      out.line_items
        .filter((li) => li.category === 'capital' && li.fiscal_year === yr)
        .map((li) => li.amount);

    expect(capitalByYear(1)).toEqual([25_000]);
    expect(capitalByYear(2)).toEqual([80_000]);
    expect(capitalByYear(3)).toEqual([250_000]);
  });
});

describe('runEngine — per-pupil economics', () => {
  it('returns null breakeven_students when revenue is 0 (no fee structures)', () => {
    const source = buildSource({
      fees_by_year_group: [], // No fee structures at all.
      prior_year_actuals: undefined,
    });
    const out = runEngine({ drivers: buildDrivers(), source, horizon_years: 1 });

    expect(out.totals_by_year[0]!.revenue).toBe(0);
    expect(out.per_pupil_unit_economics[0]!.breakeven_students).toBeNull();
  });

  it('computes per-student / per-household / breakeven values when revenue is non-zero', () => {
    const out = runEngine({
      drivers: buildDrivers(),
      source: buildSource(),
      horizon_years: 1,
    });

    const economics = out.per_pupil_unit_economics[0]!;
    expect(economics.revenue_per_student).toBeGreaterThan(0);
    expect(economics.revenue_per_household).toBeGreaterThan(0);
    expect(economics.breakeven_students).not.toBeNull();
    expect(economics.breakeven_students! > 0).toBe(true);
  });
});

describe('runEngine — totals', () => {
  it('uses tuition_net (not tuition_gross) in revenue total to avoid double-counting', () => {
    const drivers = buildDrivers({
      // Force a measurable discount + scholarship impact so net != gross.
      discount_capture_pct: 10,
      scholarship_capture_pct: 5,
      enrollment_growth_pct_by_year_group: { [YG_7]: 0, [YG_8]: 0 },
      fee_uplift_pct_by_year_group: { [YG_7]: 0, [YG_8]: 0 },
      donations_forecast: 0,
      grants_forecast: 0,
    });
    const out = runEngine({ drivers, source: buildSource(), horizon_years: 1 });

    // tuition_gross = 1_100_000; net = 1_100_000 × (1 - 0.15) = 935_000.
    // Revenue total should equal net + 0 donations + 0 grants = 935_000.
    expect(out.totals_by_year[0]!.revenue).toBeCloseTo(935_000, 0);
  });
});
