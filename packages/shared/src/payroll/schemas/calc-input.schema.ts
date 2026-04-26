import Decimal from 'decimal.js';

// ─── Payroll Overhaul (Wave 1) — Calculation engine I/O ───────────────────
//
// The internal contract between `PayrollInputResolver` and
// `CalculationService` (Wave 2). NOT a wire format — these types never
// leave the API process. The wire format is `payslipSnapshotSchema`.
//
// We intentionally do NOT define a Zod schema here: the resolver constructs
// `CalcInput` from already-validated Prisma rows, and the engine returns a
// pure-Decimal `CalcResult` that the persistence layer mapps to schema columns.
// All money math runs in `Decimal` end-to-end — no `Number` coercion.

export interface CalcInput {
  compensationType: 'salaried' | 'per_class' | 'mixed';

  // ─── Salaried inputs ──────────────────────────────────────────────────
  baseSalary: Decimal | null;
  /** Decimal because half-days exist (counted as 0.5). */
  daysWorked: Decimal | null;
  /** Run-level integer entered by the admin at run creation. */
  totalWorkingDays: number;

  // ─── Per-class inputs ─────────────────────────────────────────────────
  perClassRate: Decimal | null;
  /** Integer count of classes delivered in the period. */
  classesDelivered: number;
  bonusClasses: number;
  bonusClassMultiplier: Decimal | null;

  // ─── Aggregated input totals (already summed and signed) ──────────────
  /** Always positive. Sum of allowances active during the period. */
  allowancesTotal: Decimal;
  /** Bonuses, awards, positive corrections. Always positive. */
  oneOffPositiveTotal: Decimal;
  /** Unpaid corrections. Always positive (a magnitude — the engine subtracts). */
  oneOffNegativeTotal: Decimal;
  /** Positive adjustments. Always positive. */
  adjustmentPositiveTotal: Decimal;
  /** Negative adjustments. Always positive (a magnitude — the engine subtracts). */
  adjustmentNegativeTotal: Decimal;
  /** Recurring deductions planned for this run, not yet committed to balance. */
  scheduledDeductionsTotal: Decimal;
}

export interface CalcResult {
  /** Pro-rated salaried pay, or 0 for per-class staff. */
  basePay: Decimal;
  /** Class-based pay plus positive one-offs/adjustments. */
  bonusPay: Decimal;
  grossPay: Decimal;
  allowancesTotal: Decimal;
  deductionsTotal: Decimal;
  /** Signed sum: positive minus negative. */
  adjustmentsTotal: Decimal;
  /** Signed sum: positive minus negative. */
  oneOffTotal: Decimal;
  /** Sum of all subtractive components (for the `total_deductions` column). */
  totalDeductions: Decimal;
  netPay: Decimal;
}
