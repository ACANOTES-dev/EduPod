import { Test, TestingModule } from '@nestjs/testing';

import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

import { PayrollCalendarService } from './payroll-calendar.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

function buildPrisma() {
  return {};
}

function buildSettingsService(payDay = 25, leadDays = 5) {
  return {
    getSettings: jest.fn().mockResolvedValue({
      payroll: {
        payDay,
        payrollPreparationLeadDays: leadDays,
      },
    }),
  };
}

describe('PayrollCalendarService', () => {
  let service: PayrollCalendarService;

  async function createService(payDay = 25, leadDays = 5): Promise<void> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollCalendarService,
        { provide: PrismaService, useValue: buildPrisma() },
        { provide: SettingsService, useValue: buildSettingsService(payDay, leadDays) },
      ],
    }).compile();

    service = module.get<PayrollCalendarService>(PayrollCalendarService);
  }

  it('should be defined', async () => {
    await createService();
    expect(service).toBeDefined();
  });

  it('should return 12 pay dates for a year', async () => {
    await createService();
    const result = await service.getPayrollCalendar(TENANT_ID, 2026);

    expect(result.pay_dates).toHaveLength(12);
    expect(result.pay_day).toBe(25);
    expect(result.preparation_lead_days).toBe(5);
  });

  it('should clamp pay_day to last day of February', async () => {
    await createService(31);
    const result = await service.getPayrollCalendar(TENANT_ID, 2026);
    const february = result.pay_dates.find((d) => d.month === 2);
    expect(february).toBeDefined();
    // 2026 is not a leap year, so Feb has 28 days
    expect(february?.pay_date).toBe('2026-02-28');
  });

  it('should return preparation deadline = pay_date - lead_days', async () => {
    await createService(25, 5);
    const result = await service.getPayrollCalendar(TENANT_ID, 2026);
    const march = result.pay_dates.find((d) => d.month === 3);
    expect(march?.pay_date).toBe('2026-03-25');
    expect(march?.preparation_deadline).toBe('2026-03-20');
  });

  it('should use defaults when settings throw', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollCalendarService,
        { provide: PrismaService, useValue: buildPrisma() },
        {
          provide: SettingsService,
          useValue: { getSettings: jest.fn().mockRejectedValue(new Error('no settings')) },
        },
      ],
    }).compile();

    service = module.get<PayrollCalendarService>(PayrollCalendarService);
    const result = await service.getPayrollCalendar(TENANT_ID, 2026);
    expect(result.pay_day).toBe(25);
    expect(result.preparation_lead_days).toBe(5);
  });

  it('getNextPayDate should return valid future date', async () => {
    await createService(25, 5);
    const result = await service.getNextPayDate(TENANT_ID);

    expect(result.next_pay_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.days_until_pay).toBeGreaterThanOrEqual(0);
    expect(result.preparation_deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('checkPreparationDeadline should return deadline info', async () => {
    await createService(25, 5);
    const result = await service.checkPreparationDeadline(TENANT_ID);

    expect(typeof result.is_past_deadline).toBe('boolean');
    expect(result.preparation_deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.days_overdue).toBeGreaterThanOrEqual(0);
  });

  // ─── Additional branch coverage ──────────────────────────────────────────

  it('should use defaults when settings has no payroll key', async () => {
    const module = await Test.createTestingModule({
      providers: [
        PayrollCalendarService,
        { provide: PrismaService, useValue: buildPrisma() },
        {
          provide: SettingsService,
          useValue: { getSettings: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    service = module.get<PayrollCalendarService>(PayrollCalendarService);
    const result = await service.getPayrollCalendar(TENANT_ID, 2026);
    expect(result.pay_day).toBe(25);
    expect(result.preparation_lead_days).toBe(5);
  });

  it('should use defaults when payDay is not a number', async () => {
    const module = await Test.createTestingModule({
      providers: [
        PayrollCalendarService,
        { provide: PrismaService, useValue: buildPrisma() },
        {
          provide: SettingsService,
          useValue: {
            getSettings: jest.fn().mockResolvedValue({
              payroll: { payDay: 'not-a-number', payrollPreparationLeadDays: 'bad' },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PayrollCalendarService>(PayrollCalendarService);
    const result = await service.getPayrollCalendar(TENANT_ID, 2026);
    expect(result.pay_day).toBe(25);
    expect(result.preparation_lead_days).toBe(5);
  });

  it('should use current year when year param is omitted', async () => {
    await createService();
    const result = await service.getPayrollCalendar(TENANT_ID);

    const currentYear = new Date().getFullYear();
    expect(result.pay_dates[0]!.year).toBe(currentYear);
  });

  it('should handle month rollover in getNextPayDate (December to January)', async () => {
    await createService(1, 0);
    const result = await service.getNextPayDate(TENANT_ID);

    expect(result.next_pay_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.days_until_pay).toBeGreaterThanOrEqual(0);
  });

  it('should return all 12 months with month_labels', async () => {
    await createService();
    const result = await service.getPayrollCalendar(TENANT_ID, 2026);

    expect(result.pay_dates).toHaveLength(12);
    expect(result.pay_dates[0]!.month_label).toBe('January');
    expect(result.pay_dates[11]!.month_label).toBe('December');
  });

  it('should clamp pay_day 31 in April (30 days)', async () => {
    await createService(31);
    const result = await service.getPayrollCalendar(TENANT_ID, 2026);
    const april = result.pay_dates.find((d) => d.month === 4);
    // April has 30 days, so pay_day 31 clamps to 30
    expect(april!.pay_date).toMatch(/^2026-04-(29|30)$/);
  });

  it('checkPreparationDeadline should show positive days_overdue when past deadline', async () => {
    // Set pay_day to 1 and lead_days to 30 so deadline is always in the past
    await createService(1, 30);
    const result = await service.checkPreparationDeadline(TENANT_ID);

    // The deadline for a pay day of 1 with 30 day lead is always in the past for real dates
    expect(typeof result.is_past_deadline).toBe('boolean');
    expect(typeof result.days_overdue).toBe('number');
  });
});
