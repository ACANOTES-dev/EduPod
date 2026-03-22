import { z } from 'zod';

// ─── Compensation Schemas ─────────────────────────────────────────────────

export const createCompensationSchema = z
  .object({
    staff_profile_id: z.string().uuid(),
    compensation_type: z.enum(['salaried', 'per_class']),
    base_salary: z.number().positive().multipleOf(0.01).nullable().default(null),
    per_class_rate: z.number().positive().multipleOf(0.01).nullable().default(null),
    assigned_class_count: z.number().int().min(0).nullable().default(null),
    bonus_class_rate: z.number().nonnegative().multipleOf(0.01).nullable().default(null),
    bonus_day_multiplier: z.number().min(0.01).max(10).multipleOf(0.01).default(1.0),
    effective_from: z.string().date(),
  })
  .refine(
    (data) => {
      if (data.compensation_type === 'salaried') {
        return data.base_salary !== null && data.base_salary > 0;
      }
      return true;
    },
    { message: 'base_salary is required for salaried compensation', path: ['base_salary'] },
  )
  .refine(
    (data) => {
      if (data.compensation_type === 'per_class') {
        return (
          data.per_class_rate !== null &&
          data.per_class_rate > 0 &&
          data.bonus_class_rate !== null
        );
      }
      return true;
    },
    {
      message: 'per_class_rate and bonus_class_rate are required for per_class compensation',
      path: ['per_class_rate'],
    },
  )
  .refine(
    (data) => {
      if (data.compensation_type === 'salaried') {
        return data.per_class_rate === null && data.bonus_class_rate === null;
      }
      return true;
    },
    {
      message: 'per_class_rate and bonus_class_rate must be null for salaried compensation',
      path: ['per_class_rate'],
    },
  )
  .refine(
    (data) => {
      if (data.compensation_type === 'per_class') {
        return data.base_salary === null;
      }
      return true;
    },
    { message: 'base_salary must be null for per_class compensation', path: ['base_salary'] },
  );

export type CreateCompensationDto = z.infer<typeof createCompensationSchema>;

export const updateCompensationSchema = z
  .object({
    compensation_type: z.enum(['salaried', 'per_class']).optional(),
    base_salary: z.number().positive().multipleOf(0.01).nullable().optional(),
    per_class_rate: z.number().positive().multipleOf(0.01).nullable().optional(),
    assigned_class_count: z.number().int().min(0).nullable().optional(),
    bonus_class_rate: z.number().nonnegative().multipleOf(0.01).nullable().optional(),
    bonus_day_multiplier: z.number().min(0.01).max(10).multipleOf(0.01).optional(),
    effective_from: z.string().date().optional(),
    expected_updated_at: z.string().datetime(),
  });

export type UpdateCompensationDto = z.infer<typeof updateCompensationSchema>;

// ─── Payroll Run Schemas ──────────────────────────────────────────────────

export const createPayrollRunSchema = z.object({
  period_label: z.string().min(1).max(100),
  period_month: z.number().int().min(1).max(12),
  period_year: z.number().int().min(2020).max(2100),
  total_working_days: z.number().int().min(1).max(31),
});

export type CreatePayrollRunDto = z.infer<typeof createPayrollRunSchema>;

export const updatePayrollRunSchema = z.object({
  period_label: z.string().min(1).max(100).optional(),
  total_working_days: z.number().int().min(1).max(31).optional(),
  expected_updated_at: z.string().datetime(),
});

export type UpdatePayrollRunDto = z.infer<typeof updatePayrollRunSchema>;

// ─── Payroll Entry Schemas ────────────────────────────────────────────────

export const updatePayrollEntrySchema = z.object({
  days_worked: z.number().int().min(0).max(60).nullable().optional(),
  classes_taught: z.number().int().min(0).max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  override_total_pay: z.number().nonnegative().multipleOf(0.01).nullable().optional(),
  override_note: z.string().min(1).max(1000).nullable().optional(),
  expected_updated_at: z.string().datetime(),
});

export type UpdatePayrollEntryDto = z.infer<typeof updatePayrollEntrySchema>;

export const calculateEntrySchema = z.object({
  days_worked: z.number().int().min(0).max(60).nullable().optional(),
  classes_taught: z.number().int().min(0).max(500).nullable().optional(),
});

export type CalculateEntryDto = z.infer<typeof calculateEntrySchema>;

// ─── Payroll Query Schemas ────────────────────────────────────────────────

export const payrollRunQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['draft', 'pending_approval', 'finalised', 'cancelled']).optional(),
  period_year: z.coerce.number().int().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export type PayrollRunQueryDto = z.infer<typeof payrollRunQuerySchema>;

export const compensationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  compensation_type: z.enum(['salaried', 'per_class']).optional(),
  staff_profile_id: z.string().uuid().optional(),
  active_only: z.coerce.boolean().default(true),
});

export type CompensationQueryDto = z.infer<typeof compensationQuerySchema>;

export const payslipQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  payroll_run_id: z.string().uuid().optional(),
  staff_profile_id: z.string().uuid().optional(),
});

export type PayslipQueryDto = z.infer<typeof payslipQuerySchema>;

export const finaliseRunSchema = z.object({
  expected_updated_at: z.string().datetime(),
});

export type FinaliseRunDto = z.infer<typeof finaliseRunSchema>;

export const massExportSchema = z.object({
  locale: z.enum(['en', 'ar']).default('en'),
});

export type MassExportDto = z.infer<typeof massExportSchema>;

export const payrollReportQuerySchema = z.object({
  period_year: z.coerce.number().int().optional(),
});

export type PayrollReportQueryDto = z.infer<typeof payrollReportQuerySchema>;

// ─── Payslip Snapshot Schema (for JSONB validation) ──────────────────────

export const payslipSnapshotPayloadSchema = z.object({
  staff: z.object({
    full_name: z.string(),
    staff_number: z.string().nullable(),
    department: z.string().nullable(),
    job_title: z.string().nullable(),
    employment_type: z.string(),
    bank_name: z.string().nullable(),
    bank_account_last4: z.string().nullable(),
    bank_iban_last4: z.string().nullable(),
  }),
  period: z.object({
    label: z.string(),
    month: z.number(),
    year: z.number(),
    total_working_days: z.number(),
  }),
  compensation: z.object({
    type: z.enum(['salaried', 'per_class']),
    base_salary: z.number().nullable(),
    per_class_rate: z.number().nullable(),
    assigned_class_count: z.number().nullable(),
    bonus_class_rate: z.number().nullable(),
    bonus_day_multiplier: z.number().nullable(),
  }),
  inputs: z.object({
    days_worked: z.number().nullable(),
    classes_taught: z.number().nullable(),
  }),
  calculations: z.object({
    basic_pay: z.number(),
    bonus_pay: z.number(),
    total_pay: z.number(),
  }),
  school: z.object({
    name: z.string(),
    name_ar: z.string().nullable(),
    logo_url: z.string().nullable(),
    currency_code: z.string(),
  }),
});
