# Implementation 02 — Driver Engine

> **Wave:** 2
> **Depends on:** 01
> **Deploys:** API + worker + web restart (ships in `@school/shared`, all consumers must pick up the new code)

---

## Goal

Build the pure-TypeScript calculation engine that powers both annual financial models and event budgets. **Pure functions, zero IO, dependency-free** — runs identically on backend (Node) and frontend (browser). This is the math that turns drivers into line items and totals.

Everything lives in `packages/shared/src/budgeting/`. Phase 03+ services and Phase 13+ frontend consume this code; no other phase reimplements any calculation logic.

## What to change

### 1. `packages/shared/src/budgeting/drivers.ts` — canonical driver schemas

Define the canonical 11-driver shape (matching `PLAN.md §4.1`) plus the per-year override mechanism. Use Zod for runtime validation; export inferred TypeScript types.

```typescript
import { z } from 'zod';

// ─── Capex item ────────────────────────────────────────────────────────────
export const capexItemSchema = z.object({
  id: z.string(), // stable per-item id
  name: z.string().min(1).max(255),
  amount: z.number(), // positive
  fiscal_year: z.number().int().min(1).max(5),
  notes: z.string().optional(),
});
export type CapexItem = z.infer<typeof capexItemSchema>;

// ─── The full canonical driver shape ───────────────────────────────────────
export const driversSchema = z.object({
  enrollment_growth_pct_by_year_group: z.record(z.string().uuid(), z.number()),
  fee_uplift_pct_by_year_group: z.record(z.string().uuid(), z.number()),
  staff_headcount_delta_by_department: z.record(z.string().uuid(), z.number().int()),
  salary_uplift_pct: z.number(),
  discount_capture_pct: z.number(),
  scholarship_capture_pct: z.number(),
  utilities_inflation_pct: z.number(),
  materials_inflation_pct: z.number(),
  capex_items: z.array(capexItemSchema),
  donations_forecast: z.number(),
  grants_forecast: z.number(),
  custom: z.record(z.string(), z.unknown()).default({}),
  per_year: z
    .record(
      z.string().regex(/^\d+$/), // year as stringified int (Zod record key constraint)
      z.lazy(() => partialDriversSchema),
    )
    .optional(),
});
export type Drivers = z.infer<typeof driversSchema>;

// ─── Partial driver schema for scenario overrides ──────────────────────────
export const partialDriversSchema: z.ZodType<Partial<Drivers>> = driversSchema.partial();
export type PartialDrivers = z.infer<typeof partialDriversSchema>;

// ─── Default drivers — used when creating a new model ──────────────────────
export const buildDefaultDrivers = (input: {
  year_group_ids: string[];
  department_ids: string[];
  prior_year_donations_actual?: number;
  prior_year_grants_actual?: number;
  prior_year_discount_capture_pct?: number;
  prior_year_scholarship_capture_pct?: number;
}): Drivers => ({
  enrollment_growth_pct_by_year_group: Object.fromEntries(
    input.year_group_ids.map((id) => [id, 3]), // 3% default growth per year group
  ),
  fee_uplift_pct_by_year_group: Object.fromEntries(
    input.year_group_ids.map((id) => [id, 0]), // flat by default — schools opt in to fee increases
  ),
  staff_headcount_delta_by_department: Object.fromEntries(
    input.department_ids.map((id) => [id, 0]),
  ),
  salary_uplift_pct: 3,
  discount_capture_pct: input.prior_year_discount_capture_pct ?? 4,
  scholarship_capture_pct: input.prior_year_scholarship_capture_pct ?? 2,
  utilities_inflation_pct: 4,
  materials_inflation_pct: 3,
  capex_items: [],
  donations_forecast: input.prior_year_donations_actual ?? 0,
  grants_forecast: input.prior_year_grants_actual ?? 0,
  custom: {},
});
```

### 2. `packages/shared/src/budgeting/source-data.ts` — source snapshot shape

The `source` snapshot is captured by the backend when the model is created. It freezes the relevant slice of the platform's state so the engine is deterministic and fast.

