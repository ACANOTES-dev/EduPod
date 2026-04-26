import { z } from 'zod';

/**
 * Budgeting-module tenant preferences (impl 20).
 *
 * Persists in the `budgeting_tenant_preferences` table created by impl 01.
 * One row per tenant. The row is upserted on first GET so callers always
 * see a fully populated shape, even before the user has touched the
 * settings page.
 *
 * Defaults mirror the schema-level defaults from impl 01's migration:
 *   - default_horizon_years: 1
 *   - default_household_share_pct: 100
 *   - default_contingency_pct: 5
 *   - default_export_format: 'pdf'
 *   - shareable_link_max_days: 30
 *   - hidden_kpi_keys: []
 */

export const KPI_KEYS = [
  'revenue_per_student',
  'expenditure_per_student',
  'net_per_student',
  'breakeven_students',
] as const;

export type BudgetingKpiKey = (typeof KPI_KEYS)[number];

export const budgetingKpiKeySchema = z.enum(KPI_KEYS);

export const EXPORT_FORMATS = ['pdf', 'excel', 'both'] as const;
export type BudgetingExportFormat = (typeof EXPORT_FORMATS)[number];

export const budgetingExportFormatSchema = z.enum(EXPORT_FORMATS);

export const HORIZON_YEARS = [1, 3, 5] as const;
export type BudgetingHorizonYears = (typeof HORIZON_YEARS)[number];

export const budgetingHorizonYearsSchema = z.union([z.literal(1), z.literal(3), z.literal(5)]);

export const budgetingTenantPreferencesSchema = z.object({
  default_horizon_years: budgetingHorizonYearsSchema,
  default_household_share_pct: z.number().min(0).max(100),
  default_contingency_pct: z.number().min(0).max(30),
  default_export_format: budgetingExportFormatSchema,
  shareable_link_max_days: z.number().int().min(1).max(365),
  hidden_kpi_keys: z.array(budgetingKpiKeySchema),
});

export type BudgetingTenantPreferences = z.infer<typeof budgetingTenantPreferencesSchema>;

/** Patch shape (PATCH endpoint accepts partials). */
export const updateBudgetingTenantPreferencesSchema = budgetingTenantPreferencesSchema
  .partial()
  .strict();

export type UpdateBudgetingTenantPreferencesDto = z.infer<
  typeof updateBudgetingTenantPreferencesSchema
>;

export const BUDGETING_TENANT_PREFERENCES_DEFAULTS: BudgetingTenantPreferences = {
  default_horizon_years: 1,
  default_household_share_pct: 100,
  default_contingency_pct: 5,
  default_export_format: 'pdf',
  shareable_link_max_days: 30,
  hidden_kpi_keys: [],
};
