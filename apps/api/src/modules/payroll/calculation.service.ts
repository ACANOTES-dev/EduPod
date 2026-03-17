import { Injectable } from '@nestjs/common';

export interface CalcInput {
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

export interface CalcResult {
  basic_pay: number;
  bonus_pay: number;
  total_pay: number;
  daily_rate?: number;
}

@Injectable()
export class CalculationService {
  calculate(input: CalcInput): CalcResult {
    if (input.compensation_type === 'salaried') {
      return this.calculateSalaried(input);
    }
    return this.calculatePerClass(input);
  }

  private calculateSalaried(input: CalcInput): CalcResult {
    const baseSalary = input.snapshot_base_salary ?? 0;
    const totalWorkingDays = input.total_working_days;
    const daysWorked = input.days_worked ?? 0;
    const bonusMultiplier = input.snapshot_bonus_day_multiplier ?? 1.0;

    if (totalWorkingDays <= 0) {
      return { basic_pay: 0, bonus_pay: 0, total_pay: 0, daily_rate: 0 };
    }

    // Intermediate: 4 decimal places
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

  private calculatePerClass(input: CalcInput): CalcResult {
    const perClassRate = input.snapshot_per_class_rate ?? 0;
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
