import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { CalculationService } from './calculation.service';
import { PayrollRunsService } from './payroll-runs.service';
import { PayslipsService } from './payslips.service';

// Mock createRlsClient
const mockTx: Record<string, unknown> = {};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(() => ({
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  })),
}));

describe('PayrollRunsService', () => {
  let service: PayrollRunsService;

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';
  const RUN_ID = '33333333-3333-3333-3333-333333333333';
  const STAFF_PROFILE_ID = '44444444-4444-4444-4444-444444444444';

  const mockPrisma = {
    payrollRun: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    payrollEntry: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    staffCompensation: {
      findMany: jest.fn(),
    },
    schedule: {
      count: jest.fn(),
    },
  };

  const mockCalculationService = {
    calculate: jest.fn(),
  };

  const mockPayslipsService = {
    generatePayslipsForRun: jest.fn(),
  };

  const mockApprovalRequestsService = {
    checkAndCreateIfNeeded: jest.fn(),
  };

  const mockRedisClient = {
    set: jest.fn(),
    get: jest.fn(),
  };

  const mockRedisService = {
    getClient: jest.fn(() => mockRedisClient),
  };

  const mockSettingsService = {
    getSettings: jest.fn(),
  };

  const mockPayrollQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Wire mockTx models
    mockTx['payrollRun'] = mockPrisma.payrollRun;
    mockTx['payrollEntry'] = mockPrisma.payrollEntry;
    mockTx['staffCompensation'] = mockPrisma.staffCompensation;
    mockTx['schedule'] = mockPrisma.schedule;

    const module = await Test.createTestingModule({
      providers: [
        PayrollRunsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CalculationService, useValue: mockCalculationService },
        { provide: PayslipsService, useValue: mockPayslipsService },
        { provide: ApprovalRequestsService, useValue: mockApprovalRequestsService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: SettingsService, useValue: mockSettingsService },
        { provide: getQueueToken('payroll'), useValue: mockPayrollQueue },
      ],
    }).compile();

    service = module.get<PayrollRunsService>(PayrollRunsService);
  });

  describe('createRun', () => {
    const createDto = {
      period_label: 'March 2026',
      period_month: 3,
      period_year: 2026,
      total_working_days: 22,
    };

    it('should create a draft run and auto-populate entries', async () => {
      // No duplicate run
      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(null) // duplicate check inside transaction
        .mockResolvedValueOnce({
          // getRun call after create
          id: RUN_ID,
          tenant_id: TENANT_ID,
          period_label: 'March 2026',
          period_month: 3,
          period_year: 2026,
          total_working_days: 22,
          status: 'draft',
          total_basic_pay: null,
          total_bonus_pay: null,
          total_pay: null,
          created_by: { id: USER_ID, first_name: 'Admin', last_name: 'User' },
          finalised_by: null,
          entries: [],
          _count: { entries: 0 },
        });

      mockPrisma.payrollRun.create.mockResolvedValue({
        id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'draft',
        period_month: 3,
        period_year: 2026,
        total_working_days: 22,
      });

      // Active staff compensations
      mockPrisma.staffCompensation.findMany.mockResolvedValue([
        {
          id: 'comp-1',
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'salaried',
          base_salary: 5000,
          per_class_rate: null,
          assigned_class_count: null,
          bonus_class_rate: null,
          bonus_day_multiplier: 1.0,
          staff_profile: {
            id: STAFF_PROFILE_ID,
            employment_status: 'active',
          },
        },
      ]);

      // Settings for auto-populate
      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { autoPopulateClassCounts: true },
      });

      // Calculation result
      mockCalculationService.calculate.mockReturnValue({
        basic_pay: 5000,
        bonus_pay: 0,
        total_pay: 5000,
      });

      mockPrisma.payrollEntry.create.mockResolvedValue({ id: 'entry-1' });

      const result = await service.createRun(TENANT_ID, USER_ID, createDto);

      // Verify run was created with draft status
      expect(mockPrisma.payrollRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          period_month: 3,
          period_year: 2026,
          total_working_days: 22,
          status: 'draft',
          created_by_user_id: USER_ID,
        }),
      });

      // Verify entry was created for the active staff
      expect(mockPrisma.payrollEntry.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.payrollEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          payroll_run_id: RUN_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'salaried',
          snapshot_base_salary: 5000,
          basic_pay: 5000,
          bonus_pay: 0,
          total_pay: 5000,
        }),
      });

      // Verify calculation was called
      expect(mockCalculationService.calculate).toHaveBeenCalledWith(
        expect.objectContaining({
          compensation_type: 'salaried',
          snapshot_base_salary: 5000,
          total_working_days: 22,
          days_worked: 22, // salaried defaults to total_working_days
        }),
      );

      expect(result).toHaveProperty('id', RUN_ID);
    });

    it('should reject duplicate month/year run', async () => {
      // Duplicate exists
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: 'existing-run',
        tenant_id: TENANT_ID,
        period_month: 3,
        period_year: 2026,
        status: 'draft',
      });

      await expect(service.createRun(TENANT_ID, USER_ID, createDto)).rejects.toThrow(
        ConflictException,
      );

      await expect(service.createRun(TENANT_ID, USER_ID, createDto)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'DUPLICATE_PAYROLL_RUN' }),
      });

      expect(mockPrisma.payrollRun.create).not.toHaveBeenCalled();
    });
  });

  describe('finalise', () => {
    it('should block finalisation when entries are incomplete', async () => {
      const now = new Date('2026-03-15T10:00:00.000Z');

      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'draft',
        updated_at: now,
        entries: [
          {
            id: 'entry-1',
            compensation_type: 'salaried',
            days_worked: null, // incomplete — missing days_worked
            classes_taught: null,
          },
        ],
      });

      await expect(
        service.finalise(
          TENANT_ID,
          RUN_ID,
          USER_ID,
          {
            expected_updated_at: now.toISOString(),
          },
          true,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.finalise(
          TENANT_ID,
          RUN_ID,
          USER_ID,
          {
            expected_updated_at: now.toISOString(),
          },
          true,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INCOMPLETE_ENTRIES' }),
      });
    });

    it('should block finalisation when per_class entries lack classes_taught', async () => {
      const now = new Date('2026-03-15T10:00:00.000Z');

      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'draft',
        updated_at: now,
        entries: [
          {
            id: 'entry-1',
            compensation_type: 'per_class',
            days_worked: null,
            classes_taught: null, // incomplete
          },
        ],
      });

      await expect(
        service.finalise(
          TENANT_ID,
          RUN_ID,
          USER_ID,
          {
            expected_updated_at: now.toISOString(),
          },
          true,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject finalisation of non-draft/non-pending_approval run', async () => {
      const now = new Date('2026-03-15T10:00:00.000Z');

      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'finalised',
        updated_at: now,
        entries: [],
      });

      await expect(
        service.finalise(
          TENANT_ID,
          RUN_ID,
          USER_ID,
          {
            expected_updated_at: now.toISOString(),
          },
          true,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.finalise(
          TENANT_ID,
          RUN_ID,
          USER_ID,
          {
            expected_updated_at: now.toISOString(),
          },
          true,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_STATUS_TRANSITION' }),
      });
    });
  });

  describe('cancelRun', () => {
    it('should cancel a draft run', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'draft',
      });

      mockPrisma.payrollRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'cancelled',
      });

      const result = await service.cancelRun(TENANT_ID, RUN_ID);

      expect(mockPrisma.payrollRun.update).toHaveBeenCalledWith({
        where: { id: RUN_ID },
        data: { status: 'cancelled' },
      });
      expect(result).toEqual({ id: RUN_ID, status: 'cancelled' });
    });

    it('should reject cancellation of a finalised run', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'finalised',
      });

      await expect(service.cancelRun(TENANT_ID, RUN_ID)).rejects.toThrow(BadRequestException);

      await expect(service.cancelRun(TENANT_ID, RUN_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_STATUS_TRANSITION' }),
      });
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(null);

      await expect(service.cancelRun(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