```typescript
import { z } from 'zod';

export const sourceStudentByYearGroupSchema = z.object({
  year_group_id: z.string().uuid(),
  year_group_name: z.string(),
  active_count: z.number().int().min(0),
});

export const sourceFeeStructureForYearGroupSchema = z.object({
  year_group_id: z.string().uuid(),
  fee_type_id: z.string().uuid(),
  fee_type_name: z.string(),
  amount: z.number().min(0),
  billing_frequency: z.enum(['monthly', 'termly', 'annually']),
});

export const sourceStaffByDepartmentSchema = z.object({
  department_id: z.string().uuid(),
  department_name: z.string(),
  headcount: z.number().int().min(0),
  total_annual_payroll: z.number().min(0), // sum of base salaries (excluding planned uplift)
});

export const sourceDataSnapshotSchema = z.object({
  captured_at: z.string().datetime(),
  tenant_id: z.string().uuid(),
  fiscal_year_start: z.string(), // ISO date
  fiscal_year_end: z.string(),
  currency_code: z.string().length(3),
  total_active_students: z.number().int(),
  total_active_households: z.number().int(),
  students_by_year_group: z.array(sourceStudentByYearGroupSchema),
  fees_by_year_group: z.array(sourceFeeStructureForYearGroupSchema),
  staff_by_department: z.array(sourceStaffByDepartmentSchema),
  prior_year_actuals: z
    .object({
      tuition_revenue: z.number(),
      other_income: z.number(),
      staff_costs: z.number(),
      utilities: z.number(),
      materials: z.number(),
      donations: z.number(),
      grants: z.number(),
    })
    .optional(),
});
export type SourceDataSnapshot = z.infer<typeof sourceDataSnapshotSchema>;
```

### 3. `packages/shared/src/budgeting/scenario-merge.ts` — driver override merge

Pure function. Recursively merges base drivers with scenario overrides per the rules in `PLAN.md §5.2`.

```typescript
import type { Drivers, PartialDrivers } from './drivers';

export const mergeDriverOverrides = (base: Drivers, overrides: PartialDrivers): Drivers => {
  const merged: Drivers = structuredClone(base);

  // Top-level scalar fields — straightforward replace if present.
  for (const key of [
    'salary_uplift_pct',
    'discount_capture_pct',
    'scholarship_capture_pct',
    'utilities_inflation_pct',
    'materials_inflation_pct',
    'donations_forecast',
    'grants_forecast',
  ] as const) {
    if (overrides[key] !== undefined) {
      merged[key] = overrides[key];
    }
  }

  // Per-year-group records — shallow merge (override values for specified year groups, keep base for others).
  for (const key of [
    'enrollment_growth_pct_by_year_group',
    'fee_uplift_pct_by_year_group',
  ] as const) {
    if (overrides[key]) {
      merged[key] = { ...base[key], ...overrides[key] };
    }
  }

  if (overrides.staff_headcount_delta_by_department) {
    merged.staff_headcount_delta_by_department = {
      ...base.staff_headcount_delta_by_department,
      ...overrides.staff_headcount_delta_by_department,
    };
  }

  // Capex — REPLACE (a scenario can blank or change capex entirely).
  if (overrides.capex_items !== undefined) {
    merged.capex_items = overrides.capex_items;
  }

  // Custom — merge keys.
  if (overrides.custom) {
    merged.custom = { ...base.custom, ...overrides.custom };
  }

  // per_year — recursive merge per year.
  if (overrides.per_year) {
    merged.per_year = { ...(base.per_year ?? {}), ...overrides.per_year };
  }

  return merged;
};

// Resolve effective drivers for a specific fiscal year, applying per_year overrides on top of merged drivers.
export const resolveDriversForYear = (drivers: Drivers, fiscal_year: number): Drivers => {
  const yearOverride = drivers.per_year?.[String(fiscal_year)];
  if (!yearOverride) return drivers;
  return mergeDriverOverrides(drivers, yearOverride);
};
```

### 4. `packages/shared/src/budgeting/engine.ts` — the calculation engine

Pure functions that compute line items, totals, and unit economics from drivers + source data. **No IO, no async, no side effects**.

