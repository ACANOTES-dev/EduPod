/* eslint-disable import/order -- jest.mock must precede mocked imports */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware');

import {
  ConfigurationReadFacade,
  MOCK_FACADE_PROVIDERS,
  ParentReadFacade,
  ClassesReadFacade,
  StaffProfileReadFacade,
} from '../../common/tests/mock-facades';
import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { ConferencesService } from './conferences.service';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const EVENT_ID = '00000000-0000-0000-0000-000000000010';
const SLOT_ID = '00000000-0000-0000-0000-000000000020';
const BOOKING_ID = '00000000-0000-0000-0000-000000000030';
const USER_ID = '00000000-0000-0000-0000-000000000040';
const STAFF_ID = '00000000-0000-0000-0000-000000000050';
const STUDENT_ID = '00000000-0000-0000-0000-000000000060';
const PARENT_ID = '00000000-0000-0000-0000-000000000070';
const TEACHER_A = '00000000-0000-0000-0000-000000000080';
const TEACHER_B = '00000000-0000-0000-0000-000000000081';

const mockConferenceEvent = {
  id: EVENT_ID,
  tenant_id: TENANT_ID,
  title: 'Parent-Teacher Conference',
  event_type: 'parent_conference',
  status: 'open',
  booking_deadline: null,
};

const mockSlot = {
  id: SLOT_ID,
  tenant_id: TENANT_ID,
  event_id: EVENT_ID,
  teacher_id: STAFF_ID,
  start_time: new Date('2026-04-01T09:00:00Z'),
  end_time: new Date('2026-04-01T09:10:00Z'),
  status: 'available',
};

