import { z } from 'zod';

/**
 * Canonical driver schemas for annual financial models.
 *
 * The 11 drivers (plus `custom` and `per_year`) match modeling/PLAN.md §4.1.
 * Both backend services (Wave 2) and the frontend workspace (Wave 4) share
 * these schemas — drift between layers is impossible by construction.
 *
 * `per_year` is the multi-year override mechanism: when a model's
 * `horizon_years > 1` and `per_year[N]` is present, year N uses the
 * override values; otherwise year N's drivers compound from year 1's
 * values (see `resolveDriversForYear` in `./scenario-merge.ts`).
 */

// ─── Capex item ────────────────────────────────────────────────────────────

export const capexItemSchema = z.object({
  /** Stable per-item id supplied by the client; used as the line-item subcategory key. */
  id: z.string().min(1),
  name: z.string().min(1).max(255),
  /** Positive amount in tenant currency. */
  amount: z.number().nonnegative(),
  /** 1..5 — must fall within the parent model's horizon_years. */
  fiscal_year: z.number().int().min(1).max(5),
  notes: z.string().optional(),
});
export type CapexItem = z.infer<typeof capexItemSchema>;

// ─── Recursive type — declare interface, then annotate the schema ──────────
//
// Zod's `.partial()` does not give TypeScript an inferable handle on a
// recursive `per_year` reference. We follow the documented Zod recursive
// pattern: declare the TS type explicitly, then annotate the schemas as
// `z.ZodType<T>`.

export interface Drivers {
  enrollment_growth_pct_by_year_group: Record<string, number>;
  fee_uplift_pct_by_year_group: Record<string, number>;
  staff_headcount_delta_by_department: Record<string, number>;
  salary_uplift_pct: number;
  discount_capture_pct: number;
  scholarship_capture_pct: number;
  utilities_inflation_pct: number;
  materials_inflation_pct: number;
  capex_items: CapexItem[];
  donations_forecast: number;
  grants_forecast: number;
  custom: Record<string, unknown>;
  per_year?: Record<string, PartialDrivers>;
}

export type PartialDrivers = Partial<Drivers>;

// ─── Schemas ───────────────────────────────────────────────────────────────

// Year-group keys are real UUIDs (year_groups.id). Department keys are
// free-form strings — the platform stores `staff_profiles.department` as
// VARCHAR(150), not as a foreign key, so the engine uses a deterministic
// slug of the department name as its identifier.
export const driversSchema: z.ZodType<Drivers> = z.lazy(() =>
  z.object({
    enrollment_growth_pct_by_year_group: z.record(z.string().uuid(), z.number()),
    fee_uplift_pct_by_year_group: z.record(z.string().uuid(), z.number()),
    staff_headcount_delta_by_department: z.record(z.string().min(1), z.number().int()),
    salary_uplift_pct: z.number(),
    discount_capture_pct: z.number(),
    scholarship_capture_pct: z.number(),
    utilities_inflation_pct: z.number(),
    materials_inflation_pct: z.number(),
    capex_items: z.array(capexItemSchema),
    donations_forecast: z.number(),
    grants_forecast: z.number(),
    custom: z.record(z.string(), z.unknown()),
    // year as stringified int — Zod record keys must be strings, callers
    // resolve with String(fiscal_year). Validated against /^\d+$/.
    per_year: z.record(z.string().regex(/^\d+$/), partialDriversSchema).optional(),
  }),
);

export const partialDriversSchema: z.ZodType<PartialDrivers> = z.lazy(() =>
  z.object({
    enrollment_growth_pct_by_year_group: z.record(z.string().uuid(), z.number()).optional(),
    fee_uplift_pct_by_year_group: z.record(z.string().uuid(), z.number()).optional(),
    staff_headcount_delta_by_department: z.record(z.string().min(1), z.number().int()).optional(),
    salary_uplift_pct: z.number().optional(),
    discount_capture_pct: z.number().optional(),
    scholarship_capture_pct: z.number().optional(),
    utilities_inflation_pct: z.number().optional(),
    materials_inflation_pct: z.number().optional(),
    capex_items: z.array(capexItemSchema).optional(),
    donations_forecast: z.number().optional(),
    grants_forecast: z.number().optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
    per_year: z.record(z.string().regex(/^\d+$/), partialDriversSchema).optional(),
  }),
);

// ─── Default drivers ──────────────────────────────────────────────────────

export interface BuildDefaultDriversInput {
  year_group_ids: string[];
  department_ids: string[];
  prior_year_donations_actual?: number;
  prior_year_grants_actual?: number;
  prior_year_discount_capture_pct?: number;
  prior_year_scholarship_capture_pct?: number;
}

/**
 * Construct the platform-default driver set for a brand-new financial model.
 * Defaults are deliberately conservative — 3% enrollment growth, 0% fee
 * uplift (schools opt in), 3% salary uplift, 4% utilities / 3% materials
 * inflation. Tenants tune these in the workspace after creation.
 */
export const buildDefaultDrivers = (input: BuildDefaultDriversInput): Drivers => ({
  enrollment_growth_pct_by_year_group: Object.fromEntries(
    input.year_group_ids.map((id) => [id, 3]),
  ),
  fee_uplift_pct_by_year_group: Object.fromEntries(input.year_group_ids.map((id) => [id, 0])),
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
