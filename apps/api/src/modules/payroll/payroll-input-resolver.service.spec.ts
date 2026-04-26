import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';

import { PrismaService } from '../prisma/prisma.service';

import { ClassDeliveryService } from './class-delivery.service';
import { CompensationService } from './compensation.service';
import { PayrollAdjustmentsService } from './payroll-adjustments.service';
import { PayrollAllowancesService } from './payroll-allowances.service';
import { PayrollDeductionsService } from './payroll-deductions.service';
import { PayrollInputResolver } from './payroll-input-resolver.service';
import { PayrollOneOffsService } from './payroll-one-offs.service';
import { StaffAttendanceService } from './staff-attendance.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const RUN_ID = '22222222-2222-2222-2222-222222222222';
const ENTRY_ID_A = '33333333-3333-3333-3333-333333333333';
const ENTRY_ID_B = '44444444-4444-4444-4444-444444444444';
const STAFF_ID_A = '55555555-5555-5555-5555-555555555555';
const STAFF_ID_B = '66666666-6666-6666-6666-666666666666';

function buildRun(entries: Array<{ id: string; staff_profile_id: string }>) {
  return {
    id: RUN_ID,
    tenant_id: TENANT_ID,
    period_year: 2026,
    period_month: 4,
    total_working_days: 22,
    entries,
  };
}

function buildSalariedComp(): Record<string, unknown> {
  return {
    compensation_type: 'salaried',
    base_salary: '50000',
    per_class_rate: null,
    bonus_day_multiplier: null,
  };
}

function buildPerClassComp(): Record<string, unknown> {
  return {
    compensation_type: 'per_class',
    base_salary: null,
    per_class_rate: '100',
    bonus_day_multiplier: '1.5',
  };
}

function buildMixedComp(): Record<string, unknown> {
  return {
    compensation_type: 'mixed',
    base_salary: '20000',
    per_class_rate: '75',
    bonus_day_multiplier: '1.25',
  };
}

// ─── Spec ────────────────────────────────────────────────────────────────────

