import { z } from 'zod';

/**
 * Source-data snapshot — frozen at model creation time so the engine is
 * deterministic and free of database/network IO at compute time.
 *
 * The backend's `FinancialModelsService.create()` (Wave 2 impl 03) is
 * responsible for assembling this from live tenant state (students,
 * fee structures, staff, prior-year actuals) and persisting it on
 * `financial_models.source_snapshot_json`. Re-tuning drivers in the UI
 * NEVER re-fetches from the DB — the engine reads the frozen snapshot
 * and the user's drivers, and recomputes line items on the spot.
 *
 * On publish, the snapshot is folded into the immutable
 * `financial_model_snapshots.payload` so historical recomputes stay
 * deterministic forever.
 */

export const sourceStudentByYearGroupSchema = z.object({
  year_group_id: z.string().uuid(),
  year_group_name: z.string(),
  active_count: z.number().int().min(0),
});
export type SourceStudentByYearGroup = z.infer<typeof sourceStudentByYearGroupSchema>;

/**
 * Billing-frequency values mirror the Prisma `BillingFrequency` enum
 * (sans `custom`, which can't be deterministically annualised — the
 * snapshot-capture step skips those rows). The engine multiplies the
 * fee amount by 12 / 3 / 1 respectively to derive the annualised
 * per-student tuition figure.
 */
export const sourceBillingFrequencySchema = z.enum(['monthly', 'term', 'one_off']);
export type SourceBillingFrequency = z.infer<typeof sourceBillingFrequencySchema>;

export const sourceFeeStructureForYearGroupSchema = z.object({
  year_group_id: z.string().uuid(),
  fee_type_id: z.string().uuid(),
  fee_type_name: z.string(),
  amount: z.number().min(0),
  billing_frequency: sourceBillingFrequencySchema,
});
export type SourceFeeStructureForYearGroup = z.infer<typeof sourceFeeStructureForYearGroupSchema>;

export const sourceStaffByDepartmentSchema = z.object({
  // Department is stored on `staff_profiles.department` as VARCHAR(150),
  // not as a foreign key. The budgeting service derives a stable slug
  // (lowercase, kebab-cased) from the department name and uses it here
  // so driver overrides keyed off `department_id` survive across runs.
  department_id: z.string().min(1),
  department_name: z.string(),
  headcount: z.number().int().min(0),
  /** Sum of base salaries (excluding planned uplift). */
  total_annual_payroll: z.number().min(0),
});
export type SourceStaffByDepartment = z.infer<typeof sourceStaffByDepartmentSchema>;

export const sourcePriorYearActualsSchema = z.object({
  tuition_revenue: z.number(),
  other_income: z.number(),
  staff_costs: z.number(),
  utilities: z.number(),
  materials: z.number(),
  donations: z.number(),
  grants: z.number(),
});
export type SourcePriorYearActuals = z.infer<typeof sourcePriorYearActualsSchema>;

export const sourceDataSnapshotSchema = z.object({
  captured_at: z.string().datetime(),
  tenant_id: z.string().uuid(),
  /** ISO date — fiscal year start (inclusive). */
  fiscal_year_start: z.string(),
  /** ISO date — fiscal year end (inclusive). */
  fiscal_year_end: z.string(),
  currency_code: z.string().length(3),
  total_active_students: z.number().int().min(0),
  total_active_households: z.number().int().min(0),
  students_by_year_group: z.array(sourceStudentByYearGroupSchema),
  fees_by_year_group: z.array(sourceFeeStructureForYearGroupSchema),
  staff_by_department: z.array(sourceStaffByDepartmentSchema),
  prior_year_actuals: sourcePriorYearActualsSchema.optional(),
});
export type SourceDataSnapshot = z.infer<typeof sourceDataSnapshotSchema>;