```typescript
import type { Drivers } from './drivers';
import type { SourceDataSnapshot } from './source-data';
import { resolveDriversForYear } from './scenario-merge';

// ─── Output types ──────────────────────────────────────────────────────────
export type ComputedLineItem = {
  category: 'income' | 'staff_costs' | 'operations' | 'capital' | 'reserves_and_adjustments';
  subcategory: string;
  name: string;
  fiscal_year: number;
  source: 'driver_derived';
  amount: number;
  computed_from: Record<string, unknown>; // breadcrumb of which drivers fed this line, used for variance "drivers of variance" tooltip
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
  breakeven_students: number | null; // null when avg_fee_per_student is 0
};

export type EngineWarning = {
  level: 'info' | 'warning';
  code: string; // 'NO_FEE_STRUCTURE' | 'NO_PRIOR_ACTUALS' | etc.
  message: string;
  context?: Record<string, unknown>;
};

export type EngineInputs = {
  drivers: Drivers;
  source: SourceDataSnapshot;
  horizon_years: 1 | 3 | 5;
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

  for (let year = 1; year <= horizon_years; year++) {
    const effectiveDrivers = resolveDriversForYear(drivers, year);

    // Income — Tuition gross + net + donations + grants
    line_items.push(...computeIncomeLines(effectiveDrivers, source, year, warnings));

    // Staff costs — broken out by department
    line_items.push(...computeStaffCostLines(effectiveDrivers, source, year, warnings));

    // Operations — utilities, materials, etc.
    line_items.push(...computeOperationsLines(effectiveDrivers, source, year, warnings));

    // Capital — itemised
    line_items.push(...computeCapitalLines(effectiveDrivers, year));

    // Reserves & adjustments — empty by default (custom line items only)
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
        const months =
          f.billing_frequency === 'monthly' ? 12 : f.billing_frequency === 'termly' ? 3 : 1;
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
        context: { department_id: dept.department_id },
      });
    }
    const avgPerHead = dept.headcount > 0 ? dept.total_annual_payroll / dept.headcount : 0;
    const projectedCost = Math.max(0, projectedHeadcount) * avgPerHead * upliftMultiplier;

    items.push({
      category: 'staff_costs',
      subcategory: dept.department_id, // backed by department id so variance can join
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
): ComputedLineItem[] => {
  const items: ComputedLineItem[] = [];
  if (!source.prior_year_actuals) {
    warnings.push({
      level: 'info',
      code: 'NO_PRIOR_ACTUALS',
      message:
        'No prior-year actuals supplied; operations lines defaulted to zero. Add custom lines to override.',
    });
    return items;
  }
  const utilMult = Math.pow(1 + drivers.utilities_inflation_pct / 100, year);
  const matMult = Math.pow(1 + drivers.materials_inflation_pct / 100, year);

  items.push({
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
  });

  items.push({
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
  });

  return items;
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
const aggregateTotals = (line_items: ComputedLineItem[], horizon_years: number): YearTotals[] => {
  const totals: YearTotals[] = [];
  for (let year = 1; year <= horizon_years; year++) {
    const yearItems = line_items.filter((li) => li.fiscal_year === year);
    const revenue = yearItems
      .filter((li) => li.category === 'income' && li.subcategory !== 'tuition_gross') // tuition_gross would double-count with tuition_net
      .reduce((acc, li) => acc + li.amount, 0);
    const expenditure = yearItems
      .filter((li) => ['staff_costs', 'operations', 'capital'].includes(li.category))
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

const round2 = (n: number): number => Math.round(n * 100) / 100;
```

### 5. `packages/shared/src/budgeting/event-engine.ts` — trip / event calculator

Smaller engine for event budgets. Inputs are the event's `drivers` JSONB; outputs are total / per-student / per-household / breakeven.

