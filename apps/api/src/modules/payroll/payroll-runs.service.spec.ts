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

  // ─── listRuns ─────────────────────────────────────────────────────────────────

  describe('listRuns', () => {
    const basePaginatedRun = {
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
      _count: { entries: 1 },
    };

    it('should return paginated runs with meta', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([basePaginatedRun]);
      mockPrisma.payrollRun.count.mockResolvedValue(1);

      const result = await service.listRuns(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should exclude cancelled runs by default', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([]);
      mockPrisma.payrollRun.count.mockResolvedValue(0);

      await service.listRuns(TENANT_ID, { page: 1, pageSize: 20 });

      expect(mockPrisma.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: { not: 'cancelled' },
          }),
        }),
      );
    });

    it('should filter by explicit status when provided', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([]);
      mockPrisma.payrollRun.count.mockResolvedValue(0);

      await service.listRuns(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'finalised',
      });

      expect(mockPrisma.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'finalised',
          }),
        }),
      );
    });

    it('should apply custom sort and order', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([]);
      mockPrisma.payrollRun.count.mockResolvedValue(0);

      await service.listRuns(TENANT_ID, {
        page: 1,
        pageSize: 10,
        sort: 'period_year',
        order: 'asc',
      });

      expect(mockPrisma.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { period_year: 'asc' },
        }),
      );
    });

    it('should default to created_at desc when sort is invalid', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([]);
      mockPrisma.payrollRun.count.mockResolvedValue(0);

      await service.listRuns(TENANT_ID, {
        page: 1,
        pageSize: 10,
        sort: 'invalid_field',
      });

      expect(mockPrisma.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { created_at: 'desc' },
        }),
      );
    });

    it('should apply skip correctly for page 2', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([]);
      mockPrisma.payrollRun.count.mockResolvedValue(25);

      await service.listRuns(TENANT_ID, { page: 2, pageSize: 10 });

      expect(mockPrisma.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });

    it('should filter by period_year when provided', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([]);
      mockPrisma.payrollRun.count.mockResolvedValue(0);

      await service.listRuns(TENANT_ID, {
        page: 1,
        pageSize: 20,
        period_year: 2026,
      });

      expect(mockPrisma.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            period_year: 2026,
          }),
        }),
      );
    });

    it('should serialize decimal fields in returned runs', async () => {
      const runWithDecimals = {
        ...basePaginatedRun,
        status: 'finalised',
        total_basic_pay: { toNumber: () => 5000.5 },
        total_bonus_pay: { toNumber: () => 200.25 },
        total_pay: { toNumber: () => 5200.75 },
      };
      mockPrisma.payrollRun.findMany.mockResolvedValue([runWithDecimals]);
      mockPrisma.payrollRun.count.mockResolvedValue(1);

      const result = await service.listRuns(TENANT_ID, { page: 1, pageSize: 20 });

      // serializeRun converts decimal-like values via Number()
      const firstRun = result.data[0]!;
      expect(typeof firstRun.total_basic_pay).toBe('number');
      expect(typeof firstRun.total_bonus_pay).toBe('number');
      expect(typeof firstRun.total_pay).toBe('number');
    });
  });

  // ─── listEntries ──────────────────────────────────────────────────────────────

  describe('listEntries', () => {
    it('should return entries with serialized numeric fields', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          payroll_run_id: RUN_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'salaried',
          basic_pay: 5000,
          bonus_pay: 100,
          total_pay: 5100,
          override_total_pay: null,
          snapshot_base_salary: 5000,
          snapshot_per_class_rate: null,
          days_worked: 22,
          classes_taught: null,
          created_at: new Date('2026-03-01'),
          staff_profile: {
            id: STAFF_PROFILE_ID,
            staff_number: 'STF-001',
            user: { first_name: 'Jane', last_name: 'Doe' },
          },
        },
      ]);

      const result = await service.listEntries(TENANT_ID, RUN_ID);

      expect(result.data).toHaveLength(1);
      const firstEntry = result.data[0]!;
      expect(firstEntry.staff_name).toBe('Jane Doe');
      expect(firstEntry.basic_pay).toBe(5000);
      expect(firstEntry.bonus_pay).toBe(100);
      expect(firstEntry.total_pay).toBe(5100);
      expect(firstEntry.override_total_pay).toBeNull();
      expect(firstEntry.snapshot_base_salary).toBe(5000);
      expect(firstEntry.snapshot_per_class_rate).toBeNull();
    });

    it('should serialize override_total_pay when present', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-2',
          payroll_run_id: RUN_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'salaried',
          basic_pay: 5000,
          bonus_pay: 0,
          total_pay: 5000,
          override_total_pay: 4500,
          snapshot_base_salary: 5000,
          snapshot_per_class_rate: null,
          days_worked: 20,
          classes_taught: null,
          created_at: new Date('2026-03-01'),
          staff_profile: {
            id: STAFF_PROFILE_ID,
            staff_number: 'STF-001',
            user: { first_name: 'John', last_name: 'Smith' },
          },
        },
      ]);

      const result = await service.listEntries(TENANT_ID, RUN_ID);

      expect(result.data[0]!.override_total_pay).toBe(4500);
    });
  });

  // ─── getRun ───────────────────────────────────────────────────────────────────

  describe('getRun', () => {
    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(null);

      await expect(service.getRun(TENANT_ID, 'nonexistent-id')).rejects.toThrow(NotFoundException);
      await expect(service.getRun(TENANT_ID, 'nonexistent-id')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'PAYROLL_RUN_NOT_FOUND' }),
      });
    });

    it('should return a fully serialized run with entries', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        tenant_id: TENANT_ID,
        period_label: 'March 2026',
        period_month: 3,
        period_year: 2026,
        total_working_days: 22,
        status: 'finalised',
        total_basic_pay: 5000,
        total_bonus_pay: 200,
        total_pay: 5200,
        created_by: { id: USER_ID, first_name: 'Admin', last_name: 'User' },
        finalised_by: { id: USER_ID, first_name: 'Admin', last_name: 'User' },
        entries: [
          {
            id: 'entry-1',
            staff_profile_id: STAFF_PROFILE_ID,
            compensation_type: 'salaried',
            snapshot_base_salary: 5000,
            snapshot_per_class_rate: null,
            snapshot_bonus_class_rate: null,
            snapshot_bonus_day_multiplier: 1.0,
            basic_pay: 5000,
            bonus_pay: 200,
            total_pay: 5200,
            override_total_pay: null,
            staff_profile: {
              id: STAFF_PROFILE_ID,
              staff_number: 'STF-001',
              job_title: 'Teacher',
              department: 'Math',
              employment_type: 'full_time',
              user: {
                id: USER_ID,
                first_name: 'Jane',
                last_name: 'Doe',
                email: 'jane@school.com',
              },
            },
            payslip: { id: 'ps-1', payslip_number: 'PS-202603-001' },
          },
        ],
        _count: { entries: 1 },
      });

      const result = await service.getRun(TENANT_ID, RUN_ID);

      expect(result).toHaveProperty('id', RUN_ID);
      expect(result).toHaveProperty('status', 'finalised');
      // Decimal fields should be numbers
      expect(result.total_basic_pay).toBe(5000);
      expect(result.total_bonus_pay).toBe(200);
      expect(result.total_pay).toBe(5200);
      // Entries should also have serialized decimal fields
      const entries = result.entries as Array<Record<string, unknown>>;
      expect(entries).toHaveLength(1);
      expect(entries[0]!.basic_pay).toBe(5000);
      expect(entries[0]!.snapshot_base_salary).toBe(5000);
    });
  });

  // ─── updateRun ────────────────────────────────────────────────────────────────

  describe('updateRun', () => {
    const now = new Date('2026-03-15T10:00:00.000Z');

    const draftRun = {
      id: RUN_ID,
      tenant_id: TENANT_ID,
      period_label: 'March 2026',
      period_month: 3,
      period_year: 2026,
      total_working_days: 22,
      status: 'draft',
      updated_at: now,
    };

    it('should update period_label on a draft run', async () => {
      // findFirst for existence check
      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(draftRun)
        // getRun call after update
        .mockResolvedValueOnce({
          ...draftRun,
          period_label: 'Mar 2026 Updated',
          entries: [],
          created_by: null,
          finalised_by: null,
          _count: { entries: 0 },
        });

      mockPrisma.payrollRun.update.mockResolvedValue({
        ...draftRun,
        period_label: 'Mar 2026 Updated',
      });

      const result = await service.updateRun(TENANT_ID, RUN_ID, {
        period_label: 'Mar 2026 Updated',
        expected_updated_at: now.toISOString(),
      });

      expect(mockPrisma.payrollRun.update).toHaveBeenCalledWith({
        where: { id: RUN_ID },
        data: expect.objectContaining({ period_label: 'Mar 2026 Updated' }),
      });
      expect(result).toHaveProperty('id', RUN_ID);
    });

    it('should recalculate salaried entries when total_working_days changes', async () => {
      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(draftRun)
        // getRun call after update
        .mockResolvedValueOnce({
          ...draftRun,
          total_working_days: 20,
          entries: [],
          created_by: null,
          finalised_by: null,
          _count: { entries: 0 },
        });

      mockPrisma.payrollRun.update.mockResolvedValue({
        ...draftRun,
        total_working_days: 20,
      });

      // Salaried entries that need recalculation
      const salariedEntry = {
        id: 'entry-1',
        payroll_run_id: RUN_ID,
        tenant_id: TENANT_ID,
        staff_profile_id: STAFF_PROFILE_ID,
        compensation_type: 'salaried',
        snapshot_base_salary: 5000,
        snapshot_per_class_rate: null,
        snapshot_bonus_day_multiplier: 1.0,
        days_worked: 22,
        classes_taught: null,
      };
      mockPrisma.payrollEntry.findMany.mockResolvedValue([salariedEntry]);

      mockCalculationService.calculate.mockReturnValue({
        basic_pay: 4545.45,
        bonus_pay: 0,
        total_pay: 4545.45,
      });

      mockPrisma.payrollEntry.update.mockResolvedValue({ id: 'entry-1' });

      await service.updateRun(TENANT_ID, RUN_ID, {
        total_working_days: 20,
        expected_updated_at: now.toISOString(),
      });

      // Should fetch salaried entries
      expect(mockPrisma.payrollEntry.findMany).toHaveBeenCalledWith({
        where: {
          payroll_run_id: RUN_ID,
          tenant_id: TENANT_ID,
          compensation_type: 'salaried',
        },
      });

      // Should recalculate with new total_working_days
      expect(mockCalculationService.calculate).toHaveBeenCalledWith(
        expect.objectContaining({
          compensation_type: 'salaried',
          total_working_days: 20,
          snapshot_base_salary: 5000,
        }),
      );

      // Should update the entry with recalculated values
      expect(mockPrisma.payrollEntry.update).toHaveBeenCalledWith({
        where: { id: 'entry-1' },
        data: {
          basic_pay: 4545.45,
          bonus_pay: 0,
          total_pay: 4545.45,
        },
      });
    });

    it('should NOT recalculate entries when total_working_days is unchanged', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValueOnce(draftRun).mockResolvedValueOnce({
        ...draftRun,
        entries: [],
        created_by: null,
        finalised_by: null,
        _count: { entries: 0 },
      });

      mockPrisma.payrollRun.update.mockResolvedValue(draftRun);

      await service.updateRun(TENANT_ID, RUN_ID, {
        total_working_days: 22, // same as existing
        expected_updated_at: now.toISOString(),
      });

      // Should NOT fetch salaried entries for recalculation
      expect(mockPrisma.payrollEntry.findMany).not.toHaveBeenCalled();
      expect(mockCalculationService.calculate).not.toHaveBeenCalled();
    });

    it('should reject update of a non-draft run', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        ...draftRun,
        status: 'finalised',
      });

      await expect(
        service.updateRun(TENANT_ID, RUN_ID, {
          period_label: 'New Label',
          expected_updated_at: now.toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateRun(TENANT_ID, RUN_ID, {
          period_label: 'New Label',
          expected_updated_at: now.toISOString(),
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'RUN_NOT_DRAFT' }),
      });
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(null);

      await expect(
        service.updateRun(TENANT_ID, RUN_ID, {
          period_label: 'Test',
          expected_updated_at: now.toISOString(),
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw CONCURRENT_MODIFICATION when expected_updated_at does not match', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(draftRun);

      const staleTimestamp = new Date('2026-03-14T08:00:00.000Z').toISOString();

      await expect(
        service.updateRun(TENANT_ID, RUN_ID, {
          period_label: 'Test',
          expected_updated_at: staleTimestamp,
        }),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.updateRun(TENANT_ID, RUN_ID, {
          period_label: 'Test',
          expected_updated_at: staleTimestamp,
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CONCURRENT_MODIFICATION' }),
      });
    });
  });

  // ─── refreshEntries ───────────────────────────────────────────────────────────

  describe('refreshEntries', () => {
    const draftRun = {
      id: RUN_ID,
      tenant_id: TENANT_ID,
      period_label: 'March 2026',
      period_month: 3,
      period_year: 2026,
      total_working_days: 22,
      status: 'draft',
    };

    it('should refresh existing entries with new snapshot values', async () => {
      // findFirst for the initial check (uses direct prisma, not tx)
      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(draftRun)
        // getRun call at the end of the transaction
        .mockResolvedValueOnce({
          ...draftRun,
          entries: [],
          created_by: null,
          finalised_by: null,
          _count: { entries: 0 },
        });

      // Inside the RLS transaction — compensation data
      mockPrisma.staffCompensation.findMany.mockResolvedValue([
        {
          id: 'comp-1',
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'salaried',
          base_salary: 5500, // updated from 5000
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

      // Existing entries in the run
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          payroll_run_id: RUN_ID,
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'salaried',
          snapshot_base_salary: 5000,
          days_worked: 22,
          classes_taught: null,
        },
      ]);

      // Settings
      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { autoPopulateClassCounts: false },
      });

      // Calculation result with new salary
      mockCalculationService.calculate.mockReturnValue({
        basic_pay: 5500,
        bonus_pay: 0,
        total_pay: 5500,
      });

      mockPrisma.payrollEntry.update.mockResolvedValue({ id: 'entry-1' });

      await service.refreshEntries(TENANT_ID, RUN_ID);

      // Verify the entry was updated with new snapshot values
      expect(mockPrisma.payrollEntry.update).toHaveBeenCalledWith({
        where: { id: 'entry-1' },
        data: expect.objectContaining({
          snapshot_base_salary: 5500,
          basic_pay: 5500,
          total_pay: 5500,
        }),
      });
    });

    it('should add new staff members who were not in existing entries', async () => {
      const newStaffId = '55555555-5555-5555-5555-555555555555';

      mockPrisma.payrollRun.findFirst.mockResolvedValueOnce(draftRun).mockResolvedValueOnce({
        ...draftRun,
        entries: [],
        created_by: null,
        finalised_by: null,
        _count: { entries: 0 },
      });

      // Two compensations — one existing, one new
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
          bonus_day_multiplier: null,
          staff_profile: {
            id: STAFF_PROFILE_ID,
            employment_status: 'active',
          },
        },
        {
          id: 'comp-2',
          tenant_id: TENANT_ID,
          staff_profile_id: newStaffId,
          compensation_type: 'per_class',
          base_salary: null,
          per_class_rate: 200,
          assigned_class_count: 10,
          bonus_class_rate: null,
          bonus_day_multiplier: null,
          staff_profile: {
            id: newStaffId,
            employment_status: 'active',
          },
        },
      ]);

      // Only one existing entry (for STAFF_PROFILE_ID)
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          payroll_run_id: RUN_ID,
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'salaried',
          snapshot_base_salary: 5000,
          days_worked: 22,
          classes_taught: null,
        },
      ]);

      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { autoPopulateClassCounts: false },
      });

      mockCalculationService.calculate.mockReturnValue({
        basic_pay: 5000,
        bonus_pay: 0,
        total_pay: 5000,
      });

      mockPrisma.payrollEntry.update.mockResolvedValue({ id: 'entry-1' });
      mockPrisma.payrollEntry.create.mockResolvedValue({ id: 'entry-2' });

      await service.refreshEntries(TENANT_ID, RUN_ID);

      // Should update the existing entry
      expect(mockPrisma.payrollEntry.update).toHaveBeenCalledTimes(1);

      // Should create a new entry for the new staff member
      expect(mockPrisma.payrollEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          payroll_run_id: RUN_ID,
          staff_profile_id: newStaffId,
          compensation_type: 'per_class',
          snapshot_per_class_rate: 200,
        }),
      });
    });

    it('should reject refresh on a non-draft run', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        ...draftRun,
        status: 'finalised',
      });

      await expect(service.refreshEntries(TENANT_ID, RUN_ID)).rejects.toThrow(BadRequestException);
      await expect(service.refreshEntries(TENANT_ID, RUN_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'RUN_NOT_DRAFT' }),
      });
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(null);

      await expect(service.refreshEntries(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── triggerSessionGeneration ─────────────────────────────────────────────────

  describe('triggerSessionGeneration', () => {
    const draftRun = {
      id: RUN_ID,
      tenant_id: TENANT_ID,
      status: 'draft',
    };

    it('should queue a job and set Redis status', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(draftRun);
      mockRedisClient.set.mockResolvedValue('OK');
      mockPayrollQueue.add.mockResolvedValue({ id: 'job-1' });

      const result = await service.triggerSessionGeneration(TENANT_ID, RUN_ID);

      // Should set Redis status
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `payroll:session-gen:${TENANT_ID}:${RUN_ID}`,
        expect.stringContaining('"status":"queued"'),
        'EX',
        3600,
      );

      // Should queue the job via the payroll queue
      expect(mockPayrollQueue.add).toHaveBeenCalledWith(
        'payroll:session-generation',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          run_id: RUN_ID,
        }),
      );

      expect(result).toEqual({ status: 'queued', run_id: RUN_ID });
    });

    it('should reject session generation for non-draft runs', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        ...draftRun,
        status: 'finalised',
      });

      await expect(service.triggerSessionGeneration(TENANT_ID, RUN_ID)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.triggerSessionGeneration(TENANT_ID, RUN_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'RUN_NOT_DRAFT' }),
      });
    });

    it('should throw NotFoundException when run does not exist', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(null);

      await expect(service.triggerSessionGeneration(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getSessionGenerationStatus ───────────────────────────────────────────────

  describe('getSessionGenerationStatus', () => {
    it('should return parsed Redis status when data exists', async () => {
      const statusData = { status: 'completed', started_at: '2026-03-15T10:00:00.000Z' };
      mockRedisClient.get.mockResolvedValue(JSON.stringify(statusData));

      const result = await service.getSessionGenerationStatus(TENANT_ID, RUN_ID);

      expect(mockRedisClient.get).toHaveBeenCalledWith(
        `payroll:session-gen:${TENANT_ID}:${RUN_ID}`,
      );
      expect(result).toEqual(statusData);
    });

    it('should return not_found when no Redis data exists', async () => {
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.getSessionGenerationStatus(TENANT_ID, RUN_ID);

      expect(result).toEqual({ status: 'not_found' });
    });
  });

  // ─── finalise — approval flow ─────────────────────────────────────────────────

  describe('finalise — approval-required flow', () => {
    const now = new Date('2026-03-15T10:00:00.000Z');

    const completeDraftRun = {
      id: RUN_ID,
      tenant_id: TENANT_ID,
      status: 'draft',
      updated_at: now,
      entries: [
        {
          id: 'entry-1',
          compensation_type: 'salaried',
          days_worked: 22,
          classes_taught: null,
        },
      ],
    };

    it('should create approval request and return pending_approval when non-owner needs approval', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(completeDraftRun);

      // Settings: approval required for non-principal
      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { requireApprovalForNonPrincipal: true },
      });

      // Approval service returns not approved
      mockApprovalRequestsService.checkAndCreateIfNeeded.mockResolvedValue({
        approved: false,
        request_id: 'req-1',
      });

      // The RLS transaction will call payrollRun.update to set pending_approval
      mockPrisma.payrollRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'pending_approval',
        approval_request_id: 'req-1',
      });

      const result = await service.finalise(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        { expected_updated_at: now.toISOString() },
        false, // NOT school owner
      );

      expect(result).toEqual({
        status: 'pending_approval',
        approval_request_id: 'req-1',
        message: 'Payroll run requires approval before finalisation',
      });

      // Verify approval request was created
      expect(mockApprovalRequestsService.checkAndCreateIfNeeded).toHaveBeenCalledWith(
        TENANT_ID,
        'payroll_finalise',
        'payroll_run',
        RUN_ID,
        USER_ID,
        false,
        expect.anything(), // the tx (mockTx)
      );

      // Verify run was set to pending_approval
      expect(mockPrisma.payrollRun.update).toHaveBeenCalledWith({
        where: { id: RUN_ID },
        data: {
          status: 'pending_approval',
          approval_request_id: 'req-1',
        },
      });
    });
  });

  describe('finalise — direct finalisation', () => {
    const now = new Date('2026-03-15T10:00:00.000Z');

    const completeDraftRun = {
      id: RUN_ID,
      tenant_id: TENANT_ID,
      status: 'draft',
      updated_at: now,
      entries: [
        {
          id: 'entry-1',
          compensation_type: 'salaried',
          days_worked: 22,
          classes_taught: null,
          basic_pay: 5000,
          bonus_pay: 0,
          total_pay: 5000,
          override_total_pay: null,
        },
      ],
    };

    it('should directly finalise when user IS school owner', async () => {
      // Initial findFirst for validation
      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(completeDraftRun)
        // executeFinalisation's inner findFirst (inside RLS tx)
        .mockResolvedValueOnce({ status: 'draft' })
        // getRun call at the end
        .mockResolvedValueOnce({
          ...completeDraftRun,
          status: 'finalised',
          total_basic_pay: 5000,
          total_bonus_pay: 0,
          total_pay: 5000,
          created_by: null,
          finalised_by: { id: USER_ID, first_name: 'Admin', last_name: 'User' },
          _count: { entries: 1 },
        });

      // Settings: approval required but user is owner, so it should skip
      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { requireApprovalForNonPrincipal: true },
      });

      // Inside executeFinalisation: fetch entries for totals
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          compensation_type: 'salaried',
          basic_pay: 5000,
          bonus_pay: 0,
          total_pay: 5000,
          override_total_pay: null,
        },
      ]);

      mockPrisma.payrollRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'finalised',
      });

      mockPayslipsService.generatePayslipsForRun.mockResolvedValue(undefined);

      const result = await service.finalise(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        { expected_updated_at: now.toISOString() },
        true, // IS school owner
      );

      // Should NOT have called approval service
      expect(mockApprovalRequestsService.checkAndCreateIfNeeded).not.toHaveBeenCalled();

      // Should have finalised the run
      expect(mockPrisma.payrollRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: RUN_ID },
          data: expect.objectContaining({
            status: 'finalised',
            finalised_by_user_id: USER_ID,
          }),
        }),
      );

      // Should have generated payslips
      expect(mockPayslipsService.generatePayslipsForRun).toHaveBeenCalledWith(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        expect.anything(), // the tx
      );

      expect(result).toHaveProperty('status', 'finalised');
    });

    it('should directly finalise when approval is not required', async () => {
      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(completeDraftRun)
        .mockResolvedValueOnce({ status: 'draft' })
        .mockResolvedValueOnce({
          ...completeDraftRun,
          status: 'finalised',
          total_basic_pay: 5000,
          total_bonus_pay: 0,
          total_pay: 5000,
          created_by: null,
          finalised_by: null,
          _count: { entries: 1 },
        });

      // Settings: approval NOT required
      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { requireApprovalForNonPrincipal: false },
      });

      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          compensation_type: 'salaried',
          basic_pay: 5000,
          bonus_pay: 0,
          total_pay: 5000,
          override_total_pay: null,
        },
      ]);

      mockPrisma.payrollRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'finalised',
      });

      mockPayslipsService.generatePayslipsForRun.mockResolvedValue(undefined);

      const result = await service.finalise(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        { expected_updated_at: now.toISOString() },
        false, // NOT school owner, but approval not required
      );

      // Should NOT have called approval service
      expect(mockApprovalRequestsService.checkAndCreateIfNeeded).not.toHaveBeenCalled();

      // Should have finalised
      expect(result).toHaveProperty('status', 'finalised');
    });

    it('should finalise a pending_approval run directly (approval already given)', async () => {
      const pendingRun = {
        ...completeDraftRun,
        status: 'pending_approval',
      };

      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(pendingRun)
        // executeFinalisation inner findFirst
        .mockResolvedValueOnce({ status: 'pending_approval' })
        // getRun call at the end
        .mockResolvedValueOnce({
          ...pendingRun,
          status: 'finalised',
          total_basic_pay: 5000,
          total_bonus_pay: 0,
          total_pay: 5000,
          created_by: null,
          finalised_by: null,
          _count: { entries: 1 },
        });

      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          compensation_type: 'salaried',
          basic_pay: 5000,
          bonus_pay: 0,
          total_pay: 5000,
          override_total_pay: null,
        },
      ]);

      mockPrisma.payrollRun.update.mockResolvedValue({
        id: RUN_ID,
        status: 'finalised',
      });

      mockPayslipsService.generatePayslipsForRun.mockResolvedValue(undefined);

      const result = await service.finalise(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        { expected_updated_at: now.toISOString() },
        false,
      );

      // pending_approval -> finalised should skip the approval check since status is not 'draft'
      expect(mockApprovalRequestsService.checkAndCreateIfNeeded).not.toHaveBeenCalled();
      expect(result).toHaveProperty('status', 'finalised');
    });
  });

  // ─── createRun — per_class with auto-populate ─────────────────────────────────

  describe('createRun — per_class with auto-populate', () => {
    const createDto = {
      period_label: 'March 2026',
      period_month: 3,
      period_year: 2026,
      total_working_days: 22,
    };

    it('should auto-populate class counts for per_class staff when setting is enabled', async () => {
      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(null) // duplicate check
        .mockResolvedValueOnce({
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
          created_by: null,
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

      mockPrisma.staffCompensation.findMany.mockResolvedValue([
        {
          id: 'comp-1',
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'per_class',
          base_salary: null,
          per_class_rate: 200,
          assigned_class_count: 10,
          bonus_class_rate: 50,
          bonus_day_multiplier: null,
          staff_profile: {
            id: STAFF_PROFILE_ID,
            employment_status: 'active',
          },
        },
      ]);

      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { autoPopulateClassCounts: true },
      });

      // Schedule count for auto-populate
      mockPrisma.schedule.count.mockResolvedValue(8);

      mockCalculationService.calculate.mockReturnValue({
        basic_pay: 1600,
        bonus_pay: 0,
        total_pay: 1600,
      });

      mockPrisma.payrollEntry.create.mockResolvedValue({ id: 'entry-1' });

      await service.createRun(TENANT_ID, USER_ID, createDto);

      expect(mockPrisma.schedule.count).toHaveBeenCalled();
      expect(mockCalculationService.calculate).toHaveBeenCalledWith(
        expect.objectContaining({
          compensation_type: 'per_class',
          snapshot_per_class_rate: 200,
          snapshot_assigned_class_count: 10,
          snapshot_bonus_class_rate: 50,
          classes_taught: 8,
          days_worked: null,
        }),
      );

      expect(mockPrisma.payrollEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          compensation_type: 'per_class',
          snapshot_per_class_rate: 200,
          snapshot_bonus_class_rate: 50,
          classes_taught: 8,
          auto_populated_class_count: 8,
          days_worked: null,
        }),
      });
    });

    it('should skip inactive staff during createRun', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'draft',
        entries: [],
        created_by: null,
        finalised_by: null,
        _count: { entries: 0 },
      });

      mockPrisma.payrollRun.create.mockResolvedValue({
        id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'draft',
      });

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
          bonus_day_multiplier: null,
          staff_profile: {
            id: STAFF_PROFILE_ID,
            employment_status: 'inactive', // inactive staff
          },
        },
      ]);

      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { autoPopulateClassCounts: false },
      });

      await service.createRun(TENANT_ID, USER_ID, createDto);

      expect(mockPrisma.payrollEntry.create).not.toHaveBeenCalled();
    });
  });

  // ─── finalise — concurrency conflict ──────────────────────────────────────────

  describe('finalise — concurrency conflict', () => {
    it('should throw CONCURRENT_MODIFICATION when timestamps do not match', async () => {
      const runTime = new Date('2026-03-15T10:00:00.000Z');
      const staleTime = new Date('2026-03-14T08:00:00.000Z');

      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'draft',
        updated_at: runTime,
        entries: [],
      });

      await expect(
        service.finalise(
          TENANT_ID,
          RUN_ID,
          USER_ID,
          { expected_updated_at: staleTime.toISOString() },
          true,
        ),
      ).rejects.toThrow(ConflictException);

      await expect(
        service.finalise(
          TENANT_ID,
          RUN_ID,
          USER_ID,
          { expected_updated_at: staleTime.toISOString() },
          true,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CONCURRENT_MODIFICATION' }),
      });
    });

    it('should throw NotFoundException when run does not exist during finalise', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(null);

      await expect(
        service.finalise(
          TENANT_ID,
          RUN_ID,
          USER_ID,
          { expected_updated_at: new Date().toISOString() },
          true,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── executeFinalisation — additional branches ────────────────────────────────

  describe('executeFinalisation — override_total_pay', () => {
    it('should use override_total_pay in totals when set', async () => {
      mockPrisma.payrollRun.findFirst
        // Inner findFirst for status check
        .mockResolvedValueOnce({ status: 'draft' })
        // getRun call at end
        .mockResolvedValueOnce({
          id: RUN_ID,
          tenant_id: TENANT_ID,
          status: 'finalised',
          total_basic_pay: 5000,
          total_bonus_pay: 200,
          total_pay: 4500,
          created_by: null,
          finalised_by: null,
          entries: [],
          _count: { entries: 1 },
        });

      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          basic_pay: 5000,
          bonus_pay: 200,
          total_pay: 5200,
          override_total_pay: 4500, // override set
        },
      ]);

      mockPrisma.payrollRun.update.mockResolvedValue({ id: RUN_ID });
      mockPayslipsService.generatePayslipsForRun.mockResolvedValue(undefined);

      await service.executeFinalisation(TENANT_ID, RUN_ID, USER_ID);

      expect(mockPrisma.payrollRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            total_pay: 4500,
            total_basic_pay: 5000,
            total_bonus_pay: 200,
          }),
        }),
      );
    });

    it('should throw NotFoundException when run not found inside executeFinalisation', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue(null);

      await expect(service.executeFinalisation(TENANT_ID, RUN_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw INVALID_STATUS_TRANSITION when run status cannot transition to finalised', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({ status: 'cancelled' });

      await expect(service.executeFinalisation(TENANT_ID, RUN_ID, USER_ID)).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.executeFinalisation(TENANT_ID, RUN_ID, USER_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_STATUS_TRANSITION' }),
      });
    });
  });

  // ─── refreshEntries — inactive staff, per_class auto-populate, classes_taught ─

  describe('refreshEntries — additional branches', () => {
    const draftRun = {
      id: RUN_ID,
      tenant_id: TENANT_ID,
      period_label: 'March 2026',
      period_month: 3,
      period_year: 2026,
      total_working_days: 22,
      status: 'draft',
    };

    it('should skip inactive staff during entry update in refresh', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValueOnce(draftRun).mockResolvedValueOnce({
        ...draftRun,
        entries: [],
        created_by: null,
        finalised_by: null,
        _count: { entries: 0 },
      });

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
          bonus_day_multiplier: null,
          staff_profile: {
            id: STAFF_PROFILE_ID,
            employment_status: 'inactive',
          },
        },
      ]);

      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          payroll_run_id: RUN_ID,
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'salaried',
          snapshot_base_salary: 5000,
          days_worked: 22,
          classes_taught: null,
        },
      ]);

      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { autoPopulateClassCounts: false },
      });

      await service.refreshEntries(TENANT_ID, RUN_ID);

      // Should skip the inactive staff — no update, no create
      expect(mockPrisma.payrollEntry.update).not.toHaveBeenCalled();
      expect(mockPrisma.payrollEntry.create).not.toHaveBeenCalled();
    });

    it('should skip existing entries with no matching comp during refresh', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValueOnce(draftRun).mockResolvedValueOnce({
        ...draftRun,
        entries: [],
        created_by: null,
        finalised_by: null,
        _count: { entries: 0 },
      });

      // No compensations match
      mockPrisma.staffCompensation.findMany.mockResolvedValue([]);

      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          payroll_run_id: RUN_ID,
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'salaried',
          snapshot_base_salary: 5000,
          days_worked: 22,
          classes_taught: null,
        },
      ]);

      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { autoPopulateClassCounts: false },
      });

      await service.refreshEntries(TENANT_ID, RUN_ID);

      // No comp found for existing entry — skipped
      expect(mockPrisma.payrollEntry.update).not.toHaveBeenCalled();
      expect(mockPrisma.payrollEntry.create).not.toHaveBeenCalled();
    });

    it('should use existing classes_taught when present during refresh', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValueOnce(draftRun).mockResolvedValueOnce({
        ...draftRun,
        entries: [],
        created_by: null,
        finalised_by: null,
        _count: { entries: 0 },
      });

      mockPrisma.staffCompensation.findMany.mockResolvedValue([
        {
          id: 'comp-1',
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'per_class',
          base_salary: null,
          per_class_rate: 200,
          assigned_class_count: 10,
          bonus_class_rate: null,
          bonus_day_multiplier: null,
          staff_profile: {
            id: STAFF_PROFILE_ID,
            employment_status: 'active',
          },
        },
      ]);

      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          payroll_run_id: RUN_ID,
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'per_class',
          snapshot_per_class_rate: 200,
          days_worked: null,
          classes_taught: 12, // manually set — should be preserved
        },
      ]);

      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { autoPopulateClassCounts: false },
      });

      mockCalculationService.calculate.mockReturnValue({
        basic_pay: 2400,
        bonus_pay: 0,
        total_pay: 2400,
      });

      mockPrisma.payrollEntry.update.mockResolvedValue({ id: 'entry-1' });

      await service.refreshEntries(TENANT_ID, RUN_ID);

      // classes_taught from entry (12) should be preserved, not overwritten
      expect(mockCalculationService.calculate).toHaveBeenCalledWith(
        expect.objectContaining({
          classes_taught: 12,
        }),
      );
    });

    it('should auto-populate class counts for per_class entries during refresh', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValueOnce(draftRun).mockResolvedValueOnce({
        ...draftRun,
        entries: [],
        created_by: null,
        finalised_by: null,
        _count: { entries: 0 },
      });

      mockPrisma.staffCompensation.findMany.mockResolvedValue([
        {
          id: 'comp-1',
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'per_class',
          base_salary: null,
          per_class_rate: 200,
          assigned_class_count: 10,
          bonus_class_rate: null,
          bonus_day_multiplier: null,
          staff_profile: {
            id: STAFF_PROFILE_ID,
            employment_status: 'active',
          },
        },
      ]);

      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          payroll_run_id: RUN_ID,
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'per_class',
          snapshot_per_class_rate: 200,
          days_worked: null,
          classes_taught: null, // not manually set
        },
      ]);

      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { autoPopulateClassCounts: true },
      });

      mockPrisma.schedule.count.mockResolvedValue(7);

      mockCalculationService.calculate.mockReturnValue({
        basic_pay: 1400,
        bonus_pay: 0,
        total_pay: 1400,
      });

      mockPrisma.payrollEntry.update.mockResolvedValue({ id: 'entry-1' });

      await service.refreshEntries(TENANT_ID, RUN_ID);

      expect(mockPrisma.schedule.count).toHaveBeenCalled();
      // auto_populated_class_count should be 7, and classes_taught should be 7 (null fallback)
      expect(mockPrisma.payrollEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            auto_populated_class_count: 7,
            classes_taught: 7,
          }),
        }),
      );
    });

    it('should handle non-null bonus_class_rate and bonus_day_multiplier during refresh', async () => {
      const draftRun2 = {
        id: RUN_ID,
        tenant_id: TENANT_ID,
        period_label: 'March 2026',
        period_month: 3,
        period_year: 2026,
        total_working_days: 22,
        status: 'draft',
      };

      mockPrisma.payrollRun.findFirst.mockResolvedValueOnce(draftRun2).mockResolvedValueOnce({
        ...draftRun2,
        entries: [],
        created_by: null,
        finalised_by: null,
        _count: { entries: 0 },
      });

      mockPrisma.staffCompensation.findMany.mockResolvedValue([
        {
          id: 'comp-bonus',
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'per_class',
          base_salary: null,
          per_class_rate: 200,
          assigned_class_count: 10,
          bonus_class_rate: 50,
          bonus_day_multiplier: 1.5,
          staff_profile: {
            id: STAFF_PROFILE_ID,
            employment_status: 'active',
          },
        },
      ]);

      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-bonus',
          payroll_run_id: RUN_ID,
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'per_class',
          snapshot_per_class_rate: 180,
          days_worked: null,
          classes_taught: 10,
        },
      ]);

      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { autoPopulateClassCounts: false },
      });

      mockCalculationService.calculate.mockReturnValue({
        basic_pay: 2000,
        bonus_pay: 500,
        total_pay: 2500,
      });

      mockPrisma.payrollEntry.update.mockResolvedValue({ id: 'entry-bonus' });

      await service.refreshEntries(TENANT_ID, RUN_ID);

      expect(mockPrisma.payrollEntry.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            snapshot_bonus_class_rate: 50,
            snapshot_bonus_day_multiplier: 1.5,
            snapshot_per_class_rate: 200,
          }),
        }),
      );

      expect(mockCalculationService.calculate).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshot_bonus_class_rate: 50,
          snapshot_bonus_day_multiplier: 1.5,
        }),
      );
    });

    it('should skip inactive staff when adding new entries during refresh', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValueOnce(draftRun).mockResolvedValueOnce({
        ...draftRun,
        entries: [],
        created_by: null,
        finalised_by: null,
        _count: { entries: 0 },
      });

      mockPrisma.staffCompensation.findMany.mockResolvedValue([
        {
          id: 'comp-new',
          tenant_id: TENANT_ID,
          staff_profile_id: '66666666-6666-6666-6666-666666666666',
          compensation_type: 'salaried',
          base_salary: 3000,
          per_class_rate: null,
          assigned_class_count: null,
          bonus_class_rate: null,
          bonus_day_multiplier: null,
          staff_profile: {
            id: '66666666-6666-6666-6666-666666666666',
            employment_status: 'inactive', // inactive — should be skipped
          },
        },
      ]);

      mockPrisma.payrollEntry.findMany.mockResolvedValue([]);

      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { autoPopulateClassCounts: false },
      });

      await service.refreshEntries(TENANT_ID, RUN_ID);

      expect(mockPrisma.payrollEntry.create).not.toHaveBeenCalled();
    });
  });

  // ─── getPayrollSetting — error handling branches ──────────────────────────────

  describe('getPayrollSetting — error handling', () => {
    it('edge: should fallback to default when tenant has no settings (404)', async () => {
      const notFoundError = { status: 404, message: 'Not found' };
      mockSettingsService.getSettings.mockRejectedValue(notFoundError);

      // createRun calls getPayrollSetting internally
      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(null) // duplicate check
        .mockResolvedValueOnce({
          id: RUN_ID,
          tenant_id: TENANT_ID,
          status: 'draft',
          entries: [],
          created_by: null,
          finalised_by: null,
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

      mockPrisma.staffCompensation.findMany.mockResolvedValue([]);

      const result = await service.createRun(TENANT_ID, USER_ID, {
        period_label: 'March 2026',
        period_month: 3,
        period_year: 2026,
        total_working_days: 22,
      });

      // Should succeed — uses default value for autoPopulateClassCounts
      expect(result).toHaveProperty('id', RUN_ID);
    });

    it('edge: should re-throw non-404 errors from settings service', async () => {
      const serverError = new Error('Internal server error');
      mockSettingsService.getSettings.mockRejectedValue(serverError);

      mockPrisma.payrollRun.findFirst.mockResolvedValueOnce(null);

      mockPrisma.payrollRun.create.mockResolvedValue({
        id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'draft',
      });

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
          bonus_day_multiplier: null,
          staff_profile: {
            id: STAFF_PROFILE_ID,
            employment_status: 'active',
          },
        },
      ]);

      await expect(
        service.createRun(TENANT_ID, USER_ID, {
          period_label: 'March 2026',
          period_month: 3,
          period_year: 2026,
          total_working_days: 22,
        }),
      ).rejects.toThrow('Internal server error');
    });
  });

  // ─── finalise — approval approved immediately ─────────────────────────────────

  describe('finalise — approval approved immediately', () => {
    const now = new Date('2026-03-15T10:00:00.000Z');

    it('should proceed to finalise when approval service returns approved=true', async () => {
      const completeDraftRun = {
        id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'draft',
        updated_at: now,
        entries: [
          {
            id: 'entry-1',
            compensation_type: 'salaried',
            days_worked: 22,
            classes_taught: null,
          },
        ],
      };

      mockPrisma.payrollRun.findFirst
        .mockResolvedValueOnce(completeDraftRun)
        // executeFinalisation inner findFirst
        .mockResolvedValueOnce({ status: 'draft' })
        // getRun call at end
        .mockResolvedValueOnce({
          ...completeDraftRun,
          status: 'finalised',
          total_basic_pay: 5000,
          total_bonus_pay: 0,
          total_pay: 5000,
          created_by: null,
          finalised_by: null,
          _count: { entries: 1 },
        });

      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { requireApprovalForNonPrincipal: true },
      });

      // Approval returns approved=true (already approved)
      mockApprovalRequestsService.checkAndCreateIfNeeded.mockResolvedValue({
        approved: true,
        request_id: null,
      });

      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          basic_pay: 5000,
          bonus_pay: 0,
          total_pay: 5000,
          override_total_pay: null,
        },
      ]);

      mockPrisma.payrollRun.update.mockResolvedValue({ id: RUN_ID });
      mockPayslipsService.generatePayslipsForRun.mockResolvedValue(undefined);

      const result = await service.finalise(
        TENANT_ID,
        RUN_ID,
        USER_ID,
        { expected_updated_at: now.toISOString() },
        false, // NOT school owner, but approval returns approved
      );

      expect(result).toHaveProperty('status', 'finalised');
    });
  });

  // ─── refreshEntries — new salaried staff during refresh ────────────────────────

  describe('refreshEntries — new salaried staff', () => {
    it('should add new salaried staff with days_worked=total_working_days during refresh', async () => {
      const draftRun = {
        id: RUN_ID,
        tenant_id: TENANT_ID,
        period_label: 'March 2026',
        period_month: 3,
        period_year: 2026,
        total_working_days: 22,
        status: 'draft',
      };
      const newSalariedStaffId = '88888888-8888-8888-8888-888888888888';

      mockPrisma.payrollRun.findFirst.mockResolvedValueOnce(draftRun).mockResolvedValueOnce({
        ...draftRun,
        entries: [],
        created_by: null,
        finalised_by: null,
        _count: { entries: 0 },
      });

      mockPrisma.staffCompensation.findMany.mockResolvedValue([
        {
          id: 'comp-sal',
          tenant_id: TENANT_ID,
          staff_profile_id: newSalariedStaffId,
          compensation_type: 'salaried',
          base_salary: 6000,
          per_class_rate: null,
          assigned_class_count: null,
          bonus_class_rate: null,
          bonus_day_multiplier: 2.0,
          staff_profile: {
            id: newSalariedStaffId,
            employment_status: 'active',
          },
        },
      ]);

      mockPrisma.payrollEntry.findMany.mockResolvedValue([]);

      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { autoPopulateClassCounts: false },
      });

      mockCalculationService.calculate.mockReturnValue({
        basic_pay: 6000,
        bonus_pay: 0,
        total_pay: 6000,
      });

      mockPrisma.payrollEntry.create.mockResolvedValue({ id: 'entry-sal' });

      await service.refreshEntries(TENANT_ID, RUN_ID);

      expect(mockPrisma.payrollEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          staff_profile_id: newSalariedStaffId,
          compensation_type: 'salaried',
          snapshot_base_salary: 6000,
          snapshot_bonus_day_multiplier: 2.0,
          days_worked: 22, // total_working_days for salaried
        }),
      });
    });
  });

  // ─── refreshEntries — new per_class staff with auto-populate ─────────────────

  describe('refreshEntries — new per_class staff with auto-populate', () => {
    it('should auto-populate class counts for new per_class staff added during refresh', async () => {
      const draftRun = {
        id: RUN_ID,
        tenant_id: TENANT_ID,
        period_label: 'March 2026',
        period_month: 3,
        period_year: 2026,
        total_working_days: 22,
        status: 'draft',
      };
      const newPerClassStaffId = '77777777-7777-7777-7777-777777777777';

      mockPrisma.payrollRun.findFirst.mockResolvedValueOnce(draftRun).mockResolvedValueOnce({
        ...draftRun,
        entries: [],
        created_by: null,
        finalised_by: null,
        _count: { entries: 0 },
      });

      mockPrisma.staffCompensation.findMany.mockResolvedValue([
        {
          id: 'comp-new',
          tenant_id: TENANT_ID,
          staff_profile_id: newPerClassStaffId,
          compensation_type: 'per_class',
          base_salary: null,
          per_class_rate: 150,
          assigned_class_count: 8,
          bonus_class_rate: 30,
          bonus_day_multiplier: null,
          staff_profile: {
            id: newPerClassStaffId,
            employment_status: 'active',
          },
        },
      ]);

      mockPrisma.payrollEntry.findMany.mockResolvedValue([]);

      mockSettingsService.getSettings.mockResolvedValue({
        payroll: { autoPopulateClassCounts: true },
      });

      mockPrisma.schedule.count.mockResolvedValue(5);

      mockCalculationService.calculate.mockReturnValue({
        basic_pay: 750,
        bonus_pay: 150,
        total_pay: 900,
      });

      mockPrisma.payrollEntry.create.mockResolvedValue({ id: 'entry-new' });

      await service.refreshEntries(TENANT_ID, RUN_ID);

      expect(mockPrisma.schedule.count).toHaveBeenCalled();
      expect(mockPrisma.payrollEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          staff_profile_id: newPerClassStaffId,
          compensation_type: 'per_class',
          snapshot_per_class_rate: 150,
          snapshot_bonus_class_rate: 30,
          classes_taught: 5,
          auto_populated_class_count: 5,
        }),
      });
    });
  });

  // ─── serializeRun — null/undefined decimal fields ─────────────────────────────

  describe('serializeRun — null decimal fields', () => {
    it('should not convert null decimal fields to numbers', async () => {
      const runWithNullDecimals = {
        id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'draft',
        total_basic_pay: null,
        total_bonus_pay: null,
        total_pay: null,
        created_by: null,
        finalised_by: null,
        _count: { entries: 0 },
      };

      mockPrisma.payrollRun.findMany.mockResolvedValue([runWithNullDecimals]);
      mockPrisma.payrollRun.count.mockResolvedValue(1);

      const result = await service.listRuns(TENANT_ID, { page: 1, pageSize: 20 });

      const run = result.data[0]!;
      expect(run.total_basic_pay).toBeNull();
      expect(run.total_bonus_pay).toBeNull();
      expect(run.total_pay).toBeNull();
    });
  });

  // ─── listRuns — sort without explicit order ────────────────────────────────

  describe('listRuns — sort defaults', () => {
    it('should default order to desc when sort is valid but order is not provided', async () => {
      mockPrisma.payrollRun.findMany.mockResolvedValue([]);
      mockPrisma.payrollRun.count.mockResolvedValue(0);

      await service.listRuns(TENANT_ID, {
        page: 1,
        pageSize: 10,
        sort: 'total_pay',
        // order is undefined
      });

      expect(mockPrisma.payrollRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { total_pay: 'desc' },
        }),
      );
    });
  });

  // ─── listEntries — non-null snapshot_per_class_rate ──────────��──────────────

  describe('listEntries — non-null snapshot fields', () => {
    it('should serialize non-null snapshot_per_class_rate as number', async () => {
      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-3',
          payroll_run_id: RUN_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'per_class',
          basic_pay: 2000,
          bonus_pay: 0,
          total_pay: 2000,
          override_total_pay: 1800,
          snapshot_base_salary: null,
          snapshot_per_class_rate: 200,
          days_worked: null,
          classes_taught: 10,
          created_at: new Date('2026-03-01'),
          staff_profile: {
            id: STAFF_PROFILE_ID,
            staff_number: 'STF-002',
            user: { first_name: 'Per', last_name: 'Class' },
          },
        },
      ]);

      const result = await service.listEntries(TENANT_ID, RUN_ID);

      const entry = result.data[0]!;
      expect(entry.snapshot_base_salary).toBeNull();
      expect(entry.snapshot_per_class_rate).toBe(200);
      expect(entry.override_total_pay).toBe(1800);
    });
  });

  // ─── updateRun — recalculate with null snapshot values ────────────────────────

  describe('updateRun — null snapshot values', () => {
    it('edge: should handle null snapshot_base_salary and snapshot_bonus_day_multiplier during recalculation', async () => {
      const now = new Date('2026-03-15T10:00:00.000Z');
      const draftRun = {
        id: RUN_ID,
        tenant_id: TENANT_ID,
        total_working_days: 22,
        status: 'draft',
        updated_at: now,
      };

      mockPrisma.payrollRun.findFirst.mockResolvedValueOnce(draftRun).mockResolvedValueOnce({
        ...draftRun,
        entries: [],
        created_by: null,
        finalised_by: null,
        _count: { entries: 0 },
      });

      mockPrisma.payrollRun.update.mockResolvedValue({ ...draftRun, total_working_days: 20 });

      mockPrisma.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-null',
          payroll_run_id: RUN_ID,
          tenant_id: TENANT_ID,
          staff_profile_id: STAFF_PROFILE_ID,
          compensation_type: 'salaried',
          snapshot_base_salary: null,
          snapshot_per_class_rate: null,
          snapshot_bonus_day_multiplier: null,
          days_worked: 22,
          classes_taught: null,
        },
      ]);

      mockCalculationService.calculate.mockReturnValue({
        basic_pay: 0,
        bonus_pay: 0,
        total_pay: 0,
      });

      mockPrisma.payrollEntry.update.mockResolvedValue({ id: 'entry-null' });

      await service.updateRun(TENANT_ID, RUN_ID, {
        total_working_days: 20,
        expected_updated_at: now.toISOString(),
      });

      expect(mockCalculationService.calculate).toHaveBeenCalledWith(
        expect.objectContaining({
          snapshot_base_salary: null,
          snapshot_bonus_day_multiplier: null,
        }),
      );
    });
  });

  // ─── serializeRunFull — entries with null/undefined decimal fields ─────────────

  describe('serializeRunFull — entries with null decimal fields', () => {
    it('should not convert null entry decimal fields to numbers', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'draft',
        total_basic_pay: null,
        total_bonus_pay: null,
        total_pay: null,
        created_by: null,
        finalised_by: null,
        entries: [
          {
            id: 'entry-1',
            snapshot_base_salary: null,
            snapshot_per_class_rate: null,
            snapshot_bonus_class_rate: null,
            snapshot_bonus_day_multiplier: null,
            basic_pay: 5000,
            bonus_pay: 0,
            total_pay: 5000,
            override_total_pay: null,
            staff_profile: {
              id: STAFF_PROFILE_ID,
              staff_number: 'STF-001',
              job_title: 'Teacher',
              department: 'Math',
              employment_type: 'full_time',
              user: { id: USER_ID, first_name: 'Ali', last_name: 'Khan', email: 'a@b.com' },
            },
            payslip: null,
          },
        ],
        _count: { entries: 1 },
      });

      const result = await service.getRun(TENANT_ID, RUN_ID);

      const entries = result.entries as Array<Record<string, unknown>>;
      expect(entries[0]!.snapshot_base_salary).toBeNull();
      expect(entries[0]!.snapshot_per_class_rate).toBeNull();
      expect(entries[0]!.override_total_pay).toBeNull();
      expect(entries[0]!.basic_pay).toBe(5000);
    });

    it('should handle run with no entries array in serializeRunFull', async () => {
      mockPrisma.payrollRun.findFirst.mockResolvedValue({
        id: RUN_ID,
        tenant_id: TENANT_ID,
        status: 'draft',
        total_basic_pay: null,
        total_bonus_pay: null,
        total_pay: null,
        created_by: null,
        finalised_by: null,
        _count: { entries: 0 },
      });

      const result = await service.getRun(TENANT_ID, RUN_ID);

      // entries is undefined — serializeRunFull should not crash
      expect(result).toHaveProperty('id', RUN_ID);
    });
  });
});
