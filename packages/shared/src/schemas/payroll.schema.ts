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

// ─── Payroll World-Class: Staff Attendance ────────────────────────────────────

export const staffAttendanceStatusSchema = z.enum([
  'present',
  'absent',
  'half_day',
  'unpaid_leave',
  'paid_leave',
  'sick_leave',
]);

export type StaffAttendanceStatus = z.infer<typeof staffAttendanceStatusSchema>;

export const markAttendanceSchema = z.object({
  staff_profile_id: z.string().uuid(),
  date: z.string().date(),
  status: staffAttendanceStatusSchema,
  notes: z.string().max(2000).nullable().optional(),
});

export type MarkAttendanceDto = z.infer<typeof markAttendanceSchema>;

export const bulkMarkAttendanceSchema = z.object({
  date: z.string().date(),
  records: z.array(
    z.object({
      staff_profile_id: z.string().uuid(),
      status: staffAttendanceStatusSchema,
      notes: z.string().max(2000).nullable().optional(),
    }),
  ).min(1).max(500),
});

export type BulkMarkAttendanceDto = z.infer<typeof bulkMarkAttendanceSchema>;

export const staffAttendanceQuerySchema = z.object({
  date: z.string().date().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  staff_profile_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type StaffAttendanceQueryDto = z.infer<typeof staffAttendanceQuerySchema>;

export const calculateDaysWorkedSchema = z.object({
  staff_profile_id: z.string().uuid(),
  date_from: z.string().date(),
  date_to: z.string().date(),
});

export type CalculateDaysWorkedDto = z.infer<typeof calculateDaysWorkedSchema>;

// ─── Payroll World-Class: Class Delivery ─────────────────────────────────────

export const classDeliveryStatusSchema = z.enum([
  'delivered',
  'absent_covered',
  'absent_uncovered',
  'cancelled',
]);

export type ClassDeliveryStatus = z.infer<typeof classDeliveryStatusSchema>;

export const autoPopulateDeliverySchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
});

export type AutoPopulateDeliveryDto = z.infer<typeof autoPopulateDeliverySchema>;

export const confirmDeliverySchema = z.object({
  status: classDeliveryStatusSchema,
  substitute_staff_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type ConfirmDeliveryDto = z.infer<typeof confirmDeliverySchema>;

export const classDeliveryQuerySchema = z.object({
  staff_profile_id: z.string().uuid().optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type ClassDeliveryQueryDto = z.infer<typeof classDeliveryQuerySchema>;

export const calculateClassesTaughtSchema = z.object({
  staff_profile_id: z.string().uuid(),
  date_from: z.string().date(),
  date_to: z.string().date(),
});

export type CalculateClassesTaughtDto = z.infer<typeof calculateClassesTaughtSchema>;

// ─── Payroll World-Class: Adjustments ────────────────────────────────────────

export const payrollAdjustmentTypeSchema = z.enum([
  'underpayment',
  'overpayment',
  'bonus',
  'reimbursement',
  'other',
]);

export type PayrollAdjustmentType = z.infer<typeof payrollAdjustmentTypeSchema>;

export const createAdjustmentSchema = z.object({
  payroll_entry_id: z.string().uuid(),
  adjustment_type: payrollAdjustmentTypeSchema,
  amount: z.number().multipleOf(0.01),
  description: z.string().min(1).max(2000),
  reference_period: z.string().max(100).nullable().optional(),
});

export type CreateAdjustmentDto = z.infer<typeof createAdjustmentSchema>;

export const updateAdjustmentSchema = z.object({
  adjustment_type: payrollAdjustmentTypeSchema.optional(),
  amount: z.number().multipleOf(0.01).optional(),
  description: z.string().min(1).max(2000).optional(),
  reference_period: z.string().max(100).nullable().optional(),
});

export type UpdateAdjustmentDto = z.infer<typeof updateAdjustmentSchema>;

// ─── Payroll World-Class: Export Templates ───────────────────────────────────

export const exportColumnSchema = z.object({
  field: z.string().min(1).max(100),
  header: z.string().min(1).max(200),
  format: z.string().max(50).optional(),
});

export const createExportTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  columns_json: z.array(exportColumnSchema).min(1).max(50),
  file_format: z.enum(['csv', 'xlsx']),
});

export type CreateExportTemplateDto = z.infer<typeof createExportTemplateSchema>;

export const updateExportTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  columns_json: z.array(exportColumnSchema).min(1).max(50).optional(),
  file_format: z.enum(['csv', 'xlsx']).optional(),
});

