import { z } from 'zod';

// ─── Payroll Overhaul (Wave 1) — Payslip snapshot schema ──────────────────
//
// Validates the immutable `snapshot_payload_json` written into every
// `payslips` row at finalisation time. The snapshot is the durable record
// of what produced the totals, so every downstream consumer (PDF render,
// audit, dispute resolution) reads it directly. All Decimal values
// serialise as strings via `Decimal.toString()` to preserve precision
// across the JSON boundary — never coerced to JavaScript `number`.

export const payslipSnapshotSchema = z.object({
  schema_version: z.literal(1),
  staff: z.object({
    staff_profile_id: z.string().uuid(),
    full_name: z.string(),
    employee_number: z.string().nullable(),
  }),
  period: z.object({
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    start: z.string(),
    end: z.string(),
  }),
  compensation: z.object({
    type: z.enum(['salaried', 'per_class', 'mixed']),
    base_salary: z.string().nullable(),
    per_class_rate: z.string().nullable(),
    bonus_class_multiplier: z.string().nullable(),
  }),
  inputs: z.object({
    days_worked: z.string(),
    total_working_days: z.number().int(),
    classes_delivered: z.number().int(),
    classes_scheduled: z.number().int(),
    bonus_classes: z.number().int().default(0),
  }),
  components: z.object({
    base_pay: z.string(),
    bonus_pay: z.string(),
    allowances: z.array(
      z.object({
        allowance_type_id: z.string().uuid(),
        label: z.string(),
        amount: z.string(),
      }),
    ),
    one_offs: z.array(
      z.object({
        item_type: z.string(),
        label: z.string().nullable(),
        amount: z.string(),
      }),
    ),
    adjustments: z.array(
      z.object({
        adjustment_type: z.string(),
        label: z.string().nullable(),
        amount: z.string(),
      }),
    ),
    deductions: z.array(
      z.object({
        staff_recurring_deduction_id: z.string().uuid(),
        label: z.string(),
        amount: z.string(),
        remaining_after: z.string(),
      }),
    ),
  }),
  totals: z.object({
    gross_pay: z.string(),
    total_deductions: z.string(),
    net_pay: z.string(),
    allowances_total: z.string(),
    deductions_total: z.string(),
    adjustments_total: z.string(),
    one_off_total: z.string(),
  }),
  currency: z.object({
    code: z.string().length(3),
  }),
  generated_at: z.string(),
  generated_by_user_id: z.string().uuid(),
});

export type PayslipSnapshot = z.infer<typeof payslipSnapshotSchema>;
