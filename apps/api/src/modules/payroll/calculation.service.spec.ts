import { CalculationService } from './calculation.service';
import type { CalcInput } from './calculation.service';

describe('CalculationService', () => {
  let service: CalculationService;

  beforeEach(() => {
    service = new CalculationService();
  });

  // ─── Helper ──────────────────────────────────────────────────────────────

  function salariedInput(overrides: Partial<CalcInput> = {}): CalcInput {
    return {
      compensation_type: 'salaried',
      snapshot_base_salary: 3000,
      snapshot_per_class_rate: null,
      snapshot_assigned_class_count: null,
      snapshot_bonus_class_rate: null,
      snapshot_bonus_day_multiplier: 1.0,
      total_working_days: 22,
      days_worked: 22,
      classes_taught: null,
      ...overrides,
    };
  }

  function perClassInput(overrides: Partial<CalcInput> = {}): CalcInput {
    return {
      compensation_type: 'per_class',
      snapshot_base_salary: null,
      snapshot_per_class_rate: 50,
      snapshot_assigned_class_count: 20,
      snapshot_bonus_class_rate: 75,
      snapshot_bonus_day_multiplier: null,
      total_working_days: 22,
      days_worked: null,
      classes_taught: 20,
      ...overrides,
    };
  }

  // ─── Salaried ────────────────────────────────────────────────────────────

  describe('Salaried Calculations', () => {
    it('should calculate pro-rata basic pay when days_worked < total_working_days', () => {
      const result = service.calculate(
        salariedInput({ days_worked: 15 }),
      );
      expect(result.daily_rate).toBe(136.3636);
      expect(result.basic_pay).toBe(2045.45);
      expect(result.bonus_pay).toBe(0);
      expect(result.total_pay).toBe(2045.45);
    });

    it('should calculate full basic pay when days_worked = total_working_days', () => {
      const result = service.calculate(
        salariedInput({ days_worked: 22 }),
      );
      expect(result.basic_pay).toBe(3000);
      expect(result.bonus_pay).toBe(0);
      expect(result.total_pay).toBe(3000);
    });

    it('should calculate bonus when days_worked > total_working_days with multiplier 1.0', () => {
      const result = service.calculate(
        salariedInput({ days_worked: 25, snapshot_bonus_day_multiplier: 1.0 }),
      );
      expect(result.basic_pay).toBe(3000);
      expect(result.bonus_pay).toBe(409.09);
      expect(result.total_pay).toBe(3409.09);
    });

    it('should calculate bonus with 1.5x multiplier (time-and-a-half)', () => {
      const result = service.calculate(
        salariedInput({ days_worked: 25, snapshot_bonus_day_multiplier: 1.5 }),
      );
      expect(result.basic_pay).toBe(3000);
      expect(result.bonus_pay).toBe(613.64);
      expect(result.total_pay).toBe(3613.64);
    });

    it('should return zero pay when days_worked is 0', () => {
      const result = service.calculate(
        salariedInput({ days_worked: 0 }),
      );
      expect(result.basic_pay).toBe(0);
      expect(result.bonus_pay).toBe(0);
      expect(result.total_pay).toBe(0);
    });

    it('edge: should handle total_working_days = 0 gracefully', () => {
      const result = service.calculate(
        salariedInput({ total_working_days: 0, days_worked: 10 }),
      );
      expect(result.basic_pay).toBe(0);
      expect(result.bonus_pay).toBe(0);
      expect(result.total_pay).toBe(0);
      expect(result.daily_rate).toBe(0);
    });

    it('should round intermediate daily_rate to 4dp and final values to 2dp', () => {
      const result = service.calculate(
        salariedInput({
          snapshot_base_salary: 1000,
          total_working_days: 3,
          days_worked: 2,
        }),
      );
      expect(result.daily_rate).toBe(333.3333);
      expect(result.basic_pay).toBe(666.67);
      expect(result.total_pay).toBe(666.67);
    });
  });

  // ─── Per-Class ───────────────────────────────────────────────────────────

  describe('Per-Class Calculations', () => {
    it('should calculate basic pay when classes_taught <= assigned_class_count', () => {
      const result = service.calculate(
        perClassInput({ classes_taught: 15 }),
      );
      expect(result.basic_pay).toBe(750);
      expect(result.bonus_pay).toBe(0);
      expect(result.total_pay).toBe(750);
    });

    it('should calculate full basic and bonus when classes_taught > assigned_class_count', () => {
      const result = service.calculate(
        perClassInput({ classes_taught: 25 }),
      );
      expect(result.basic_pay).toBe(1000);
      expect(result.bonus_pay).toBe(375);
      expect(result.total_pay).toBe(1375);
    });

    it('should return zero when classes_taught is 0', () => {
      const result = service.calculate(
        perClassInput({ classes_taught: 0 }),
      );
      expect(result.basic_pay).toBe(0);
      expect(result.bonus_pay).toBe(0);
      expect(result.total_pay).toBe(0);
    });

    it('should handle bonus_class_rate = 0 (no bonus pay)', () => {
      const result = service.calculate(
        perClassInput({ classes_taught: 25, snapshot_bonus_class_rate: 0 }),
      );
      expect(result.basic_pay).toBe(1000);
      expect(result.bonus_pay).toBe(0);
      expect(result.total_pay).toBe(1000);
    });

    it('should calculate exact basic when classes_taught = assigned_class_count', () => {
      const result = service.calculate(
        perClassInput({ classes_taught: 20 }),
      );
      expect(result.basic_pay).toBe(1000);
      expect(result.bonus_pay).toBe(0);
      expect(result.total_pay).toBe(1000);
    });
  });
});