const mockBooking = {
  id: BOOKING_ID,
  tenant_id: TENANT_ID,
  time_slot_id: SLOT_ID,
  student_id: STUDENT_ID,
  booked_by_user_id: USER_ID,
  booking_type: 'parent_booked',
  status: 'confirmed',
  booked_at: new Date('2026-03-30T12:00:00Z'),
  cancelled_at: null,
  video_call_link: null,
  notes: null,
};

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = {
  engagementEvent: {
    findFirst: jest.fn(),
  },
  conferenceTimeSlot: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
  },
  conferenceBooking: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  staffProfile: {
    findFirst: jest.fn(),
  },
  parent: {
    findFirst: jest.fn(),
  },
  studentParent: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  classEnrolment: {
    findMany: jest.fn(),
  },
  classStaff: {
    findMany: jest.fn(),
  },
  tenantSetting: {
    findUnique: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockTx = {
  conferenceTimeSlot: {
    createMany: jest.fn(),
    update: jest.fn(),
  },
  conferenceBooking: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

const mockRlsClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  $transaction: jest.fn((fn: (tx: any) => Promise<any>) => fn(mockTx)),
};

(createRlsClient as jest.Mock).mockReturnValue(mockRlsClient);

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('ConferencesService', () => {
  let service: ConferencesService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ConferencesService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ParentReadFacade,
          useValue: {
            findByUserId: mockPrisma.parent.findFirst,
            findLinkedStudentIds: jest.fn().mockImplementation(async () => {
              const links = await mockPrisma.studentParent.findMany();
              return (links as Array<{ student_id: string }>).map((l) => l.student_id);
            }),
            isLinkedToStudent: jest
              .fn()
              .mockImplementation(
                async (_tenantId: string, _parentId: string, studentId: string) => {
                  const link = await mockPrisma.studentParent.findUnique();
                  return link?.student_id === studentId;
                },
              ),
          },
        },
        {
          provide: StaffProfileReadFacade,
          useValue: { findByUserId: mockPrisma.staffProfile.findFirst },
        },
        {
          provide: ClassesReadFacade,
          useValue: {
            findClassIdsByStudentIds: jest.fn().mockImplementation(async () => {
              const enrolments = await mockPrisma.classEnrolment.findMany();
              return (enrolments as Array<{ class_id: string }>).map((e) => e.class_id);
            }),
            findStaffProfileIdsByClassIds: jest.fn().mockImplementation(async () => {
              const staff = await mockPrisma.classStaff.findMany();
              return (staff as Array<{ staff_profile_id: string }>).map((s) => s.staff_profile_id);
            }),
          },
        },
        {
          provide: ConfigurationReadFacade,
          useValue: { findSettings: mockPrisma.tenantSetting.findUnique },
        },
      ],
    }).compile();

    service = module.get<ConferencesService>(ConferencesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── generateTimeSlots ──────────────────────────────────────────────────

  describe('generateTimeSlots', () => {
    const baseDto = {
      date: '2026-04-01',
      start_time: '09:00',
      end_time: '13:00',
      slot_duration_minutes: 10,
      buffer_minutes: 2,
      teacher_ids: [TEACHER_A, TEACHER_B],
    };

    it('should generate correct number of slots per teacher', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockTx.conferenceTimeSlot.createMany.mockResolvedValue({ count: 40 });

      // 4h window = 240 min, step = 10 + 2 = 12 min, 240 / 12 = 20 slots per teacher
      const result = await service.generateTimeSlots(TENANT_ID, EVENT_ID, baseDto);

      expect(result).toEqual({ created: 40, per_teacher: 20 });
      expect(mockTx.conferenceTimeSlot.createMany).toHaveBeenCalledTimes(1);
      const createCall = mockTx.conferenceTimeSlot.createMany.mock.calls[0][0];
      expect(createCall.data).toHaveLength(40);
    });

    it('should throw if event is not parent_conference type', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue({
        ...mockConferenceEvent,
        event_type: 'school_trip',
      });

      await expect(service.generateTimeSlots(TENANT_ID, EVENT_ID, baseDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if start_time >= end_time', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);

      const invalidDto = {
        ...baseDto,
        start_time: '14:00',
        end_time: '09:00',
      };

      await expect(service.generateTimeSlots(TENANT_ID, EVENT_ID, invalidDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if event not found', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(null);

      await expect(service.generateTimeSlots(TENANT_ID, EVENT_ID, baseDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── findAllTimeSlots ───────────────────────────────────────────────────

  describe('findAllTimeSlots', () => {
    it('should return paginated time slots with teacher and booking includes', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      const slotsData = [
        {
          ...mockSlot,
          teacher: { id: STAFF_ID, user_id: USER_ID },
          booking: null,
        },
      ];
      mockPrisma.conferenceTimeSlot.findMany.mockResolvedValue(slotsData);
      mockPrisma.conferenceTimeSlot.count.mockResolvedValue(1);

      const result = await service.findAllTimeSlots(TENANT_ID, EVENT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(result.data).toHaveLength(1);
      expect(mockPrisma.conferenceTimeSlot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            teacher: expect.any(Object),
            booking: expect.any(Object),
          }),
        }),
      );
    });

    it('should apply teacher_id and status filters', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.conferenceTimeSlot.findMany.mockResolvedValue([]);
      mockPrisma.conferenceTimeSlot.count.mockResolvedValue(0);

      await service.findAllTimeSlots(TENANT_ID, EVENT_ID, {
        page: 1,
        pageSize: 20,
        teacher_id: STAFF_ID,
        status: 'available',
      });

      expect(mockPrisma.conferenceTimeSlot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            teacher_id: STAFF_ID,
            status: 'available',
          }),
        }),
      );
    });
  });

  // ─── updateTimeSlot ─────────────────────────────────────────────────────

  describe('updateTimeSlot', () => {
    it('should transition available to blocked', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.conferenceTimeSlot.findFirst.mockResolvedValue(mockSlot);
      mockTx.conferenceTimeSlot.update.mockResolvedValue({
        ...mockSlot,
        status: 'blocked',
      });

      const result = await service.updateTimeSlot(TENANT_ID, EVENT_ID, SLOT_ID, {
        status: 'blocked',
      });

      expect((result as Record<string, unknown>).status).toBe('blocked');
      expect(mockTx.conferenceTimeSlot.update).toHaveBeenCalledWith({
        where: { id: SLOT_ID },
        data: { status: 'blocked' },
      });
    });

    it('should throw INVALID_TRANSITION for booked to blocked', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.conferenceTimeSlot.findFirst.mockResolvedValue({
        ...mockSlot,
        status: 'booked',
      });

      await expect(
        service.updateTimeSlot(TENANT_ID, EVENT_ID, SLOT_ID, { status: 'blocked' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw SLOT_NOT_FOUND for unknown slot', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.conferenceTimeSlot.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTimeSlot(TENANT_ID, EVENT_ID, SLOT_ID, { status: 'blocked' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findAllBookings ────────────────────────────────────────────────────

  describe('findAllBookings', () => {
    it('should return paginated bookings', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      const bookingsData = [
        {
          ...mockBooking,
          time_slot: {
            id: SLOT_ID,
            start_time: mockSlot.start_time,
            end_time: mockSlot.end_time,
            teacher_id: STAFF_ID,
            teacher: { id: STAFF_ID, user_id: USER_ID },
          },
          student: { id: STUDENT_ID, first_name: 'Ali', last_name: 'Student' },
        },
      ];
      mockPrisma.conferenceBooking.findMany.mockResolvedValue(bookingsData);
      mockPrisma.conferenceBooking.count.mockResolvedValue(1);

      const result = await service.findAllBookings(TENANT_ID, EVENT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(result.data).toHaveLength(1);
    });
  });

  // ─── createBooking ──────────────────────────────────────────────────────

  describe('createBooking', () => {
    const dto = {
      time_slot_id: SLOT_ID,
      student_id: STUDENT_ID,
      booking_type: 'admin_booked' as const,
    };

    it('should lock slot with FOR UPDATE and create booking', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockTx.$queryRaw.mockResolvedValue([
        {
          id: SLOT_ID,
          status: 'available',
          start_time: mockSlot.start_time,
          end_time: mockSlot.end_time,
          teacher_id: STAFF_ID,
        },
      ]);
      mockTx.conferenceBooking.create.mockResolvedValue(mockBooking);
      mockTx.conferenceTimeSlot.update.mockResolvedValue({
        ...mockSlot,
        status: 'booked',
      });

      const result = await service.createBooking(TENANT_ID, EVENT_ID, USER_ID, dto);

      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockTx.conferenceBooking.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          time_slot_id: SLOT_ID,
          student_id: STUDENT_ID,
          booked_by_user_id: USER_ID,
          booking_type: 'admin_booked',
        }),
      });
      expect(mockTx.conferenceTimeSlot.update).toHaveBeenCalledWith({
        where: { id: SLOT_ID },
        data: { status: 'booked' },
      });
      expect(result).toEqual(mockBooking);
    });

    it('should throw SLOT_NOT_AVAILABLE when slot is booked', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockTx.$queryRaw.mockResolvedValue([
        {
          id: SLOT_ID,
          status: 'booked',
          start_time: mockSlot.start_time,
          end_time: mockSlot.end_time,
          teacher_id: STAFF_ID,
        },
      ]);

      await expect(service.createBooking(TENANT_ID, EVENT_ID, USER_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw SLOT_NOT_FOUND when slot missing', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockTx.$queryRaw.mockResolvedValue([]);

      await expect(service.createBooking(TENANT_ID, EVENT_ID, USER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── cancelBooking ──────────────────────────────────────────────────────

  describe('cancelBooking', () => {
    it('should cancel booking and return slot to available', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.conferenceBooking.findFirst.mockResolvedValue(mockBooking);
      mockTx.conferenceBooking.update.mockResolvedValue({
        ...mockBooking,
        status: 'cancelled',
      });
      mockTx.conferenceTimeSlot.update.mockResolvedValue({
        ...mockSlot,
        status: 'available',
      });

      await service.cancelBooking(TENANT_ID, EVENT_ID, BOOKING_ID);

      expect(mockTx.conferenceBooking.update).toHaveBeenCalledWith({
        where: { id: BOOKING_ID },
        data: expect.objectContaining({ status: 'cancelled' }),
      });
      expect(mockTx.conferenceTimeSlot.update).toHaveBeenCalledWith({
        where: { id: SLOT_ID },
        data: { status: 'available' },
      });
    });

    it('should throw for already cancelled booking', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.conferenceBooking.findFirst.mockResolvedValue({
        ...mockBooking,
        status: 'cancelled',
      });

      await expect(service.cancelBooking(TENANT_ID, EVENT_ID, BOOKING_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── getTeacherSchedule ─────────────────────────────────────────────────

  describe('getTeacherSchedule', () => {
    it('should return teacher slots ordered by start_time', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      const slotsData = [
        {
          ...mockSlot,
          booking: null,
        },
      ];
      mockPrisma.conferenceTimeSlot.findMany.mockResolvedValue(slotsData);

      const result = await service.getTeacherSchedule(TENANT_ID, EVENT_ID, USER_ID);

      expect(result.teacher_id).toBe(STAFF_ID);
      expect(result.event_id).toBe(EVENT_ID);
      expect(result.slots).toEqual(slotsData);
      expect(mockPrisma.conferenceTimeSlot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { start_time: 'asc' },
        }),
      );
    });

    it('should throw STAFF_NOT_FOUND for non-staff user', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

      await expect(service.getTeacherSchedule(TENANT_ID, EVENT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getAvailableSlots ──────────────────────────────────────────────────

  describe('getAvailableSlots', () => {
    it("should find available slots for parent's children's teachers", async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      // getParentStudentIds
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      // getStudentTeacherIds
      mockPrisma.classEnrolment.findMany.mockResolvedValue([{ class_id: 'class-1' }]);
      mockPrisma.classStaff.findMany.mockResolvedValue([{ staff_profile_id: TEACHER_A }]);
      // available slots query
      const slotsData = [
        {
          ...mockSlot,
          teacher_id: TEACHER_A,
          teacher: { id: TEACHER_A, user_id: 'teacher-user-1' },
        },
      ];
      mockPrisma.conferenceTimeSlot.findMany.mockResolvedValue(slotsData);

      const result = await service.getAvailableSlots(TENANT_ID, EVENT_ID, USER_ID);

      expect(result.data).toHaveLength(1);
      expect(mockPrisma.conferenceTimeSlot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'available',
            teacher_id: { in: [TEACHER_A] },
          }),
        }),
      );
    });

    it('should return empty when no teachers found', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

      const result = await service.getAvailableSlots(TENANT_ID, EVENT_ID, USER_ID);

      expect(result.data).toEqual([]);
    });
  });

  // ─── parentBook ─────────────────────────────────────────────────────────

  describe('parentBook', () => {
    const dto = {
      time_slot_id: SLOT_ID,
      student_id: STUDENT_ID,
      booking_type: 'parent_booked' as const,
    };

    it('should create booking with conflict prevention', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      // verifyParentStudentLink
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.studentParent.findUnique.mockResolvedValue({
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
        tenant_id: TENANT_ID,
      });
      // Lock slot
      mockTx.$queryRaw.mockResolvedValue([
        {
          id: SLOT_ID,
          status: 'available',
          start_time: mockSlot.start_time,
          end_time: mockSlot.end_time,
          teacher_id: STAFF_ID,
        },
      ]);
      // getParentStudentIds (called again inside transaction)
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      // Overlap check
      mockTx.conferenceBooking.findFirst.mockResolvedValue(null);
      // Create booking
      mockTx.conferenceBooking.create.mockResolvedValue(mockBooking);
      mockTx.conferenceTimeSlot.update.mockResolvedValue({
        ...mockSlot,
        status: 'booked',
      });

      const result = await service.parentBook(TENANT_ID, EVENT_ID, USER_ID, dto);

      expect(result).toEqual(mockBooking);
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockTx.conferenceBooking.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          time_slot_id: SLOT_ID,
          student_id: STUDENT_ID,
          booked_by_user_id: USER_ID,
          booking_type: 'parent_booked',
        }),
      });
    });

    it('should throw BOOKING_DEADLINE_PASSED when deadline exceeded', async () => {
      const pastDeadline = new Date('2020-01-01T00:00:00Z');
      mockPrisma.engagementEvent.findFirst.mockResolvedValue({
        ...mockConferenceEvent,
        booking_deadline: pastDeadline,
      });

      await expect(service.parentBook(TENANT_ID, EVENT_ID, USER_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw PARENT_DOUBLE_BOOKING for overlapping bookings', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      // verifyParentStudentLink
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.studentParent.findUnique.mockResolvedValue({
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
        tenant_id: TENANT_ID,
      });
      // Lock slot
      mockTx.$queryRaw.mockResolvedValue([
        {
          id: SLOT_ID,
          status: 'available',
          start_time: mockSlot.start_time,
          end_time: mockSlot.end_time,
          teacher_id: STAFF_ID,
        },
      ]);
      // getParentStudentIds inside transaction
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      // Overlap check returns an existing booking
      mockTx.conferenceBooking.findFirst.mockResolvedValue({
        id: 'existing-booking',
        status: 'confirmed',
      });

      await expect(service.parentBook(TENANT_ID, EVENT_ID, USER_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── parentCancelBooking ────────────────────────────────────────────────

  describe('parentCancelBooking', () => {
    it('should cancel booking when allowed by config', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: { engagement: { allow_parent_conference_cancellation: true } },
      });
      // getParentStudentIds
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockPrisma.conferenceBooking.findFirst.mockResolvedValue(mockBooking);
      mockTx.conferenceBooking.update.mockResolvedValue({
        ...mockBooking,
        status: 'cancelled',
      });
      mockTx.conferenceTimeSlot.update.mockResolvedValue({
        ...mockSlot,
        status: 'available',
      });

      await service.parentCancelBooking(TENANT_ID, EVENT_ID, BOOKING_ID, USER_ID);

      expect(mockTx.conferenceBooking.update).toHaveBeenCalledWith({
        where: { id: BOOKING_ID },
        data: expect.objectContaining({ status: 'cancelled' }),
      });
      expect(mockTx.conferenceTimeSlot.update).toHaveBeenCalledWith({
        where: { id: SLOT_ID },
        data: { status: 'available' },
      });
    });

    it('should throw CANCELLATION_NOT_ALLOWED when config disables it', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: { engagement: { allow_parent_conference_cancellation: false } },
      });

      await expect(
        service.parentCancelBooking(TENANT_ID, EVENT_ID, BOOKING_ID, USER_ID),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BOOKING_NOT_FOUND when booking not linked to parent', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: {},
      });
      // getParentStudentIds
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockPrisma.conferenceBooking.findFirst.mockResolvedValue(null);

      await expect(
        service.parentCancelBooking(TENANT_ID, EVENT_ID, BOOKING_ID, USER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getParentBookings ──────────────────────────────────────────────────

  describe('getParentBookings', () => {
    it("should return bookings for parent's children", async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      const bookingsData = [
        {
          ...mockBooking,
          time_slot: {
            id: SLOT_ID,
            start_time: mockSlot.start_time,
            end_time: mockSlot.end_time,
            teacher: { id: STAFF_ID, user_id: USER_ID },
          },
          student: { id: STUDENT_ID, first_name: 'Ali', last_name: 'Student' },
        },
      ];
      mockPrisma.conferenceBooking.findMany.mockResolvedValue(bookingsData);

      const result = await service.getParentBookings(TENANT_ID, EVENT_ID, USER_ID);

      expect(result.data).toHaveLength(1);
      expect(mockPrisma.conferenceBooking.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: { in: [STUDENT_ID] },
          }),
        }),
      );
    });
  });

  // ─── updateOwnTimeSlot ─────────────────────────────────────────────────

  describe('updateOwnTimeSlot', () => {
    it('should update own slot from available to blocked', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.conferenceTimeSlot.findFirst.mockResolvedValue({
        ...mockSlot,
        teacher_id: STAFF_ID,
      });
      mockTx.conferenceTimeSlot.update.mockResolvedValue({
        ...mockSlot,
        status: 'blocked',
      });

      const result = await service.updateOwnTimeSlot(
        TENANT_ID,
        EVENT_ID,
        SLOT_ID,
        USER_ID,
        'blocked',
      );

      expect((result as Record<string, unknown>).status).toBe('blocked');
    });

    it('should throw STAFF_NOT_FOUND when user has no staff profile', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

      await expect(
        service.updateOwnTimeSlot(TENANT_ID, EVENT_ID, SLOT_ID, USER_ID, 'blocked'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw SLOT_NOT_FOUND when slot does not exist', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.conferenceTimeSlot.findFirst.mockResolvedValue(null);

      await expect(
        service.updateOwnTimeSlot(TENANT_ID, EVENT_ID, SLOT_ID, USER_ID, 'blocked'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw SLOT_NOT_OWNED when teacher_id does not match', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.conferenceTimeSlot.findFirst.mockResolvedValue({
        ...mockSlot,
        teacher_id: 'other-teacher-id',
      });

      await expect(
        service.updateOwnTimeSlot(TENANT_ID, EVENT_ID, SLOT_ID, USER_ID, 'blocked'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw SLOT_NOT_MODIFIABLE when slot is booked', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.conferenceTimeSlot.findFirst.mockResolvedValue({
        ...mockSlot,
        teacher_id: STAFF_ID,
        status: 'booked',
      });

      await expect(
        service.updateOwnTimeSlot(TENANT_ID, EVENT_ID, SLOT_ID, USER_ID, 'available'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw SLOT_NOT_MODIFIABLE when slot is completed', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.staffProfile.findFirst.mockResolvedValue({
        id: STAFF_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.conferenceTimeSlot.findFirst.mockResolvedValue({
        ...mockSlot,
        teacher_id: STAFF_ID,
        status: 'completed',
      });

      await expect(
        service.updateOwnTimeSlot(TENANT_ID, EVENT_ID, SLOT_ID, USER_ID, 'available'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── parentCancelBooking — additional branches ────────────────────────────

  describe('parentCancelBooking — additional branches', () => {
    it('should throw INVALID_TRANSITION when booking is not confirmed', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: {},
      });
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockPrisma.conferenceBooking.findFirst.mockResolvedValue({
        ...mockBooking,
        status: 'cancelled',
      });

      await expect(
        service.parentCancelBooking(TENANT_ID, EVENT_ID, BOOKING_ID, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── cancelBooking — BOOKING_NOT_FOUND branch ─────────────────────────────

  describe('cancelBooking — additional branches', () => {
    it('should throw BOOKING_NOT_FOUND when booking does not exist', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.conferenceBooking.findFirst.mockResolvedValue(null);

      await expect(service.cancelBooking(TENANT_ID, EVENT_ID, BOOKING_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── parentBook — SLOT_NOT_AVAILABLE branch ────────────────────────────────

  describe('parentBook — additional branches', () => {
    const dto = {
      time_slot_id: SLOT_ID,
      student_id: STUDENT_ID,
      booking_type: 'parent_booked' as const,
    };

    it('should throw NOT_LINKED_TO_STUDENT when parent link verification fails', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.studentParent.findUnique.mockResolvedValue({
        student_id: 'other-student-id',
        parent_id: PARENT_ID,
      });

      await expect(service.parentBook(TENANT_ID, EVENT_ID, USER_ID, dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw SLOT_NOT_FOUND when slot not found inside transaction', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.studentParent.findUnique.mockResolvedValue({
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
      });
      mockTx.$queryRaw.mockResolvedValue([]);

      await expect(service.parentBook(TENANT_ID, EVENT_ID, USER_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw SLOT_NOT_AVAILABLE when slot is blocked', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.studentParent.findUnique.mockResolvedValue({
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
      });
      mockTx.$queryRaw.mockResolvedValue([
        {
          id: SLOT_ID,
          status: 'blocked',
          start_time: mockSlot.start_time,
          end_time: mockSlot.end_time,
          teacher_id: STAFF_ID,
        },
      ]);

      await expect(service.parentBook(TENANT_ID, EVENT_ID, USER_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── getAvailableSlots — PARENT_NOT_FOUND branch ──────────────────────────

  describe('getAvailableSlots — additional branches', () => {
    it('should throw PARENT_NOT_FOUND when parent does not exist', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.parent.findFirst.mockResolvedValue(null);

      await expect(service.getAvailableSlots(TENANT_ID, EVENT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── generateTimeSlots — NO_SLOTS_GENERATED branch ────────────────────────

  describe('generateTimeSlots — additional branches', () => {
    it('should throw NO_SLOTS_GENERATED when time range too short', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);

      const dto = {
        date: '2026-04-01',
        start_time: '09:00',
        end_time: '09:05',
        slot_duration_minutes: 10,
        buffer_minutes: 0,
        teacher_ids: [TEACHER_A],
      };

      await expect(service.generateTimeSlots(TENANT_ID, EVENT_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── isParentCancellationAllowed — branch coverage ────────────────────────

  describe('getParentBookings — cancellation flag branches', () => {
    it('should return allow_parent_conference_cancellation true by default', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockPrisma.conferenceBooking.findMany.mockResolvedValue([]);
      // No settings at all (null)
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);

      const result = await service.getParentBookings(TENANT_ID, EVENT_ID, USER_ID);

      expect(result.allow_parent_conference_cancellation).toBe(true);
    });

    it('should return allow_parent_conference_cancellation false when explicitly set', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.parent.findFirst.mockResolvedValue({
        id: PARENT_ID,
        user_id: USER_ID,
        tenant_id: TENANT_ID,
      });
      mockPrisma.studentParent.findMany.mockResolvedValue([{ student_id: STUDENT_ID }]);
      mockPrisma.conferenceBooking.findMany.mockResolvedValue([]);
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        tenant_id: TENANT_ID,
        settings: { engagement: { allow_parent_conference_cancellation: false } },
      });

      const result = await service.getParentBookings(TENANT_ID, EVENT_ID, USER_ID);

      expect(result.allow_parent_conference_cancellation).toBe(false);
    });
  });

  // ─── getBookingStats ────────────────────────────────────────────────────

  describe('getBookingStats', () => {
    it('should return per-teacher and total stats', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(mockConferenceEvent);
      mockPrisma.conferenceTimeSlot.findMany.mockResolvedValue([
        { teacher_id: TEACHER_A, status: 'available' },
        { teacher_id: TEACHER_A, status: 'booked' },
        { teacher_id: TEACHER_A, status: 'blocked' },
        { teacher_id: TEACHER_B, status: 'available' },
        { teacher_id: TEACHER_B, status: 'completed' },
        { teacher_id: TEACHER_B, status: 'cancelled' },
      ]);

      const result = await service.getBookingStats(TENANT_ID, EVENT_ID);

      expect(result.totals).toEqual({
        total: 6,
        available: 2,
        booked: 1,
        blocked: 1,
        completed: 1,
        cancelled: 1,
      });

      expect(result.per_teacher).toHaveLength(2);
      const teacherA = result.per_teacher.find(
        (t: Record<string, unknown>) => t.teacher_id === TEACHER_A,
      );
      expect(teacherA).toEqual({
        teacher_id: TEACHER_A,
        total: 3,
        available: 1,
        booked: 1,
        blocked: 1,
        completed: 0,
        cancelled: 0,
      });

      const teacherB = result.per_teacher.find(
        (t: Record<string, unknown>) => t.teacher_id === TEACHER_B,
      );
      expect(teacherB).toEqual({
        teacher_id: TEACHER_B,
        total: 3,
        available: 1,
        booked: 0,
        blocked: 0,
        completed: 1,
        cancelled: 1,
      });
    });
  });
});
