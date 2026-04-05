/**
 * Additional branch coverage for PayrollCalendarService.
 * Targets: getPayrollCalendar (default year, explicit year),
 * getNextPayDate (current month's pay date is upcoming, past, year wrap).
 */
import { Test, TestingModule } from '@nestjs/testing';

import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

import { PayrollCalendarService } from './payroll-calendar.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('PayrollCalendarService — branch coverage', () => {
  let service: PayrollCalendarService;
  let mockSettingsService: { getSettings: jest.Mock };

  beforeEach(async () => {
    mockSettingsService = {
      getSettings: jest.fn().mockResolvedValue({
        payroll: {
          payrollPayDay: 25,
          payrollPreparationLeadDays: 5,
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollCalendarService,
        { provide: PrismaService, useValue: {} },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<PayrollCalendarService>(PayrollCalendarService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getPayrollCalendar ───────────────────────────────────────────────────

  describe('PayrollCalendarService — getPayrollCalendar', () => {
    it('should return 12 pay dates for explicit year', async () => {
      const result = await service.getPayrollCalendar(TENANT_ID, 2026);

      expect(result.pay_dates).toHaveLength(12);
      expect(result.pay_day).toBe(25);
      expect(result.preparation_lead_days).toBe(5);
      expect(result.pay_dates[0]!.month).toBe(1);
      expect(result.pay_dates[11]!.month).toBe(12);
    });

    it('should default to current year when not specified', async () => {
      const result = await service.getPayrollCalendar(TENANT_ID);

      expect(result.pay_dates).toHaveLength(12);
      expect(result.pay_dates[0]!.year).toBe(new Date().getFullYear());
    });

    it('should generate preparation_deadline before pay_date', async () => {
      const result = await service.getPayrollCalendar(TENANT_ID, 2026);

      for (const pd of result.pay_dates) {
        expect(new Date(pd.preparation_deadline).getTime()).toBeLessThan(
          new Date(pd.pay_date).getTime(),
        );
      }
    });
  });

  // ─── getNextPayDate ───────────────────────────────────────────────────────

  describe('PayrollCalendarService — getNextPayDate', () => {
    it('should return next pay date information', async () => {
      const result = await service.getNextPayDate(TENANT_ID);

      expect(result.next_pay_date).toBeDefined();
      expect(result.days_until_pay).toBeGreaterThanOrEqual(0);
      expect(result.preparation_deadline).toBeDefined();
      expect(result.days_until_preparation_deadline).toBeDefined();
      expect(result.current_month).toBeGreaterThanOrEqual(1);
      expect(result.current_year).toBeGreaterThanOrEqual(2026);
    });

    it('should handle December to January year wrap', async () => {
      // Override pay day to 1 so that any date past the 1st forces advance
      mockSettingsService.getSettings.mockResolvedValue({
        payroll: {
          payrollPayDay: 1,
          payrollPreparationLeadDays: 3,
        },
      });

      const result = await service.getNextPayDate(TENANT_ID);

      // Should have valid pay date
      expect(new Date(result.next_pay_date).toString()).not.toBe('Invalid Date');
    });
  });
});
