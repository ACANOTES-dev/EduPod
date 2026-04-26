import type { Drivers } from './drivers';
import type { FinancialModelLineItemCategory } from './line-items';
import { resolveDriversForYear } from './scenario-merge';
import type { SourceDataSnapshot } from './source-data';

/**
 * Pure-TypeScript calculation engine for annual financial models.
 *
 * **Zero IO. Zero async. Zero side effects.** Runs identically on Node
 * (backend services, board-pack worker) and browser (live recompute as
 * the user tunes drivers in the workspace UI).
 *
 * Inputs:
 *   - `drivers`     — already merged with any scenario overrides.
 *   - `source`      — frozen tenant-state snapshot captured at model
 *                     creation time (students/staff/fees/prior-year
 *                     actuals).
 *   - `horizon_years` — 1, 3, or 5.
 *
 * Outputs the engine returns:
 *   - `line_items`              — every driver-derived line, broken down
 *                                 by category × subcategory × year.
 *   - `totals_by_year`          — revenue / expenditure / net per year.
 *   - `per_pupil_unit_economics` — per-student / per-household economics
 *                                  + breakeven threshold.
 *   - `warnings`                — soft signals surfaced to the UI (e.g.
 *                                 "no fee structure for Year 7 — assumed
 *                                 0 revenue").
 *
 * See modeling/PLAN.md §4.3 for the full semantics.
 */

// ─── Output types ──────────────────────────────────────────────────────────

export type ComputedLineItem = {
  category: FinancialModelLineItemCategory;
  subcategory: string;
  name: string;
  fiscal_year: number;
  source: 'driver_derived';
  amount: number;
  /**
   * Breadcrumb of which drivers fed this line. Powers the variance
   * service's "drivers of variance" tooltip — "Year 7 enrollment came
   * in 12 students lower than projected, accounts for £14k of the gap".
   */
  computed_from: Record<string, unknown>;
};

export type YearTotals = {
  fiscal_year: number;
  revenue: number;
  expenditure: number;
  net_result: number;
};

export type PerPupilEconomics = {
  fiscal_year: number;
  revenue_per_student: number;
  expenditure_per_student: number;
  net_per_student: number;
  revenue_per_household: number;
  /** null when the year's average fee per student is 0 (avoids div-by-0). */
  breakeven_students: number | null;
};

export type EngineWarningCode =
  | 'NO_FEE_STRUCTURE'
  | 'NO_PRIOR_ACTUALS'
  | 'NEGATIVE_HEADCOUNT'
  | 'CAPEX_OUT_OF_HORIZON';

export type EngineWarning = {
  level: 'info' | 'warning';
  code: EngineWarningCode;
  message: string;
  context?: Record<string, unknown>;
};

export type EngineHorizon = 1 | 3 | 5;

export type EngineInputs = {
  drivers: Drivers;
  source: SourceDataSnapshot;
  horizon_years: EngineHorizon;
};

export type EngineOutputs = {
  line_items: ComputedLineItem[];
  totals_by_year: YearTotals[];
  per_pupil_unit_economics: PerPupilEconomics[];
  warnings: EngineWarning[];
};

// ─── Main entrypoint ───────────────────────────────────────────────────────

export const runEngine = (inputs: EngineInputs): EngineOutputs => {
  const { drivers, source, horizon_years } = inputs;
  const line_items: ComputedLineItem[] = [];
  const warnings: EngineWarning[] = [];
  const seenNoActualsWarning = { emitted: false };

  for (let year = 1; year <= horizon_years; year++) {
    const effectiveDrivers = resolveDriversForYear(drivers, year);

    line_items.push(...computeIncomeLines(effectiveDrivers, source, year, warnings));
    line_items.push(...computeStaffCostLines(effectiveDrivers, source, year, warnings));
    line_items.push(
      ...computeOperationsLines(effectiveDrivers, source, year, warnings, seenNoActualsWarning),
    );
    line_items.push(...computeCapitalLines(effectiveDrivers, year));
    // Reserves & adjustments are user-authored custom line items — engine
    // emits nothing here.
  }

  // Capex items declared outside the horizon are silently dropped by
  // computeCapitalLines; surface a single info warning so the UI can flag
  // them on the drivers panel.
  for (const capex of drivers.capex_items) {
    if (capex.fiscal_year > horizon_years) {
      warnings.push({
        level: 'info',
        code: 'CAPEX_OUT_OF_HORIZON',
        message: `Capex item "${capex.name}" declared for year ${capex.fiscal_year} but model horizon is ${horizon_years} years; item will not appear until horizon is extended.`,
        context: { capex_item_id: capex.id, capex_item_name: capex.name },
      });
    }
  }

  const totals_by_year = aggregateTotals(line_items, horizon_years);
  const per_pupil_unit_economics = computePerPupilEconomics(totals_by_year, source);

  return { line_items, totals_by_year, per_pupil_unit_economics, warnings };
};

