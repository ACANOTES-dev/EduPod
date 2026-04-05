import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { ExamSchedulingService } from './exam-scheduling.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SESSION_ID = 'session-1';
const PERIOD_ID = 'period-1';

const mockTx = {
  examSession: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  examSlot: {
    create: jest.fn(),
    update: jest.fn(),
  },
  examInvigilation: {
    count: jest.fn().mockResolvedValue(0),
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

const makePlanningSession = (status = 'planning') => ({
  id: SESSION_ID,
  status,
  start_date: new Date('2026-06-01'),
  end_date: new Date('2026-06-10'),
  academic_period_id: PERIOD_ID,
  name: 'Summer Exams 2026',
  created_at: new Date('2026-03-01'),
  updated_at: new Date('2026-03-01'),
  exam_slots: [],
});

describe('ExamSchedulingService', () => {
  let service: ExamSchedulingService;
  let module: TestingModule;
  let mockPrisma: {
    academicPeriod: { findFirst: jest.Mock };
    examSession: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    examSlot: { findMany: jest.Mock };
    room: { findMany: jest.Mock };
    staffProfile: { findMany: jest.Mock };
    examInvigilation: { count: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      academicPeriod: {
        findFirst: jest.fn().mockResolvedValue({ id: PERIOD_ID }),
      },
      examSession: {
        findFirst: jest.fn().mockResolvedValue(makePlanningSession()),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      examSlot: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      room: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      staffProfile: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      examInvigilation: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    mockTx.examSession.create.mockResolvedValue({
      id: SESSION_ID,
      status: 'planning',
      created_at: new Date('2026-03-01'),
    });
    mockTx.examSession.update.mockResolvedValue({
      id: SESSION_ID,
      name: 'Updated Name',
      status: 'planning',
      updated_at: new Date('2026-03-02'),
    });
    mockTx.examSlot.create.mockResolvedValue({
      id: 'slot-1',
      created_at: new Date('2026-03-01'),
    });

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        {
          provide: AcademicReadFacade,
          useValue: {
            findCurrentYear: jest.fn().mockResolvedValue(null),
            findCurrentYearId: jest.fn().mockResolvedValue('year-1'),
            findYearById: jest.fn().mockResolvedValue(null),
            findYearByIdOrThrow: jest.fn().mockResolvedValue('year-1'),
            findSubjectByIdOrThrow: jest.fn().mockResolvedValue('subject-1'),
            findYearGroupByIdOrThrow: jest.fn().mockResolvedValue('yg-1'),
            findYearGroupsWithActiveClasses: jest.fn().mockResolvedValue([]),
            findYearGroupsWithClassesAndCounts: jest.fn().mockResolvedValue([]),
            findAllYearGroups: jest.fn().mockResolvedValue([]),
            findSubjectsByIdsWithOrder: jest.fn().mockResolvedValue([]),
            findSubjectById: jest.fn().mockResolvedValue(null),
            findYearGroupById: jest.fn().mockResolvedValue(null),
            findPeriodById: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: RoomsReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
            existsOrThrow: jest.fn().mockResolvedValue(undefined),
            exists: jest.fn().mockResolvedValue(false),
            findActiveRooms: jest.fn().mockResolvedValue([]),
            findActiveRoomBasics: jest.fn().mockResolvedValue([]),
            countActiveRooms: jest.fn().mockResolvedValue(0),
            findAllClosures: jest.fn().mockResolvedValue([]),
            findClosuresPaginated: jest.fn().mockResolvedValue({ data: [], total: 0 }),
            findClosureById: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
            findByIds: jest.fn().mockResolvedValue([]),
            findByUserId: jest.fn().mockResolvedValue(null),
            findActiveStaff: jest.fn().mockResolvedValue([]),
            existsOrThrow: jest.fn().mockResolvedValue(undefined),
            resolveProfileId: jest.fn().mockResolvedValue('staff-1'),
          },
        },
        ExamSchedulingService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ExamSchedulingService>(ExamSchedulingService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createExamSession ────────────────────────────────────────────────────

  describe('createExamSession', () => {
    it('should create a new exam session in planning status', async () => {
      const facade = module.get(AcademicReadFacade);
      (facade.findPeriodById as jest.Mock).mockResolvedValue({ id: PERIOD_ID });

      const result = await service.createExamSession(TENANT_ID, {
        academic_period_id: PERIOD_ID,
        name: 'Summer Exams 2026',
        start_date: '2026-06-01',
        end_date: '2026-06-10',
      });

      expect(result.id).toBe(SESSION_ID);
      expect(result.status).toBe('planning');
      expect(mockTx.examSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            academic_period_id: PERIOD_ID,
            status: 'planning',
          }),
        }),
      );
    });

    it('should throw NotFoundException when academic period does not exist', async () => {
      const facade = module.get(AcademicReadFacade);
      (facade.findPeriodById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createExamSession(TENANT_ID, {
          academic_period_id: 'nonexistent',
          name: 'Test',
          start_date: '2026-06-01',
          end_date: '2026-06-10',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateExamSession ────────────────────────────────────────────────────

  describe('updateExamSession', () => {
    it('should update a planning session', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('planning'));

      const result = await service.updateExamSession(TENANT_ID, SESSION_ID, {
        name: 'Updated Name',
      });

      expect(result.name).toBe('Updated Name');
      expect(mockTx.examSession.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException when session is published', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('published'));

      await expect(
        service.updateExamSession(TENANT_ID, SESSION_ID, { name: 'Updated' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when session is completed', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('completed'));

      await expect(
        service.updateExamSession(TENANT_ID, SESSION_ID, { name: 'Updated' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when session does not exist', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(null);

      await expect(
        service.updateExamSession(TENANT_ID, 'nonexistent', { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteExamSession ────────────────────────────────────────────────────

  describe('deleteExamSession', () => {
    it('should delete a planning session', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('planning'));

      const result = await service.deleteExamSession(TENANT_ID, SESSION_ID);

      expect(result.deleted).toBe(true);
      expect(mockTx.examSession.delete).toHaveBeenCalled();
    });

    it('should throw BadRequestException when session is published', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('published'));

      await expect(service.deleteExamSession(TENANT_ID, SESSION_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── addExamSlot ──────────────────────────────────────────────────────────

  describe('addExamSlot', () => {
    it('should add a slot within the session date range', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession());

      const result = await service.addExamSlot(TENANT_ID, SESSION_ID, {
        subject_id: 'sub-1',
        year_group_id: 'yg-1',
        date: '2026-06-05',
        start_time: '09:00',
        end_time: '11:00',
        duration_minutes: 120,
        student_count: 30,
      });

      expect(result.exam_session_id).toBe(SESSION_ID);
      expect(result.subject_id).toBe('sub-1');
      expect(mockTx.examSlot.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException when slot date is outside session bounds', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession());

      await expect(
        service.addExamSlot(TENANT_ID, SESSION_ID, {
          subject_id: 'sub-1',
          year_group_id: 'yg-1',
          date: '2026-07-01', // outside June 1–10
          start_time: '09:00',
          end_time: '11:00',
          duration_minutes: 120,
          student_count: 30,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when session does not exist', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(null);

      await expect(
        service.addExamSlot(TENANT_ID, 'nonexistent', {
          subject_id: 'sub-1',
          year_group_id: 'yg-1',
          date: '2026-06-05',
          start_time: '09:00',
          end_time: '11:00',
          duration_minutes: 120,
          student_count: 30,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── publishExamSchedule ──────────────────────────────────────────────────

  describe('publishExamSchedule', () => {
    it('should publish a planning session', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('planning'));

      const result = await service.publishExamSchedule(TENANT_ID, SESSION_ID);

      expect(result.status).toBe('published');
      expect(mockTx.examSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'published' }),
        }),
      );
    });

    it('should throw BadRequestException when session is already published', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('published'));

      await expect(service.publishExamSchedule(TENANT_ID, SESSION_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when session is completed', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('completed'));

      await expect(service.publishExamSchedule(TENANT_ID, SESSION_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when session does not exist', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(null);

      await expect(service.publishExamSchedule(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getExamSession ──────────────────────────────────────────────────────

  describe('getExamSession', () => {
    it('should return a formatted session with slots and invigilators', async () => {
      const sessionWithSlots = {
        id: SESSION_ID,
        name: 'Summer Exams 2026',
        start_date: new Date('2026-06-01'),
        end_date: new Date('2026-06-10'),
        status: 'planning',
        academic_period_id: PERIOD_ID,
        created_at: new Date('2026-03-01'),
        updated_at: new Date('2026-03-01'),
        exam_slots: [
          {
            id: 'slot-1',
            subject: { name: 'Maths' },
            year_group: { name: 'Year 10' },
            date: new Date('2026-06-05'),
            start_time: new Date('1970-01-01T09:00:00Z'),
            end_time: new Date('1970-01-01T11:00:00Z'),
            room: { name: 'Hall A' },
            duration_minutes: 120,
            student_count: 30,
            invigilations: [
              {
                id: 'inv-1',
                role: 'lead',
                staff_profile: { user: { first_name: 'Alice', last_name: 'Brown' } },
              },
            ],
          },
        ],
      };
      mockPrisma.examSession.findFirst.mockResolvedValue(sessionWithSlots);

      const result = await service.getExamSession(TENANT_ID, SESSION_ID);

      expect(result.id).toBe(SESSION_ID);
      expect(result.exam_slots).toHaveLength(1);
      expect(result.exam_slots[0]!.subject_name).toBe('Maths');
      expect(result.exam_slots[0]!.room_name).toBe('Hall A');
      expect(result.exam_slots[0]!.invigilators).toHaveLength(1);
      expect(result.exam_slots[0]!.invigilators[0]!.name).toBe('Alice Brown');
      expect(result.exam_slots[0]!.invigilators[0]!.role).toBe('lead');
    });

    it('should handle null subject, year_group, and room in slots', async () => {
      const sessionWithNulls = {
        id: SESSION_ID,
        name: 'Test',
        start_date: new Date('2026-06-01'),
        end_date: new Date('2026-06-10'),
        status: 'planning',
        academic_period_id: PERIOD_ID,
        created_at: new Date('2026-03-01'),
        updated_at: new Date('2026-03-01'),
        exam_slots: [
          {
            id: 'slot-1',
            subject: null,
            year_group: null,
            date: new Date('2026-06-05'),
            start_time: new Date('1970-01-01T09:00:00Z'),
            end_time: new Date('1970-01-01T11:00:00Z'),
            room: null,
            duration_minutes: 120,
            student_count: 30,
            invigilations: [],
          },
        ],
      };
      mockPrisma.examSession.findFirst.mockResolvedValue(sessionWithNulls);

      const result = await service.getExamSession(TENANT_ID, SESSION_ID);

      expect(result.exam_slots[0]!.subject_name).toBeNull();
      expect(result.exam_slots[0]!.year_group_name).toBeNull();
      expect(result.exam_slots[0]!.room_name).toBeNull();
    });

    it('should throw NotFoundException when session does not exist', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(null);

      await expect(service.getExamSession(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── listExamSessions ────────────────────────────────────────────────────

  describe('listExamSessions', () => {
    it('should return paginated exam sessions', async () => {
      mockPrisma.examSession.findMany.mockResolvedValue([
        {
          id: SESSION_ID,
          name: 'Summer Exams',
          start_date: new Date('2026-06-01'),
          end_date: new Date('2026-06-10'),
          status: 'planning',
          academic_period_id: PERIOD_ID,
          _count: { exam_slots: 5 },
          created_at: new Date('2026-03-01'),
        },
      ]);
      mockPrisma.examSession.count.mockResolvedValue(1);

      const result = await service.listExamSessions(TENANT_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.slot_count).toBe(5);
      expect(result.data[0]!.start_date).toBe('2026-06-01');
      expect(result.data[0]!.end_date).toBe('2026-06-10');
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should filter by academic_period_id', async () => {
      mockPrisma.examSession.findMany.mockResolvedValue([]);
      mockPrisma.examSession.count.mockResolvedValue(0);

      await service.listExamSessions(TENANT_ID, {
        page: 1,
        pageSize: 20,
        academic_period_id: PERIOD_ID,
      });

      expect(mockPrisma.examSession.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ academic_period_id: PERIOD_ID }),
        }),
      );
    });

    it('should omit academic_period_id filter when not provided', async () => {
      mockPrisma.examSession.findMany.mockResolvedValue([]);
      mockPrisma.examSession.count.mockResolvedValue(0);

      await service.listExamSessions(TENANT_ID, { page: 1, pageSize: 20 });

      const findManyCall = mockPrisma.examSession.findMany.mock.calls[0][0];
      expect(findManyCall.where).not.toHaveProperty('academic_period_id');
    });
  });

  // ─── deleteExamSession ── additional cases ───────────────────────────────

  describe('deleteExamSession — edge cases', () => {
    it('should throw NotFoundException when session does not exist', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(null);

      await expect(service.deleteExamSession(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should allow deletion of completed session (only published is blocked)', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(makePlanningSession('completed'));

      const result = await service.deleteExamSession(TENANT_ID, SESSION_ID);

      expect(result.deleted).toBe(true);
    });
  });

  // ─── generateExamSchedule ────────────────────────────────────────────────

  describe('generateExamSchedule', () => {
    it('should throw NotFoundException when session does not exist', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(null);

      await expect(service.generateExamSchedule(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should assign rooms to slots without room_id', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue({
        ...makePlanningSession(),
        exam_slots: [
          {
            id: 'slot-1',
            room_id: null,
            student_count: 20,
            subject: { name: 'M' },
            year_group: { name: 'Y' },
          },
          {
            id: 'slot-2',
            room_id: 'existing-room',
            student_count: 20,
            subject: { name: 'S' },
            year_group: { name: 'Y' },
          },
        ],
      });
      const roomsFacade = module.get(RoomsReadFacade);
      (roomsFacade.findActiveRoomBasics as jest.Mock).mockResolvedValue([
        { id: 'room-large', capacity: 50 },
      ]);
      mockTx.examSlot.update.mockResolvedValue({});

      const result = await service.generateExamSchedule(TENANT_ID, SESSION_ID);

      expect(result.total_slots).toBe(2);
      expect(result.slots_assigned).toBe(1); // Only slot-1 (without room) was assigned
    });

    it('should skip slots when no room has sufficient capacity', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue({
        ...makePlanningSession(),
        exam_slots: [
          {
            id: 'slot-1',
            room_id: null,
            student_count: 100,
            subject: { name: 'M' },
            year_group: { name: 'Y' },
          },
        ],
      });
      const roomsFacade = module.get(RoomsReadFacade);
      (roomsFacade.findActiveRoomBasics as jest.Mock).mockResolvedValue([
        { id: 'room-small', capacity: 20 },
      ]);

      const result = await service.generateExamSchedule(TENANT_ID, SESSION_ID);

      expect(result.slots_assigned).toBe(0);
    });

    it('should skip rooms with null capacity', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue({
        ...makePlanningSession(),
        exam_slots: [
          {
            id: 'slot-1',
            room_id: null,
            student_count: 10,
            subject: { name: 'M' },
            year_group: { name: 'Y' },
          },
        ],
      });
      const roomsFacade = module.get(RoomsReadFacade);
      (roomsFacade.findActiveRoomBasics as jest.Mock).mockResolvedValue([
        { id: 'room-nocap', capacity: null },
      ]);

      const result = await service.generateExamSchedule(TENANT_ID, SESSION_ID);

      expect(result.slots_assigned).toBe(0);
    });

    it('should return 0 assigned when session has no slots', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue({
        ...makePlanningSession(),
        exam_slots: [],
      });
      const roomsFacade = module.get(RoomsReadFacade);
      (roomsFacade.findActiveRoomBasics as jest.Mock).mockResolvedValue([]);

      const result = await service.generateExamSchedule(TENANT_ID, SESSION_ID);

      expect(result.total_slots).toBe(0);
      expect(result.slots_assigned).toBe(0);
    });
  });

  // ─── assignInvigilators ──────────────────────────────────────────────────

  describe('assignInvigilators', () => {
    it('should throw NotFoundException when session does not exist', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue(null);

      await expect(service.assignInvigilators(TENANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return 0 assignments when no staff are available', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue({
        ...makePlanningSession(),
        exam_slots: [{ id: 'slot-1' }],
      });
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([]);

      const result = await service.assignInvigilators(TENANT_ID, SESSION_ID);

      expect(result.assignments_created).toBe(0);
    });

    it('should assign lead and assistant invigilators to unassigned slots', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue({
        ...makePlanningSession(),
        exam_slots: [{ id: 'slot-1' }],
      });
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'A', last_name: 'B' } },
        { id: 'staff-2', user: { first_name: 'C', last_name: 'D' } },
      ]);
      mockTx.examInvigilation.count.mockResolvedValue(0);
      mockTx.examInvigilation.create.mockResolvedValue({});

      const result = await service.assignInvigilators(TENANT_ID, SESSION_ID);

      expect(result.assignments_created).toBe(2); // lead + assistant
    });

    it('should skip slots that already have 2 or more invigilators', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue({
        ...makePlanningSession(),
        exam_slots: [{ id: 'slot-1' }],
      });
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'A', last_name: 'B' } },
        { id: 'staff-2', user: { first_name: 'C', last_name: 'D' } },
      ]);
      mockTx.examInvigilation.count.mockResolvedValue(2);

      const result = await service.assignInvigilators(TENANT_ID, SESSION_ID);

      expect(result.assignments_created).toBe(0);
    });

    it('should only assign assistant when slot already has 1 invigilator', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue({
        ...makePlanningSession(),
        exam_slots: [{ id: 'slot-1' }],
      });
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'A', last_name: 'B' } },
        { id: 'staff-2', user: { first_name: 'C', last_name: 'D' } },
      ]);
      mockTx.examInvigilation.count.mockResolvedValue(1);
      mockTx.examInvigilation.create.mockResolvedValue({});

      const result = await service.assignInvigilators(TENANT_ID, SESSION_ID);

      // existingCount=1, so no lead is added (guard: existingCount === 0), but assistant is added (existingCount < 2)
      expect(result.assignments_created).toBe(1);
    });

    it('should distribute invigilators fairly across multiple slots', async () => {
      mockPrisma.examSession.findFirst.mockResolvedValue({
        ...makePlanningSession(),
        exam_slots: [{ id: 'slot-1' }, { id: 'slot-2' }],
      });
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.findActiveStaff as jest.Mock).mockResolvedValue([
        { id: 'staff-1', user: { first_name: 'A', last_name: 'B' } },
        { id: 'staff-2', user: { first_name: 'C', last_name: 'D' } },
        { id: 'staff-3', user: { first_name: 'E', last_name: 'F' } },
      ]);
      mockTx.examInvigilation.count.mockResolvedValue(0);
      mockTx.examInvigilation.create.mockResolvedValue({});

      const result = await service.assignInvigilators(TENANT_ID, SESSION_ID);

      // 2 slots x 2 invigilators each = 4 assignments
      expect(result.assignments_created).toBe(4);
      expect(result.generated_at).toBeDefined();
    });
  });
});