describe('PayrollInputResolver', () => {
  let resolver: PayrollInputResolver;
  let prisma: { payrollRun: { findFirstOrThrow: jest.Mock } };
  let attendance: { calculateDaysWorkedForPeriod: jest.Mock };
  let classDelivery: { calculateClassesDeliveredForPeriod: jest.Mock };
  let allowances: { calculateAllowancesTotalForPeriod: jest.Mock };
  let deductions: { scheduleApplicationForRun: jest.Mock };
  let adjustments: { sumByEntry: jest.Mock };
  let oneOffs: { sumByEntry: jest.Mock };
  let compensation: { findActiveForPeriod: jest.Mock };

  beforeEach(async () => {
    prisma = {
      payrollRun: { findFirstOrThrow: jest.fn() },
    };
    attendance = { calculateDaysWorkedForPeriod: jest.fn() };
    classDelivery = { calculateClassesDeliveredForPeriod: jest.fn() };
    allowances = { calculateAllowancesTotalForPeriod: jest.fn() };
    deductions = { scheduleApplicationForRun: jest.fn() };
    adjustments = { sumByEntry: jest.fn() };
    oneOffs = { sumByEntry: jest.fn() };
    compensation = { findActiveForPeriod: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollInputResolver,
        { provide: PrismaService, useValue: prisma },
        { provide: StaffAttendanceService, useValue: attendance },
        { provide: ClassDeliveryService, useValue: classDelivery },
        { provide: PayrollAllowancesService, useValue: allowances },
        { provide: PayrollDeductionsService, useValue: deductions },
        { provide: PayrollAdjustmentsService, useValue: adjustments },
        { provide: PayrollOneOffsService, useValue: oneOffs },
        { provide: CompensationService, useValue: compensation },
      ],
    }).compile();

    resolver = module.get<PayrollInputResolver>(PayrollInputResolver);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Happy path: salaried entry plumbs every input ─────────────────────────

  it('resolves a salaried entry with every input source plumbed in', async () => {
    prisma.payrollRun.findFirstOrThrow.mockResolvedValue(
      buildRun([{ id: ENTRY_ID_A, staff_profile_id: STAFF_ID_A }]),
    );
    compensation.findActiveForPeriod.mockResolvedValue(buildSalariedComp());
    attendance.calculateDaysWorkedForPeriod.mockResolvedValue(new Decimal('22'));
    allowances.calculateAllowancesTotalForPeriod.mockResolvedValue(new Decimal('1500'));
    deductions.scheduleApplicationForRun.mockResolvedValue(new Decimal('200'));
    oneOffs.sumByEntry.mockResolvedValue({
      positive: new Decimal('500'),
      negative: new Decimal('0'),
    });
    adjustments.sumByEntry.mockResolvedValue({
      positive: new Decimal('100'),
      negative: new Decimal('50'),
    });

    const result = await resolver.resolveForRun(TENANT_ID, RUN_ID);

    expect(result.size).toBe(1);
    const input = result.get(ENTRY_ID_A);
    expect(input).toBeDefined();
    expect(input?.compensationType).toBe('salaried');
    expect(input?.baseSalary?.toString()).toBe('50000');
    expect(input?.daysWorked?.toString()).toBe('22');
    expect(input?.totalWorkingDays).toBe(22);
    expect(input?.allowancesTotal.toString()).toBe('1500');
    expect(input?.scheduledDeductionsTotal.toString()).toBe('200');
    expect(input?.oneOffPositiveTotal.toString()).toBe('500');
    expect(input?.adjustmentPositiveTotal.toString()).toBe('100');
    expect(input?.adjustmentNegativeTotal.toString()).toBe('50');
    // Salaried entries do NOT query class-delivery
    expect(classDelivery.calculateClassesDeliveredForPeriod).not.toHaveBeenCalled();
    expect(input?.classesDelivered).toBe(0);
    expect(input?.bonusClasses).toBe(0);
  });

  // ─── Per-class skips attendance, queries class delivery ────────────────────

  it('resolves a per-class entry without querying attendance', async () => {
    prisma.payrollRun.findFirstOrThrow.mockResolvedValue(
      buildRun([{ id: ENTRY_ID_A, staff_profile_id: STAFF_ID_A }]),
    );
    compensation.findActiveForPeriod.mockResolvedValue(buildPerClassComp());
    classDelivery.calculateClassesDeliveredForPeriod.mockResolvedValue({
      delivered: 18,
      bonusClasses: 4,
    });
    allowances.calculateAllowancesTotalForPeriod.mockResolvedValue(new Decimal('0'));
    deductions.scheduleApplicationForRun.mockResolvedValue(new Decimal('0'));
    oneOffs.sumByEntry.mockResolvedValue({
      positive: new Decimal('0'),
      negative: new Decimal('0'),
    });
    adjustments.sumByEntry.mockResolvedValue({
      positive: new Decimal('0'),
      negative: new Decimal('0'),
    });

    const result = await resolver.resolveForRun(TENANT_ID, RUN_ID);
    const input = result.get(ENTRY_ID_A);

    expect(input?.compensationType).toBe('per_class');
    expect(input?.classesDelivered).toBe(18);
    expect(input?.bonusClasses).toBe(4);
    expect(input?.perClassRate?.toString()).toBe('100');
    expect(input?.bonusClassMultiplier?.toString()).toBe('1.5');
    // Per-class entries fall back to total_working_days for daysWorked
    expect(input?.daysWorked?.toString()).toBe('22');
    expect(attendance.calculateDaysWorkedForPeriod).not.toHaveBeenCalled();
  });

  // ─── Mixed queries both ────────────────────────────────────────────────────

  it('resolves a mixed entry by querying both attendance and class delivery', async () => {
    prisma.payrollRun.findFirstOrThrow.mockResolvedValue(
      buildRun([{ id: ENTRY_ID_A, staff_profile_id: STAFF_ID_A }]),
    );
    compensation.findActiveForPeriod.mockResolvedValue(buildMixedComp());
    attendance.calculateDaysWorkedForPeriod.mockResolvedValue(new Decimal('20'));
    classDelivery.calculateClassesDeliveredForPeriod.mockResolvedValue({
      delivered: 12,
      bonusClasses: 0,
    });
    allowances.calculateAllowancesTotalForPeriod.mockResolvedValue(new Decimal('0'));
    deductions.scheduleApplicationForRun.mockResolvedValue(new Decimal('0'));
    oneOffs.sumByEntry.mockResolvedValue({
      positive: new Decimal('0'),
      negative: new Decimal('0'),
    });
    adjustments.sumByEntry.mockResolvedValue({
      positive: new Decimal('0'),
      negative: new Decimal('0'),
    });

    const result = await resolver.resolveForRun(TENANT_ID, RUN_ID);
    const input = result.get(ENTRY_ID_A);

    expect(input?.compensationType).toBe('mixed');
    expect(attendance.calculateDaysWorkedForPeriod).toHaveBeenCalledTimes(1);
    expect(classDelivery.calculateClassesDeliveredForPeriod).toHaveBeenCalledTimes(1);
    expect(input?.daysWorked?.toString()).toBe('20');
    expect(input?.classesDelivered).toBe(12);
  });

  // ─── Skip entries without active compensation ─────────────────────────────

  it('skips entries with no period-active compensation', async () => {
    prisma.payrollRun.findFirstOrThrow.mockResolvedValue(
      buildRun([
        { id: ENTRY_ID_A, staff_profile_id: STAFF_ID_A },
        { id: ENTRY_ID_B, staff_profile_id: STAFF_ID_B },
      ]),
    );
    compensation.findActiveForPeriod
      .mockResolvedValueOnce(buildSalariedComp()) // ENTRY_ID_A — has comp
      .mockResolvedValueOnce(null); // ENTRY_ID_B — no comp, must skip
    attendance.calculateDaysWorkedForPeriod.mockResolvedValue(new Decimal('22'));
    allowances.calculateAllowancesTotalForPeriod.mockResolvedValue(new Decimal('0'));
    deductions.scheduleApplicationForRun.mockResolvedValue(new Decimal('0'));
    oneOffs.sumByEntry.mockResolvedValue({
      positive: new Decimal('0'),
      negative: new Decimal('0'),
    });
    adjustments.sumByEntry.mockResolvedValue({
      positive: new Decimal('0'),
      negative: new Decimal('0'),
    });

    const result = await resolver.resolveForRun(TENANT_ID, RUN_ID);

    expect(result.size).toBe(1);
    expect(result.has(ENTRY_ID_A)).toBe(true);
    expect(result.has(ENTRY_ID_B)).toBe(false);
    // The skipped entry must NOT trigger any input queries
    expect(attendance.calculateDaysWorkedForPeriod).toHaveBeenCalledTimes(1);
    expect(allowances.calculateAllowancesTotalForPeriod).toHaveBeenCalledTimes(1);
  });

  // ─── Resolver passes the optional tx through to every input service ───────

  it('threads the optional transaction client through every input service', async () => {
    prisma.payrollRun.findFirstOrThrow.mockResolvedValue(
      buildRun([{ id: ENTRY_ID_A, staff_profile_id: STAFF_ID_A }]),
    );
    compensation.findActiveForPeriod.mockResolvedValue(buildSalariedComp());
    attendance.calculateDaysWorkedForPeriod.mockResolvedValue(new Decimal('22'));
    allowances.calculateAllowancesTotalForPeriod.mockResolvedValue(new Decimal('0'));
    deductions.scheduleApplicationForRun.mockResolvedValue(new Decimal('0'));
    oneOffs.sumByEntry.mockResolvedValue({
      positive: new Decimal('0'),
      negative: new Decimal('0'),
    });
    adjustments.sumByEntry.mockResolvedValue({
      positive: new Decimal('0'),
      negative: new Decimal('0'),
    });

    // The resolver uses `db = tx ?? this.prisma` for the initial run lookup,
    // so the tx mock must satisfy that read too.
    const tx = {
      payrollRun: {
        findFirstOrThrow: jest
          .fn()
          .mockResolvedValue(buildRun([{ id: ENTRY_ID_A, staff_profile_id: STAFF_ID_A }])),
      },
    } as unknown as Parameters<typeof resolver.resolveForRun>[2];
    await resolver.resolveForRun(TENANT_ID, RUN_ID, tx);

    expect(compensation.findActiveForPeriod).toHaveBeenCalledWith(
      TENANT_ID,
      STAFF_ID_A,
      expect.any(Date),
      expect.any(Date),
      tx,
    );
    expect(attendance.calculateDaysWorkedForPeriod).toHaveBeenCalledWith(
      TENANT_ID,
      STAFF_ID_A,
      expect.any(Date),
      expect.any(Date),
      22, // total_working_days plumbs through
      tx,
    );
    expect(allowances.calculateAllowancesTotalForPeriod).toHaveBeenCalledWith(
      TENANT_ID,
      STAFF_ID_A,
      expect.any(Date),
      expect.any(Date),
      tx,
    );
    expect(deductions.scheduleApplicationForRun).toHaveBeenCalledWith(
      TENANT_ID,
      RUN_ID,
      ENTRY_ID_A,
      STAFF_ID_A,
      tx,
    );
    expect(oneOffs.sumByEntry).toHaveBeenCalledWith(TENANT_ID, ENTRY_ID_A, tx);
    expect(adjustments.sumByEntry).toHaveBeenCalledWith(TENANT_ID, ENTRY_ID_A, tx);
  });
});
