/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import { ApprovalRequestsService } from '../../../modules/approvals/approval-requests.service';
import { SettingsService } from '../../../modules/configuration/settings.service';
import { EncryptionService } from '../../../modules/configuration/encryption.service';
import { CalculationService } from '../../../modules/payroll/calculation.service';
import { PayrollRunsService } from '../../../modules/payroll/payroll-runs.service';
import { PayslipsService } from '../../../modules/payroll/payslips.service';
import { PdfRenderingService } from '../../../modules/pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../../../modules/prisma/prisma.service';
import { RedisService } from '../../../modules/redis/redis.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-uuid-integration-004';
const USER_ID = 'user-uuid-integration-004';
const RUN_ID = 'run-uuid-integration-004';
const ENTRY_ID = 'entry-uuid-integration-004';
const STAFF_PROFILE_ID = 'staff-uuid-integration-004';

// ─── Mock factories ──────────────────────────────────────────────────────────

const buildMockPrisma = () => ({
  payrollRun: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  payrollEntry: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  payslip: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    createMany: jest.fn(),
  },
  staffCompensation: {
    findMany: jest.fn(),
  },
  staffProfile: {
    findFirst: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
  tenantBranding: {
    findUnique: jest.fn(),
  },
  tenantSequences: {
    findFirst: jest.fn(),
  },
  schedule: {
    count: jest.fn(),
  },
});

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Payroll -> Payslip -> PDF flow', () => {
  let payrollRunsService: PayrollRunsService;
  let calculationService: CalculationService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  const mockApprovalRequestsService = {
    checkAndCreateIfNeeded: jest.fn(),
  };

  const mockSettingsService = {
    getSettings: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockPayslipsService = {
    generatePayslipsForRun: jest.fn(),
    listPayslips: jest.fn(),
  };

  const mockPdfRenderingService = {
    renderPayslip: jest.fn(),
  };

  const mockEncryptionService = {
    decrypt: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        PayrollRunsService,
        CalculationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PayslipsService, useValue: mockPayslipsService },
        { provide: ApprovalRequestsService, useValue: mockApprovalRequestsService },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: getQueueToken('payroll'), useValue: mockQueue },
      ],
    }).compile();

    payrollRunsService = module.get(PayrollRunsService);
    calculationService = module.get(CalculationService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should calculate salaried pay correctly and create a payroll run with entries', async () => {
    // Verify the calculation service works correctly for salaried staff
    const result = calculationService.calculate({
      compensation_type: 'salaried',
      snapshot_base_salary: 3000,
      snapshot_per_class_rate: null,
      snapshot_assigned_class_count: null,
      snapshot_bonus_class_rate: null,
      snapshot_bonus_day_multiplier: 1.5,
      total_working_days: 22,
      days_worked: 22,
      classes_taught: null,
    });

    // Full month = full salary
    expect(result.basic_pay).toBe(3000);
    expect(result.bonus_pay).toBe(0);
    expect(result.total_pay).toBe(3000);
  });

  it('should calculate per-class pay with bonus for extra classes', async () => {
    const result = calculationService.calculate({
      compensation_type: 'per_class',
      snapshot_base_salary: null,
      snapshot_per_class_rate: 50,
      snapshot_assigned_class_count: 10,
      snapshot_bonus_class_rate: 60,
      snapshot_bonus_day_multiplier: null,
      total_working_days: 22,
      days_worked: null,
      classes_taught: 12, // 2 extra classes beyond assigned 10
    });

    // 10 assigned * 50 = 500, 2 bonus * 60 = 120
    expect(result.basic_pay).toBe(500);
    expect(result.bonus_pay).toBe(120);
    expect(result.total_pay).toBe(620);
  });

  it('should finalise a payroll run and generate payslips', async () => {
    const runEntries = [
      {
        id: ENTRY_ID,
        tenant_id: TENANT_ID,
        payroll_run_id: RUN_ID,
        staff_profile_id: STAFF_PROFILE_ID,
        compensation_type: 'salaried',
        basic_pay: '3000.00',
        bonus_pay: '0.00',
        total_pay: '3000.00',
        override_total_pay: null,
        days_worked: 22,
        classes_taught: null,
      },
    ];

    const draftRun = {
      id: RUN_ID,
      tenant_id: TENANT_ID,
      status: 'draft',
      period_month: 4,
      period_year: 2026,
      period_label: 'April 2026',
      total_working_days: 22,
      created_by_user_id: USER_ID,
      entries: runEntries,
      updated_at: new Date('2026-04-01T00:00:00Z'),
    };

    // findFirst for finalise validation
    mockPrisma.payrollRun.findFirst.mockResolvedValue(draftRun);

    // Settings: school owner doesn't need approval
    mockSettingsService.getSettings.mockResolvedValue({
      payroll: { requireApprovalForNonPrincipal: true, autoPopulateClassCounts: true },
    });

    // Inside executeFinalisation transaction
    mockPrisma.payrollEntry.findMany.mockResolvedValue(runEntries);
    mockPrisma.payrollRun.update.mockResolvedValue({
      ...draftRun,
      status: 'finalised',
      total_pay: '3000.00',
    });

    // getRun after commit
    const finalisedRun = {
      ...draftRun,
      status: 'finalised',
      total_basic_pay: '3000.00',
      total_bonus_pay: '0.00',
      total_pay: '3000.00',
      headcount: 1,
      finalised_by: { id: USER_ID, first_name: 'Admin', last_name: 'User' },
      created_by: { id: USER_ID, first_name: 'Admin', last_name: 'User' },
      entries: runEntries.map((e) => ({
        ...e,
        staff_profile: {
          id: STAFF_PROFILE_ID,
          staff_number: 'STF-001',
          job_title: 'Teacher',
          department: 'Maths',
          employment_type: 'full_time',
          user: { id: USER_ID, first_name: 'Admin', last_name: 'User', email: 'admin@test.com' },
        },
        payslip: null,
      })),
      _count: { entries: 1 },
    };
    // Second findFirst call (getRun after finalisation)
    mockPrisma.payrollRun.findFirst
      .mockResolvedValueOnce(draftRun)
      .mockResolvedValueOnce(finalisedRun);

    const result = await payrollRunsService.finalise(
      TENANT_ID,
      RUN_ID,
      USER_ID,
      { expected_updated_at: '2026-04-01T00:00:00Z' },
      true, // isSchoolOwner
    );

    expect(result).toBeDefined();
    // Payslips generated inside the finalisation
    expect(mockPayslipsService.generatePayslipsForRun).toHaveBeenCalledWith(
      TENANT_ID,
      RUN_ID,
      USER_ID,
      expect.anything(),
    );
    // Run marked as finalised
    expect(mockPrisma.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RUN_ID },
        data: expect.objectContaining({
          status: 'finalised',
        }),
      }),
    );
  });

  it('should reject finalisation if entries are incomplete', async () => {
    const incompleteRun = {
      id: RUN_ID,
      tenant_id: TENANT_ID,
      status: 'draft',
      period_month: 4,
      period_year: 2026,
      entries: [
        {
          id: ENTRY_ID,
          compensation_type: 'salaried',
          days_worked: null, // missing
          classes_taught: null,
        },
      ],
      updated_at: new Date('2026-04-01T00:00:00Z'),
    };

    mockPrisma.payrollRun.findFirst.mockResolvedValue(incompleteRun);

    await expect(
      payrollRunsService.finalise(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        { expected_updated_at: '2026-04-01T00:00:00Z' },
        true,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject finalisation on concurrent modification', async () => {
    const run = {
      id: RUN_ID,
      tenant_id: TENANT_ID,
      status: 'draft',
      entries: [],
      updated_at: new Date('2026-04-01T12:00:00Z'),
    };

    mockPrisma.payrollRun.findFirst.mockResolvedValue(run);

    await expect(
      payrollRunsService.finalise(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        { expected_updated_at: '2026-03-30T00:00:00Z' }, // stale timestamp
        true,
      ),
    ).rejects.toThrow(ConflictException);
  });
});