export type UpdateExportTemplateDto = z.infer<typeof updateExportTemplateSchema>;

export const generateExportSchema = z.object({
  template_id: z.string().uuid().optional(),
});

export type GenerateExportDto = z.infer<typeof generateExportSchema>;

export const emailToAccountantSchema = z.object({
  template_id: z.string().uuid().optional(),
});

export type EmailToAccountantDto = z.infer<typeof emailToAccountantSchema>;

// ─── Payroll World-Class: Allowances ─────────────────────────────────────────

export const createAllowanceTypeSchema = z.object({
  name: z.string().min(1).max(200),
  name_ar: z.string().max(200).nullable().optional(),
  is_recurring: z.boolean().default(true),
  default_amount: z.number().positive().multipleOf(0.01).nullable().optional(),
});

export type CreateAllowanceTypeDto = z.infer<typeof createAllowanceTypeSchema>;

export const updateAllowanceTypeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  name_ar: z.string().max(200).nullable().optional(),
  is_recurring: z.boolean().optional(),
  default_amount: z.number().positive().multipleOf(0.01).nullable().optional(),
  active: z.boolean().optional(),
});

export type UpdateAllowanceTypeDto = z.infer<typeof updateAllowanceTypeSchema>;

export const createStaffAllowanceSchema = z.object({
  staff_profile_id: z.string().uuid(),
  allowance_type_id: z.string().uuid(),
  amount: z.number().positive().multipleOf(0.01),
  effective_from: z.string().date(),
  effective_to: z.string().date().nullable().optional(),
});

export type CreateStaffAllowanceDto = z.infer<typeof createStaffAllowanceSchema>;

export const updateStaffAllowanceSchema = z.object({
  amount: z.number().positive().multipleOf(0.01).optional(),
  effective_from: z.string().date().optional(),
  effective_to: z.string().date().nullable().optional(),
});

export type UpdateStaffAllowanceDto = z.infer<typeof updateStaffAllowanceSchema>;

// ─── Payroll World-Class: One-Off Items ──────────────────────────────────────

export const payrollOneOffTypeSchema = z.enum(['bonus', 'reimbursement', 'other']);

export type PayrollOneOffType = z.infer<typeof payrollOneOffTypeSchema>;

export const createOneOffItemSchema = z.object({
  description: z.string().min(1).max(2000),
  amount: z.number().positive().multipleOf(0.01),
  item_type: payrollOneOffTypeSchema,
});

export type CreateOneOffItemDto = z.infer<typeof createOneOffItemSchema>;

export const updateOneOffItemSchema = z.object({
  description: z.string().min(1).max(2000).optional(),
  amount: z.number().positive().multipleOf(0.01).optional(),
  item_type: payrollOneOffTypeSchema.optional(),
});

export type UpdateOneOffItemDto = z.infer<typeof updateOneOffItemSchema>;

// ─── Payroll World-Class: Recurring Deductions ───────────────────────────────

export const createRecurringDeductionSchema = z.object({
  staff_profile_id: z.string().uuid(),
  description: z.string().min(1).max(2000),
  total_amount: z.number().positive().multipleOf(0.01),
  monthly_amount: z.number().positive().multipleOf(0.01),
  start_date: z.string().date(),
}).refine(
  (d) => d.monthly_amount <= d.total_amount,
  { message: 'monthly_amount cannot exceed total_amount', path: ['monthly_amount'] },
);

export type CreateRecurringDeductionDto = z.infer<typeof createRecurringDeductionSchema>;

export const updateRecurringDeductionSchema = z.object({
  description: z.string().min(1).max(2000).optional(),
  monthly_amount: z.number().positive().multipleOf(0.01).optional(),
  active: z.boolean().optional(),
});

export type UpdateRecurringDeductionDto = z.infer<typeof updateRecurringDeductionSchema>;

// ─── Payroll World-Class: Analytics ──────────────────────────────────────────

export const payrollAnalyticsQuerySchema = z.object({
  period_year: z.coerce.number().int().min(2020).max(2100).optional(),
  months: z.coerce.number().int().min(1).max(24).default(6),
});

export type PayrollAnalyticsQueryDto = z.infer<typeof payrollAnalyticsQuerySchema>;

// ─── Payroll World-Class: Calendar ───────────────────────────────────────────

export const payrollCalendarQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
});

export type PayrollCalendarQueryDto = z.infer<typeof payrollCalendarQuerySchema>;

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