```typescript
import { z } from 'zod';

export const eventDriversSchema = z.object({
  transport: z
    .object({
      unit_cost: z.number().min(0),
      units: z.number().int().min(0),
      notes: z.string().optional(),
    })
    .optional(),
  entry_tickets: z
    .object({
      per_student_cost: z.number().min(0),
      count: z.number().int().min(0),
    })
    .optional(),
  food: z
    .object({
      per_person_cost: z.number().min(0),
      count: z.number().int().min(0),
    })
    .optional(),
  accommodation: z
    .object({
      per_night_cost: z.number().min(0),
      nights: z.number().int().min(0),
      count: z.number().int().min(0),
    })
    .optional(),
  chaperones: z
    .object({
      count: z.number().int().min(0),
      per_chaperone_cost: z.number().min(0),
    })
    .optional(),
  equipment_hire: z
    .object({
      items: z.array(
        z.object({
          name: z.string(),
          cost: z.number().min(0),
        }),
      ),
    })
    .optional(),
  contingency_pct: z.number().min(0).default(5),
  custom_lines: z
    .array(
      z.object({
        name: z.string(),
        amount: z.number(),
      }),
    )
    .default([]),
});
export type EventDrivers = z.infer<typeof eventDriversSchema>;

export type EventEngineInputs = {
  drivers: EventDrivers;
  participant_count: number;
  household_count: number;
  household_share_pct: number; // 0..100
};

export type EventEngineOutputs = {
  line_items: Array<{ name: string; amount: number; per_student: number }>;
  total_cost: number;
  contingency_amount: number;
  per_student_cost: number;
  per_household_cost: number; // simple average; for actual per-household see below
  household_total: number; // amount households collectively pay
  school_subsidy_amount: number;
  breakeven_participants: number | null;
};

export const runEventEngine = (inputs: EventEngineInputs): EventEngineOutputs => {
  const { drivers, participant_count, household_count, household_share_pct } = inputs;
  const lines: Array<{ name: string; amount: number; per_student: number }> = [];
  let subtotal = 0;

  if (drivers.transport) {
    const cost = drivers.transport.unit_cost * drivers.transport.units;
    subtotal += cost;
    lines.push({
      name: 'Transport',
      amount: cost,
      per_student: participant_count > 0 ? cost / participant_count : 0,
    });
  }
  if (drivers.entry_tickets) {
    const cost = drivers.entry_tickets.per_student_cost * drivers.entry_tickets.count;
    subtotal += cost;
    lines.push({
      name: 'Tickets',
      amount: cost,
      per_student: participant_count > 0 ? cost / participant_count : 0,
    });
  }
  if (drivers.food) {
    const cost = drivers.food.per_person_cost * drivers.food.count;
    subtotal += cost;
    lines.push({
      name: 'Food',
      amount: cost,
      per_student: participant_count > 0 ? cost / participant_count : 0,
    });
  }
  if (drivers.accommodation) {
    const cost =
      drivers.accommodation.per_night_cost *
      drivers.accommodation.nights *
      drivers.accommodation.count;
    subtotal += cost;
    lines.push({
      name: 'Accommodation',
      amount: cost,
      per_student: participant_count > 0 ? cost / participant_count : 0,
    });
  }
  if (drivers.chaperones) {
    const cost = drivers.chaperones.count * drivers.chaperones.per_chaperone_cost;
    subtotal += cost;
    lines.push({
      name: 'Chaperones',
      amount: cost,
      per_student: participant_count > 0 ? cost / participant_count : 0,
    });
  }
  if (drivers.equipment_hire) {
    for (const item of drivers.equipment_hire.items) {
      subtotal += item.cost;
      lines.push({
        name: item.name,
        amount: item.cost,
        per_student: participant_count > 0 ? item.cost / participant_count : 0,
      });
    }
  }
  for (const line of drivers.custom_lines) {
    subtotal += line.amount;
    lines.push({
      name: line.name,
      amount: line.amount,
      per_student: participant_count > 0 ? line.amount / participant_count : 0,
    });
  }

  const contingencyAmount = subtotal * (drivers.contingency_pct / 100);
  const totalCost = subtotal + contingencyAmount;
  const householdTotal = totalCost * (household_share_pct / 100);
  const schoolSubsidyAmount = totalCost - householdTotal;
  const perStudentCost = participant_count > 0 ? householdTotal / participant_count : 0;
  const perHouseholdCost = household_count > 0 ? householdTotal / household_count : 0;

  // Breakeven — cost / per-student-charge required = participants needed.
  // Useful when school is recovering cost; when household_share_pct < 100, this is interpreted
  // as "how many would need to participate at this charge to break even on the school's investment".
  const breakeven = perStudentCost > 0 ? Math.ceil(totalCost / perStudentCost) : null;

  return {
    line_items: lines,
    total_cost: round2(totalCost),
    contingency_amount: round2(contingencyAmount),
    per_student_cost: round2(perStudentCost),
    per_household_cost: round2(perHouseholdCost),
    household_total: round2(householdTotal),
    school_subsidy_amount: round2(schoolSubsidyAmount),
    breakeven_participants: breakeven,
  };
};

const round2 = (n: number): number => Math.round(n * 100) / 100;
```