// ─── Section: Income ───────────────────────────────────────────────────────

const computeIncomeLines = (
  drivers: Drivers,
  source: SourceDataSnapshot,
  year: number,
  warnings: EngineWarning[],
): ComputedLineItem[] => {
  const items: ComputedLineItem[] = [];

  let tuitionGross = 0;
  for (const yg of source.students_by_year_group) {
    const growth = drivers.enrollment_growth_pct_by_year_group[yg.year_group_id] ?? 0;
    const projectedCount = yg.active_count * Math.pow(1 + growth / 100, year);
    const fees = source.fees_by_year_group.filter((f) => f.year_group_id === yg.year_group_id);
    if (fees.length === 0) {
      warnings.push({
        level: 'warning',
        code: 'NO_FEE_STRUCTURE',
        message: `No fee structure defined for year group ${yg.year_group_name}; assumed 0 revenue.`,
        context: { year_group_id: yg.year_group_id, year_group_name: yg.year_group_name },
      });
      continue;
    }
    const uplift = drivers.fee_uplift_pct_by_year_group[yg.year_group_id] ?? 0;
    const annualisedPerStudent =
      fees.reduce((acc, f) => {
        // monthly → 12 applications, term → 3 (assumes 3-term academic
        // year), one_off → 1. Mirrors the Prisma BillingFrequency enum
        // values supplied by SourceDataSnapshot.
        const months =
          f.billing_frequency === 'monthly' ? 12 : f.billing_frequency === 'term' ? 3 : 1;
        return acc + f.amount * months;
      }, 0) * Math.pow(1 + uplift / 100, year);
    tuitionGross += projectedCount * annualisedPerStudent;
  }

  items.push({
    category: 'income',
    subcategory: 'tuition_gross',
    name: 'Tuition (gross)',
    fiscal_year: year,
    source: 'driver_derived',
    amount: round2(tuitionGross),
    computed_from: {
      enrollment_growth_pct_by_year_group: drivers.enrollment_growth_pct_by_year_group,
      fee_uplift_pct_by_year_group: drivers.fee_uplift_pct_by_year_group,
    },
  });

  const discountAmount = tuitionGross * (drivers.discount_capture_pct / 100);
  const scholarshipAmount = tuitionGross * (drivers.scholarship_capture_pct / 100);
  const tuitionNet = tuitionGross - discountAmount - scholarshipAmount;

  items.push({
    category: 'income',
    subcategory: 'tuition_net',
    name: 'Tuition (net of discounts/scholarships)',
    fiscal_year: year,
    source: 'driver_derived',
    amount: round2(tuitionNet),
    computed_from: {
      tuition_gross: tuitionGross,
      discount_capture_pct: drivers.discount_capture_pct,
      scholarship_capture_pct: drivers.scholarship_capture_pct,
    },
  });

  items.push({
    category: 'income',
    subcategory: 'donations',
    name: 'Donations',
    fiscal_year: year,
    source: 'driver_derived',
    amount: round2(drivers.donations_forecast),
    computed_from: { donations_forecast: drivers.donations_forecast },
  });

  items.push({
    category: 'income',
    subcategory: 'grants',
    name: 'Grants',
    fiscal_year: year,
    source: 'driver_derived',
    amount: round2(drivers.grants_forecast),
    computed_from: { grants_forecast: drivers.grants_forecast },
  });

  return items;
};

// ─── Section: Staff costs ──────────────────────────────────────────────────

const computeStaffCostLines = (
  drivers: Drivers,
  source: SourceDataSnapshot,
  year: number,
  warnings: EngineWarning[],
): ComputedLineItem[] => {
  const items: ComputedLineItem[] = [];
  const upliftMultiplier = Math.pow(1 + drivers.salary_uplift_pct / 100, year);

  for (const dept of source.staff_by_department) {
    const headcountDelta = drivers.staff_headcount_delta_by_department[dept.department_id] ?? 0;
    const projectedHeadcount = dept.headcount + headcountDelta;
    if (projectedHeadcount < 0) {
      warnings.push({
        level: 'warning',
        code: 'NEGATIVE_HEADCOUNT',
        message: `Department ${dept.department_name} would have negative headcount; clamped to 0.`,
        context: {
          department_id: dept.department_id,
          baseline_headcount: dept.headcount,
          headcount_delta: headcountDelta,
        },
      });
    }
    const avgPerHead = dept.headcount > 0 ? dept.total_annual_payroll / dept.headcount : 0;
    const projectedCost = Math.max(0, projectedHeadcount) * avgPerHead * upliftMultiplier;

    items.push({
      category: 'staff_costs',
      // Department id keeps the variance join trivial.
      subcategory: dept.department_id,
      name: `Staff costs — ${dept.department_name}`,
      fiscal_year: year,
      source: 'driver_derived',
      amount: round2(projectedCost),
      computed_from: {
        department_id: dept.department_id,
        baseline_headcount: dept.headcount,
        headcount_delta: headcountDelta,
        salary_uplift_pct: drivers.salary_uplift_pct,
      },
    });
  }

  return items;
};

