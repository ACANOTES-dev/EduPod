import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { LeaveTypesService } from './leave-types.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = 'user-1';
const STAFF_ID = '22222222-2222-2222-2222-222222222222';
const SYSTEM_LT_ID = 'sys-annual';
const TENANT_LT_ID = 'tenant-annual';
const OTHER_LT_ID = 'sys-sick';

const mockTx = {
  leaveType: {
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('LeaveTypesService', () => {
  let service: LeaveTypesService;
  let module: TestingModule;
  let mockPrisma: {
    leaveType: { findFirst: jest.Mock; findMany: jest.Mock };
    leaveRequest: { findMany: jest.Mock };
    teacherAbsence: { findMany: jest.Mock };
    staffProfile: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      leaveType: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      teacherAbsence: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      staffProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    mockTx.leaveType.create.mockResolvedValue({
      id: TENANT_LT_ID,
      tenant_id: TENANT_ID,
      code: 'annual',
      label: 'Annual Leave',
      requires_approval: true,
      is_paid_default: true,
      max_days_per_request: 14,
      requires_evidence: false,
      display_order: 10,
      is_active: true,
    });
    mockTx.leaveType.update.mockResolvedValue({
      id: TENANT_LT_ID,
      tenant_id: TENANT_ID,
      code: 'annual',
      label: 'Annual Leave (updated)',
      requires_approval: true,
      is_paid_default: true,
      max_days_per_request: 10,
      requires_evidence: false,
      display_order: 10,
      is_active: true,
    });

    module = await Test.createTestingModule({
      providers: [
        LeaveTypesService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            findByUserId: jest.fn().mockResolvedValue({
              id: STAFF_ID,
              user: { first_name: 'Alex', last_name: 'Staff' },
            }),
          },
        },
        {
          provide: AcademicReadFacade,
          useValue: {
            findCurrentYear: jest.fn().mockResolvedValue({
              id: 'year-1',
              name: '2025/26',
              start_date: new Date('2025-09-01'),
              end_date: new Date('2026-08-31'),
              status: 'active',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LeaveTypesService>(LeaveTypesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listAdmin ─────────────────────────────────────────────────────────────

  describe('listAdmin', () => {
    it('flags system rows overridden by a tenant row with the same code', async () => {
      mockPrisma.leaveType.findMany.mockResolvedValue([
        {
          id: SYSTEM_LT_ID,
          tenant_id: null,
          code: 'annual',
          label: 'Annual Leave',
          requires_approval: true,
          is_paid_default: true,
          max_days_per_request: null,
          requires_evidence: false,
          display_order: 10,
          is_active: true,
        },
        {
          id: TENANT_LT_ID,
          tenant_id: TENANT_ID,
          code: 'annual',
          label: 'Annual (custom)',
          requires_approval: true,
          is_paid_default: true,
          max_days_per_request: 14,
          requires_evidence: false,
          display_order: 10,
          is_active: true,
        },
        {
          id: OTHER_LT_ID,
          tenant_id: null,
          code: 'sick',
          label: 'Sick Leave',
          requires_approval: false,
          is_paid_default: true,
          max_days_per_request: null,
          requires_evidence: false,
          display_order: 20,
          is_active: true,
        },
      ]);

      const result = await service.listAdmin(TENANT_ID);

      expect(result.data).toHaveLength(3);
      const sysAnnual = result.data.find((r) => r.id === SYSTEM_LT_ID);
      expect(sysAnnual?.is_system).toBe(true);
      expect(sysAnnual?.is_overridden).toBe(true);

      const tenantAnnual = result.data.find((r) => r.id === TENANT_LT_ID);
      expect(tenantAnnual?.is_system).toBe(false);

      const sysSick = result.data.find((r) => r.id === OTHER_LT_ID);
      expect(sysSick?.is_system).toBe(true);
      expect(sysSick?.is_overridden).toBe(false);
    });
  });

  // ─── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a tenant leave type', async () => {
      const dto = {
        code: 'annual',
        label: 'Annual Leave',
        requires_approval: true,
        is_paid_default: true,
        max_days_per_request: 14,
        requires_evidence: false,
        display_order: 10,
      };
      const result = await service.create(TENANT_ID, dto);
      expect(mockTx.leaveType.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            code: 'annual',
            is_active: true,
          }),
        }),
      );
      expect(result.id).toBe(TENANT_LT_ID);
      expect(result.is_system).toBe(false);
    });

    it('rejects duplicate tenant code', async () => {
      mockPrisma.leaveType.findFirst.mockResolvedValueOnce({
        id: TENANT_LT_ID,
        tenant_id: TENANT_ID,
        code: 'annual',
      });
      await expect(
        service.create(TENANT_ID, {
          code: 'annual',
          label: 'Annual',
          requires_approval: true,
          is_paid_default: true,
          requires_evidence: false,
          display_order: 10,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates an existing tenant row', async () => {
      mockPrisma.leaveType.findFirst.mockResolvedValueOnce({
        id: TENANT_LT_ID,
        tenant_id: TENANT_ID,
        code: 'annual',
      });
      const result = await service.update(TENANT_ID, TENANT_LT_ID, {
        label: 'Annual Leave (updated)',
      });
      expect(mockTx.leaveType.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TENANT_LT_ID },
          data: expect.objectContaining({ label: 'Annual Leave (updated)' }),
        }),
      );
      expect(result.id).toBe(TENANT_LT_ID);
    });

    it('blocks updates to system leave types with a descriptive error', async () => {
      mockPrisma.leaveType.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: SYSTEM_LT_ID,
        tenant_id: null,
        code: 'annual',
      });
      await expect(service.update(TENANT_ID, SYSTEM_LT_ID, { label: 'hacked' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws 404 when neither tenant nor system row exists', async () => {
      mockPrisma.leaveType.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      await expect(service.update(TENANT_ID, 'missing', { label: 'x' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── archive ───────────────────────────────────────────────────────────────

  describe('archive', () => {
    it('soft-deletes a tenant row by toggling is_active=false', async () => {
      mockPrisma.leaveType.findFirst.mockResolvedValueOnce({
        id: TENANT_LT_ID,
        tenant_id: TENANT_ID,
      });
      const result = await service.archive(TENANT_ID, TENANT_LT_ID);
      expect(mockTx.leaveType.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { is_active: false } }),
      );
      expect(result).toEqual({ id: TENANT_LT_ID, is_active: false });
    });

    it('refuses to archive system rows', async () => {
      mockPrisma.leaveType.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: SYSTEM_LT_ID,
        tenant_id: null,
      });
      await expect(service.archive(TENANT_ID, SYSTEM_LT_ID)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── getBalanceForUser ─────────────────────────────────────────────────────

  describe('getBalanceForUser', () => {
    it('aggregates approved days and pending days per leave type', async () => {
      mockPrisma.teacherAbsence.findMany.mockResolvedValue([
        {
          id: 'abs-1',
          staff_profile_id: STAFF_ID,
          leave_type_id: SYSTEM_LT_ID,
          days_counted: 3,
          absence_type: 'approved_leave',
          absence_date: new Date('2025-10-10'),
          date_to: new Date('2025-10-12'),
          cancelled_at: null,
          leave_type: {
            id: SYSTEM_LT_ID,
            code: 'annual',
            label: 'Annual Leave',
            is_paid_default: true,
          },
        },
      ]);
      mockPrisma.leaveRequest.findMany.mockResolvedValue([
        {
          id: 'req-1',
          staff_profile_id: STAFF_ID,
          leave_type_id: SYSTEM_LT_ID,
          status: 'pending',
          date_from: new Date('2025-12-01'),
          date_to: new Date('2025-12-05'),
          full_day: true,
          leave_type: {
            id: SYSTEM_LT_ID,
            code: 'annual',
            label: 'Annual Leave',
            is_paid_default: true,
          },
        },
      ]);

      const res = await service.getBalanceForUser(TENANT_ID, USER_ID);

      expect(res.staff_profile_id).toBe(STAFF_ID);
      expect(res.staff_name).toBe('Alex Staff');
      expect(res.academic_year).toEqual(expect.objectContaining({ name: '2025/26' }));
      expect(res.totals.total_days_taken).toBe(3);
      expect(res.totals.total_days_pending).toBe(5);
      expect(res.totals.pending_count).toBe(1);
      expect(res.per_type).toHaveLength(1);
      const annual = res.per_type[0]!;
      expect(annual.days_taken).toBe(3);
      expect(annual.days_pending).toBe(5);
      expect(annual.approved_requests).toBe(1);
      expect(annual.pending_requests).toBe(1);
    });

    it('returns empty balance when the user has no staff profile', async () => {
      const facade = module.get(StaffProfileReadFacade);
      (facade.findByUserId as jest.Mock).mockResolvedValue(null);
      const res = await service.getBalanceForUser(TENANT_ID, USER_ID);
      expect(res.staff_profile_id).toBeNull();
      expect(res.per_type).toHaveLength(0);
      expect(res.totals.total_days_taken).toBe(0);
    });
  });
});
