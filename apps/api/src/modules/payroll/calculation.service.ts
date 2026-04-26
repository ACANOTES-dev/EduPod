import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';

import type { CalcInput, CalcResult } from '@school/shared/payroll';

// ─── Payroll Overhaul (Wave 2) — pure calculation engine ──────────────────
//
// Stateless, no-DB engine. Takes a fully-resolved `CalcInput` (assembled by
// the `PayrollInputResolver`) and returns a fully-Decimal `CalcResult`.
// No `Number` coercions — every arithmetic operation runs in `Decimal`.
//
// Rounding policy: 4dp for intermediates, 2dp final, ROUND_HALF_UP. This
// matches the legacy engine's behaviour so historical comparison reports
// stay sensible across the cutover.

// ─── Legacy types (for backwards compatibility) ──────────────────────────
//
// The pre-rebuild engine exposed a `calculate(LegacyCalcInput): LegacyCalcResult`
// method that ignored allowances / one-offs / adjustments / deductions.
// Call sites that have not yet been migrated to the new resolver-based path
// (payroll-entries.service, the payslip-pdf integration test) keep using
// this adapter; Wave 5 finishes their migration.

export interface LegacyCalcInput {
  compensation_type: 'salaried' | 'per_class';
  snapshot_base_salary: number | null;
  snapshot_per_class_rate: number | null;
  snapshot_assigned_class_count: number | null;
  snapshot_bonus_class_rate: number | null;
  snapshot_bonus_day_multiplier: number | null;
  total_working_days: number;
  days_worked: number | null;
  classes_taught: number | null;
}

export interface LegacyCalcResult {
  basic_pay: number;
  bonus_pay: number;
  total_pay: number;
  daily_rate?: number;
}

@Injectable()
export class CalculationService {
  // ─── New Decimal-safe API (Wave 2 onwards) ────────────────────────────

  compute(input: CalcInput): CalcResult {
    const basePay = this.computeBasePay(input);
    const classBonus = this.computeClassBonus(input);

    const allowances = input.allowancesTotal;
    const positiveOneOffs = input.oneOffPositiveTotal;
    const positiveAdjustments = input.adjustmentPositiveTotal;

    const grossPay = basePay
      .plus(classBonus)
      .plus(allowances)
      .plus(positiveOneOffs)
      .plus(positiveAdjustments)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const negativeOneOffs = input.oneOffNegativeTotal;
    const negativeAdjustments = input.adjustmentNegativeTotal;
    const recurring = input.scheduledDeductionsTotal;

    const totalDeductions = recurring
      .plus(negativeOneOffs)
      .plus(negativeAdjustments)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    const netPay = grossPay.minus(totalDeductions).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    return {
      basePay,
      bonusPay: classBonus
        .plus(positiveOneOffs)
        .plus(positiveAdjustments)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      grossPay,
      allowancesTotal: allowances,
      deductionsTotal: recurring,
      adjustmentsTotal: positiveAdjustments
        .minus(negativeAdjustments)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      oneOffTotal: positiveOneOffs.minus(negativeOneOffs).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      totalDeductions,
      netPay,
    };
  }

  private computeBasePay(input: CalcInput): Decimal {
    if (input.compensationType === 'per_class') return new Decimal(0);
    if (!input.baseSalary || !input.daysWorked || input.totalWorkingDays === 0) {
      return new Decimal(0);
    }
    const ratio = input.daysWorked.dividedBy(input.totalWorkingDays).toDecimalPlaces(4);
    return input.baseSalary.times(ratio).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  private computeClassBonus(input: CalcInput): Decimal {
    if (input.compensationType === 'salaried') return new Decimal(0);
    if (!input.perClassRate) return new Decimal(0);

    const regular = input.perClassRate.times(input.classesDelivered);

    if (input.bonusClasses === 0 || !input.bonusClassMultiplier) {
      return regular.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    }

    const bonus = input.perClassRate.times(input.bonusClasses).times(input.bonusClassMultiplier);
    return regular.plus(bonus).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }

  // ─── Legacy adapter (deprecated — remove in Wave 5) ───────────────────
  //
  // Pre-rebuild call sites pass the old number-typed CalcInput shape and
  // expect the old number-typed CalcResult. This adapter maps old → new
  // (zeroing out the inputs the legacy shape can't express) and back, so
  // those sites keep working until Wave 5 migrates them to the resolver.
  //
  // @deprecated Use `compute(CalcInput)` with a fully-resolved `CalcInput`
  // built by `PayrollInputResolver`.

  calculate(input: LegacyCalcInput): LegacyCalcResult {
    if (input.compensation_type === 'salaried') {
      return this.calculateSalariedLegacy(input);
    }
    return this.calculatePerClassLegacy(input);
  }

  private calculateSalariedLegacy(input: LegacyCalcInput): LegacyCalcResult {
    if (input.snapshot_base_salary === null || input.snapshot_base_salary === undefined) {
      throw new Error(
        'Cannot calculate salaried pay: snapshot_base_salary is missing. ' +
          'Ensure the staff member has an active compensation record with a base salary.',
      );
    }
    const baseSalary = input.snapshot_base_salary;
    const totalWorkingDays = input.total_working_days;
    const daysWorked = input.days_worked ?? 0;
    const bonusMultiplier = input.snapshot_bonus_day_multiplier ?? 1.0;

    if (totalWorkingDays <= 0) {
      return { basic_pay: 0, bonus_pay: 0, total_pay: 0, daily_rate: 0 };
    }

    const dailyRate = Number((baseSalary / totalWorkingDays).toFixed(4));

    let basicPay: number;
    let bonusPay: number;

    if (daysWorked <= totalWorkingDays) {
      basicPay = Number((dailyRate * daysWorked).toFixed(2));
      bonusPay = 0;
    } else {
      basicPay = Number(baseSalary.toFixed(2));
      const extraDays = daysWorked - totalWorkingDays;
      bonusPay = Number((dailyRate * bonusMultiplier * extraDays).toFixed(2));
    }

    const totalPay = Number((basicPay + bonusPay).toFixed(2));
    return { basic_pay: basicPay, bonus_pay: bonusPay, total_pay: totalPay, daily_rate: dailyRate };
  }

  private calculatePerClassLegacy(input: LegacyCalcInput): LegacyCalcResult {
    if (input.snapshot_per_class_rate === null || input.snapshot_per_class_rate === undefined) {
      throw new Error(
        'Cannot calculate per-class pay: snapshot_per_class_rate is missing. ' +
          'Ensure the staff member has an active compensation record with a per-class rate.',
      );
    }
    const perClassRate = input.snapshot_per_class_rate;
    const assignedCount = input.snapshot_assigned_class_count ?? 0;
    const bonusClassRate = input.snapshot_bonus_class_rate ?? 0;
    const classesTaught = input.classes_taught ?? 0;

    let basicPay: number;
    let bonusPay: number;

    if (classesTaught <= assignedCount) {
      basicPay = Number((classesTaught * perClassRate).toFixed(2));
      bonusPay = 0;
    } else {
      basicPay = Number((assignedCount * perClassRate).toFixed(2));
      bonusPay = Number(((classesTaught - assignedCount) * bonusClassRate).toFixed(2));
    }

    const totalPay = Number((basicPay + bonusPay).toFixed(2));
    return { basic_pay: basicPay, bonus_pay: bonusPay, total_pay: totalPay };
  }
}