// ─── Section: Operations (utilities + materials baseline + inflation) ─────

const computeOperationsLines = (
  drivers: Drivers,
  source: SourceDataSnapshot,
  year: number,
  warnings: EngineWarning[],
  seenNoActualsWarning: { emitted: boolean },
): ComputedLineItem[] => {
  if (!source.prior_year_actuals) {
    if (!seenNoActualsWarning.emitted) {
      warnings.push({
        level: 'info',
        code: 'NO_PRIOR_ACTUALS',
        message:
          'No prior-year actuals supplied; operations lines defaulted to zero. Add custom lines to override.',
      });
      seenNoActualsWarning.emitted = true;
    }
    return [];
  }
  const utilMult = Math.pow(1 + drivers.utilities_inflation_pct / 100, year);
  const matMult = Math.pow(1 + drivers.materials_inflation_pct / 100, year);

  return [
    {
      category: 'operations',
      subcategory: 'utilities',
      name: 'Utilities',
      fiscal_year: year,
      source: 'driver_derived',
      amount: round2(source.prior_year_actuals.utilities * utilMult),
      computed_from: {
        baseline: source.prior_year_actuals.utilities,
        utilities_inflation_pct: drivers.utilities_inflation_pct,
      },
    },
    {
      category: 'operations',
      subcategory: 'materials',
      name: 'Materials',
      fiscal_year: year,
      source: 'driver_derived',
      amount: round2(source.prior_year_actuals.materials * matMult),
      computed_from: {
        baseline: source.prior_year_actuals.materials,
        materials_inflation_pct: drivers.materials_inflation_pct,
      },
    },
  ];
};

// ─── Section: Capital ──────────────────────────────────────────────────────

const computeCapitalLines = (drivers: Drivers, year: number): ComputedLineItem[] =>
  drivers.capex_items
    .filter((item) => item.fiscal_year === year)
    .map((item) => ({
      category: 'capital' as const,
      subcategory: item.id,
      name: item.name,
      fiscal_year: year,
      source: 'driver_derived' as const,
      amount: round2(item.amount),
      computed_from: { capex_item_id: item.id },
    }));

// ─── Aggregation ──────────────────────────────────────────────────────────

const REVENUE_NET_SUBCATEGORIES = new Set(['tuition_net', 'donations', 'grants']);
const EXPENDITURE_CATEGORIES: ReadonlySet<FinancialModelLineItemCategory> =
  new Set<FinancialModelLineItemCategory>(['staff_costs', 'operations', 'capital']);

const aggregateTotals = (line_items: ComputedLineItem[], horizon_years: number): YearTotals[] => {
  const totals: YearTotals[] = [];
  for (let year = 1; year <= horizon_years; year++) {
    const yearItems = line_items.filter((li) => li.fiscal_year === year);
    // Revenue uses tuition_net + donations + grants. tuition_gross is
    // exposed for transparency in the UI but excluded from totals to
    // avoid double-counting.
    const revenue = yearItems
      .filter((li) => li.category === 'income' && REVENUE_NET_SUBCATEGORIES.has(li.subcategory))
      .reduce((acc, li) => acc + li.amount, 0);
    const expenditure = yearItems
      .filter((li) => EXPENDITURE_CATEGORIES.has(li.category))
      .reduce((acc, li) => acc + li.amount, 0);
    totals.push({
      fiscal_year: year,
      revenue: round2(revenue),
      expenditure: round2(expenditure),
      net_result: round2(revenue - expenditure),
    });
  }
  return totals;
};

const computePerPupilEconomics = (
  totals: YearTotals[],
  source: SourceDataSnapshot,
): PerPupilEconomics[] =>
  totals.map((t) => {
    const students = source.total_active_students;
    const households = source.total_active_households;
    const avgFeePerStudent = students > 0 ? t.revenue / students : 0;
    return {
      fiscal_year: t.fiscal_year,
      revenue_per_student: students > 0 ? round2(t.revenue / students) : 0,
      expenditure_per_student: students > 0 ? round2(t.expenditure / students) : 0,
      net_per_student: students > 0 ? round2(t.net_result / students) : 0,
      revenue_per_household: households > 0 ? round2(t.revenue / households) : 0,
      breakeven_students: avgFeePerStudent > 0 ? Math.ceil(t.expenditure / avgFeePerStudent) : null,
    };
  });

// ─── Helpers ──────────────────────────────────────────────────────────────

const round2 = (n: number): number => Math.round(n * 100) / 100;
