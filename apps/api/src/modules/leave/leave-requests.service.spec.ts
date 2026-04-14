import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { LeaveRequestsService } from './leave-requests.service';
import { LeaveTypesService } from './leave-types.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const STAFF_ID = 'staff-1';
const OTHER_STAFF_ID = 'staff-other';
const LEAVE_TYPE_ID = 'lt-annual';
const REQUEST_ID = 'req-1';

const mockTx = {
  leaveRequest: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  leaveType: {
    findFirst: jest.fn(),
  },
  teacherAbsence: {
    create: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('LeaveRequestsService', () => {
  let service: LeaveRequestsService;
  let module: TestingModule;
  let mockPrisma: {
    leaveRequest: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    leaveType: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      leaveRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      leaveType: {
        findFirst: jest.fn().mockResolvedValue({
          id: LEAVE_TYPE_ID,
          code: 'annual',
          is_paid_default: true,
          max_days_per_request: null,
        }),
      },
    };
    mockTx.leaveRequest.create.mockResolvedValue({
      id: REQUEST_ID,
      created_at: new Date('2026-03-01T10:00:00Z'),
    });
    mockTx.leaveRequest.update.mockResolvedValue({ id: REQUEST_ID });
    mockTx.leaveType.findFirst.mockResolvedValue({
      id: LEAVE_TYPE_ID,
      code: 'annual',
      is_paid_default: true,
    });
    mockTx.teacherAbsence.create.mockResolvedValue({ id: 'abs-1' });

    module = await Test.createTestingModule({
      providers: [
        LeaveRequestsService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            findByUserId: jest.fn().mockResolvedValue({ id: STAFF_ID }),
          },
        },
        {
          provide: LeaveTypesService,
          useValue: {
            findById: jest.fn().mockResolvedValue({
              id: LEAVE_TYPE_ID,
              code: 'annual',
              is_paid_default: true,
              max_days_per_request: null,
            }),
          },
        },
      ],
    }).compile();

    service = module.get<LeaveRequestsService>(LeaveRequestsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── submit ───────────────────────────────────────────────────────────────

  describe('submit', () => {
    it('should create a pending leave request', async () => {
      const result = await service.submit(TENANT_ID, USER_ID, {
        leave_type_id: LEAVE_TYPE_ID,
        date_from: '2026-05-01',
        date_to: '2026-05-03',
        full_day: true,
      });

      expect(result.id).toBe(REQUEST_ID);
      expect(result.status).toBe('pending');
      expect(mockTx.leaveRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            staff_profile_id: STAFF_ID,
            leave_type_id: LEAVE_TYPE_ID,
            status: 'pending',
            submitted_by_user_id: USER_ID,
          }),
        }),
      );
    });

    it('should throw if no staff profile linked to user', async () => {
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findByUserId as jest.Mock).mockResolvedValue(null);

      await expect(
        service.submit(TENANT_ID, USER_ID, {
          leave_type_id: LEAVE_TYPE_ID,
          date_from: '2026-05-01',
          date_to: '2026-05-03',
          full_day: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if leave type not found', async () => {
      const ltService = module.get(LeaveTypesService);
      (ltService.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.submit(TENANT_ID, USER_ID, {
          leave_type_id: LEAVE_TYPE_ID,
          date_from: '2026-05-01',
          date_to: '2026-05-03',
          full_day: true,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject request exceeding max_days_per_request', async () => {
      const ltService = module.get(LeaveTypesService);
      (ltService.findById as jest.Mock).mockResolvedValue({
        id: LEAVE_TYPE_ID,
        code: 'bereavement',
        is_paid_default: true,
        max_days_per_request: 3,
      });

      await expect(
        service.submit(TENANT_ID, USER_ID, {
          leave_type_id: LEAVE_TYPE_ID,
          date_from: '2026-05-01',
          date_to: '2026-05-07', // 7 days > 3
          full_day: true,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── approve ──────────────────────────────────────────────────────────────

  describe('approve', () => {
    it('should create a linked teacher_absence and mark request approved', async () => {
      mockPrisma.leaveRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'pending',
        staff_profile_id: STAFF_ID,
        leave_type_id: LEAVE_TYPE_ID,
        date_from: new Date('2026-05-01'),
        date_to: new Date('2026-05-03'),
        full_day: true,
        period_from: null,
        period_to: null,
        reason: 'Family wedding',
      });

      const result = await service.approve(TENANT_ID, USER_ID, REQUEST_ID, {
        review_notes: 'Approved by HR',
      });

      expect(result.status).toBe('approved');
      expect(result.absence_id).toBe('abs-1');
      expect(mockTx.teacherAbsence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            absence_type: 'approved_leave',
            leave_request_id: REQUEST_ID,
            days_counted: 3,
            is_paid: true,
          }),
        }),
      );
      expect(mockTx.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: REQUEST_ID },
          data: expect.objectContaining({
            status: 'approved',
            reviewed_by_user_id: USER_ID,
          }),
        }),
      );
    });

    it('should store null date_to for single-day leaves', async () => {
      mockPrisma.leaveRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'pending',
        staff_profile_id: STAFF_ID,
        leave_type_id: LEAVE_TYPE_ID,
        date_from: new Date('2026-05-01'),
        date_to: new Date('2026-05-01'),
        full_day: true,
        period_from: null,
        period_to: null,
        reason: null,
      });

      await service.approve(TENANT_ID, USER_ID, REQUEST_ID, {});

      expect(mockTx.teacherAbsence.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            date_to: null,
            days_counted: 1,
          }),
        }),
      );
    });

    it('should reject approval of an already-approved request', async () => {
      mockPrisma.leaveRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'approved',
        staff_profile_id: STAFF_ID,
        leave_type_id: LEAVE_TYPE_ID,
        date_from: new Date('2026-05-01'),
        date_to: new Date('2026-05-03'),
        full_day: true,
      });

      await expect(service.approve(TENANT_ID, USER_ID, REQUEST_ID, {})).rejects.toThrow(
        ConflictException,
      );
    });

    it('should 404 if request does not exist', async () => {
      mockPrisma.leaveRequest.findFirst.mockResolvedValue(null);

      await expect(service.approve(TENANT_ID, USER_ID, REQUEST_ID, {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── reject ───────────────────────────────────────────────────────────────

  describe('reject', () => {
    it('should mark request rejected without creating an absence', async () => {
      mockPrisma.leaveRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'pending',
        staff_profile_id: STAFF_ID,
      });

      const result = await service.reject(TENANT_ID, USER_ID, REQUEST_ID, {
        review_notes: 'School trip week',
      });

      expect(result.status).toBe('rejected');
      expect(mockTx.teacherAbsence.create).not.toHaveBeenCalled();
    });
  });

  // ─── withdraw ─────────────────────────────────────────────────────────────

  describe('withdraw', () => {
    it('should allow a teacher to withdraw their own pending request', async () => {
      mockPrisma.leaveRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'pending',
        staff_profile_id: STAFF_ID,
      });

      const result = await service.withdraw(TENANT_ID, USER_ID, REQUEST_ID);

      expect(result.status).toBe('withdrawn');
    });

    it("should reject withdrawal attempt on someone else's request", async () => {
      mockPrisma.leaveRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'pending',
        staff_profile_id: OTHER_STAFF_ID,
      });

      await expect(service.withdraw(TENANT_ID, USER_ID, REQUEST_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should reject withdrawal of an already-approved request', async () => {
      mockPrisma.leaveRequest.findFirst.mockResolvedValue({
        id: REQUEST_ID,
        status: 'approved',
        staff_profile_id: STAFF_ID,
      });

      await expect(service.withdraw(TENANT_ID, USER_ID, REQUEST_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });
});