### 6. `packages/shared/src/budgeting/index.ts` — barrel export

Export everything created in this phase:

```typescript
export * from './drivers';
export * from './scenarios';
export * from './line-items';
export * from './snapshots';
export * from './event-budgets';
export * from './variance';
export * from './shareable-links';
export * from './source-data';
export * from './scenario-merge';
export * from './engine';
export * from './event-engine';
```

### 7. Subpath export

Confirm `packages/shared/package.json` includes `./budgeting` in its `exports` map, mirroring the pattern used by `@school/shared/reports` or `@school/shared/wellbeing`.

## Testing requirements

- **`engine.spec.ts`** — exhaustive table-driven tests:
  - Default drivers + default source produce a zero-warning, all-positive output.
  - 0% growth + 0% uplift produces revenue exactly equal to baseline.
  - 5% enrollment growth + 5% fee uplift produces revenue ≈ baseline × 1.1025 in year 1.
  - Multi-year (3 years) compounding: year 3 enrollment = baseline × 1.03^3.
  - Per-year override: `per_year[2]` with custom enrollment growth applies only to year 2.
  - No fee structure for a year group emits `NO_FEE_STRUCTURE` warning and zero contribution from that yg.
  - No prior-year actuals emits `NO_PRIOR_ACTUALS` warning and zero operations lines.
  - Negative headcount delta clamps to 0 and emits `NEGATIVE_HEADCOUNT` warning.
  - Capex items only land in their declared `fiscal_year`.
  - Per-pupil economics returns null `breakeven_students` when revenue is 0.

- **`scenario-merge.spec.ts`**:
  - Empty overrides return base unchanged.
  - Partial year-group records merge (override one yg, leave others).
  - Replace semantics for `capex_items`.
  - `per_year` deep-merges per year.
  - Custom keys merge on top.

- **`event-engine.spec.ts`**:
  - All driver sections present produces correct subtotal, contingency, total.
  - Missing optional drivers (no transport, no food) just skip those lines.
  - Free trip (`household_share_pct = 0`) → school subsidy = total, household total = 0.
  - Subsidised trip splits correctly.
  - Zero participants → per-student = 0, breakeven = null.

- **No DB / network calls.** These tests are pure; they should run in <1 second total.

## Post-deploy verification

1. `pnpm --filter @school/shared build` completes without errors.
2. `pnpm --filter @school/shared test` shows the new `budgeting/*.spec.ts` suites passing.
3. `pnpm turbo run type-check` across the monorepo succeeds — the new shared exports must not break consumer packages.
4. Restart api / worker / web. The shared package's compiled output is what consumers pick up.
5. Confirm the new code is on the server: `node -e "import('@school/shared/budgeting').then(m => console.log(Object.keys(m)))"` shows the exported symbols.

## Follow-ups for subsequent waves

- Wave 2 impl 03 (financial-models service) imports `runEngine`, `buildDefaultDrivers`, `driversSchema`, `sourceDataSnapshotSchema`. The service is responsible for capturing the source snapshot from live tenant data when a model is created.
- Wave 2 impl 04 (line-items service) imports `ComputedLineItem` to type the engine output before persisting.
- Wave 2 impl 06 (variance service) uses `computed_from` from each line item to populate the "drivers of variance" tooltip.
- Wave 2 impl 07 (event-budgets service) imports `runEventEngine`, `eventDriversSchema`.
- Wave 3 impl 09 (export pipeline) imports the engine to recompute line items from a snapshot's payload at render time.
- Wave 4 impl 13 (financial model workspace) imports the engine to live-recompute as the user tunes drivers — this is what makes the UX feel instant.

## Rollback

`git revert <commit-sha>`. No DB changes. The shared package reverts to its pre-phase state. Wave 2+ phases that depend on this code will not work until this is re-landed; if reverting, also revert any dependent Wave 2 commits.
