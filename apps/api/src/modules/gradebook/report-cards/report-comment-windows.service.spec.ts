import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { SchedulesReadFacade } from '../../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../../staff-profiles/staff-profile-read.facade';

import { ReportCommentWindowsService } from './report-comment-windows.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const WINDOW_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PERIOD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── RLS mock ────────────────────────────────────────────────────────────────

const mockRlsTx = {
  reportCommentWindow: {
    create: jest.fn(),
    update: jest.fn(),
  },
  reportCommentWindowHomeroom: {
    createMany: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    reportCommentWindow: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    reportCommentWindowHomeroom: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    classSubjectGradeConfig: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

const mockAcademicReadFacade = {
  findPeriodById: jest.fn(),
  findCurrentYear: jest.fn().mockResolvedValue({ id: 'year-uuid' }),
};

const mockSchedulesReadFacade = {
  hasAppliedSchedule: jest.fn().mockResolvedValue(true),
  getTeacherAssignmentsForYear: jest.fn().mockResolvedValue([]),
};

const mockClassesReadFacade = {
  findClassIdsByStaff: jest.fn().mockResolvedValue([]),
  // Round-2 QA: open() validates classes via this generic helper. Default to
  // an empty array; tests that pass homeroom_assignments override per case.
  findClassesGeneric: jest.fn().mockResolvedValue([]),
};

const mockStaffProfileReadFacade = {
  resolveProfileId: jest.fn().mockResolvedValue('staff-uuid'),
  // Round-2 QA: open() validates staff via this generic helper. Same default.
  findManyGeneric: jest.fn().mockResolvedValue([]),
};

const baseWindow = {
  id: WINDOW_ID,
  tenant_id: TENANT_ID,
  academic_period_id: PERIOD_ID,
  academic_year_id: 'year-uuid',
  opens_at: new Date('2026-04-01T08:00:00Z'),
  closes_at: new Date('2026-04-10T17:00:00Z'),
  status: 'open' as const,
  opened_by_user_id: USER_ID,
  closed_at: null,
  closed_by_user_id: null,
  instructions: null,
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ReportCommentWindowsService', () => {
  let service: ReportCommentWindowsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCommentWindow.create.mockReset();
    mockRlsTx.reportCommentWindow.update.mockReset();
    mockRlsTx.reportCommentWindowHomeroom.createMany.mockReset().mockResolvedValue({ count: 0 });
    mockAcademicReadFacade.findPeriodById.mockReset();
    mockAcademicReadFacade.findCurrentYear.mockReset().mockResolvedValue({ id: 'year-uuid' });
    mockClassesReadFacade.findClassIdsByStaff.mockReset().mockResolvedValue([]);
    mockClassesReadFacade.findClassesGeneric.mockReset().mockResolvedValue([]);
    mockSchedulesReadFacade.hasAppliedSchedule.mockReset().mockResolvedValue(true);
    mockSchedulesReadFacade.getTeacherAssignmentsForYear.mockReset().mockResolvedValue([]);
    mockStaffProfileReadFacade.resolveProfileId.mockReset().mockResolvedValue('staff-uuid');
    mockStaffProfileReadFacade.findManyGeneric.mockReset().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCommentWindowsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AcademicReadFacade, useValue: mockAcademicReadFacade },
        { provide: ClassesReadFacade, useValue: mockClassesReadFacade },
        { provide: SchedulesReadFacade, useValue: mockSchedulesReadFacade },
        { provide: StaffProfileReadFacade, useValue: mockStaffProfileReadFacade },
      ],
    }).compile();

    service = module.get<ReportCommentWindowsService>(ReportCommentWindowsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findActive ────────────────────────────────────────────────────────────

  describe('findActive', () => {
    it('should return the open window when one exists', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(baseWindow);
      const result = await service.findActive(TENANT_ID);
      expect(result).toEqual(baseWindow);
      expect(mockPrisma.reportCommentWindow.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: 'open' },
          orderBy: { opens_at: 'desc' },
        }),
      );
    });

    it('should return null when no window is open', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      const result = await service.findActive(TENANT_ID);
      expect(result).toBeNull();
    });
  });

  // ─── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return the window when found', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(baseWindow);
      const result = await service.findById(TENANT_ID, WINDOW_ID);
      expect(result).toEqual(baseWindow);
    });

    it('should throw NotFoundException when window does not exist', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      await expect(service.findById(TENANT_ID, WINDOW_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return paginated results', async () => {
      mockPrisma.reportCommentWindow.findMany.mockResolvedValue([baseWindow]);
      mockPrisma.reportCommentWindow.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 });
      expect(result).toEqual({
        data: [baseWindow],
        meta: { page: 1, pageSize: 20, total: 1 },
      });
    });

    it('should apply status filter when provided', async () => {
      mockPrisma.reportCommentWindow.findMany.mockResolvedValue([]);
      mockPrisma.reportCommentWindow.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { status: 'closed' });
      expect(mockPrisma.reportCommentWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: 'closed' },
        }),
      );
    });
  });

  // ─── open ──────────────────────────────────────────────────────────────────

  describe('open', () => {
    const dto = {
      academic_period_id: PERIOD_ID,
      opens_at: new Date('2030-01-01T08:00:00Z').toISOString(),
      closes_at: new Date('2030-01-10T17:00:00Z').toISOString(),
      instructions: 'Term 1 comments',
    };

    it('should create a scheduled window when opens_at is in the future', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      mockAcademicReadFacade.findPeriodById.mockResolvedValue({ id: PERIOD_ID });
      mockRlsTx.reportCommentWindow.create.mockResolvedValue({
        ...baseWindow,
        status: 'scheduled',
      });

      const result = await service.open(TENANT_ID, USER_ID, dto);
      expect(result.status).toBe('scheduled');
      expect(mockRlsTx.reportCommentWindow.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          academic_period_id: PERIOD_ID,
          status: 'scheduled',
          opened_by_user_id: USER_ID,
        }),
      });
    });

    it('should create an open window when opens_at is in the past', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      mockAcademicReadFacade.findPeriodById.mockResolvedValue({ id: PERIOD_ID });
      mockRlsTx.reportCommentWindow.create.mockResolvedValue(baseWindow);

      await service.open(TENANT_ID, USER_ID, {
        ...dto,
        opens_at: new Date('2020-01-01T08:00:00Z').toISOString(),
      });
      expect(mockRlsTx.reportCommentWindow.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'open' }),
      });
    });

    it('should reject when another window is already open', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(baseWindow);
      await expect(service.open(TENANT_ID, USER_ID, dto)).rejects.toThrow(ConflictException);
    });

    it('should reject when academic period does not exist', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      mockAcademicReadFacade.findPeriodById.mockResolvedValue(null);
      await expect(service.open(TENANT_ID, USER_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should translate unique constraint violation to ConflictException', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      mockAcademicReadFacade.findPeriodById.mockResolvedValue({ id: PERIOD_ID });
      const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      });
      mockRlsTx.reportCommentWindow.create.mockRejectedValue(p2002);
      await expect(service.open(TENANT_ID, USER_ID, dto)).rejects.toThrow(ConflictException);
    });

    // ─── homeroom assignments (round-2 QA) ────────────────────────────────

    const CLASS_A = 'aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const CLASS_B = 'aaaaaaa2-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const STAFF_A = 'bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const STAFF_B = 'bbbbbbb2-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const ACADEMIC_YEAR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    it('should insert homeroom assignment rows alongside the window', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      mockAcademicReadFacade.findPeriodById.mockResolvedValue({
        id: PERIOD_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
      });
      mockClassesReadFacade.findClassesGeneric.mockResolvedValue([
        { id: CLASS_A, academic_year_id: ACADEMIC_YEAR_ID },
        { id: CLASS_B, academic_year_id: ACADEMIC_YEAR_ID },
      ]);
      mockStaffProfileReadFacade.findManyGeneric.mockResolvedValue([
        { id: STAFF_A },
        { id: STAFF_B },
      ]);
      mockRlsTx.reportCommentWindow.create.mockResolvedValue({ ...baseWindow, status: 'open' });

      await service.open(TENANT_ID, USER_ID, {
        ...dto,
        opens_at: new Date('2020-01-01T08:00:00Z').toISOString(),
        homeroom_assignments: [
          { class_id: CLASS_A, homeroom_teacher_staff_id: STAFF_A },
          { class_id: CLASS_B, homeroom_teacher_staff_id: STAFF_B },
        ],
      });

      expect(mockRlsTx.reportCommentWindowHomeroom.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            comment_window_id: WINDOW_ID,
            class_id: CLASS_A,
            homeroom_teacher_staff_id: STAFF_A,
          }),
          expect.objectContaining({
            comment_window_id: WINDOW_ID,
            class_id: CLASS_B,
            homeroom_teacher_staff_id: STAFF_B,
          }),
        ]),
      });
    });

    it('should NOT call homeroom createMany when assignments are empty', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      mockAcademicReadFacade.findPeriodById.mockResolvedValue({
        id: PERIOD_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
      });
      mockRlsTx.reportCommentWindow.create.mockResolvedValue(baseWindow);

      await service.open(TENANT_ID, USER_ID, {
        ...dto,
        opens_at: new Date('2020-01-01T08:00:00Z').toISOString(),
      });

      expect(mockRlsTx.reportCommentWindowHomeroom.createMany).not.toHaveBeenCalled();
    });

    it('should reject homeroom_assignments referencing an unknown class', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      mockAcademicReadFacade.findPeriodById.mockResolvedValue({
        id: PERIOD_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
      });
      // Asked for two classes, only one returned → mismatch.
      mockClassesReadFacade.findClassesGeneric.mockResolvedValue([
        { id: CLASS_A, academic_year_id: ACADEMIC_YEAR_ID },
      ]);
      mockStaffProfileReadFacade.findManyGeneric.mockResolvedValue([
        { id: STAFF_A },
        { id: STAFF_B },
      ]);

      await expect(
        service.open(TENANT_ID, USER_ID, {
          ...dto,
          homeroom_assignments: [
            { class_id: CLASS_A, homeroom_teacher_staff_id: STAFF_A },
            { class_id: CLASS_B, homeroom_teacher_staff_id: STAFF_B },
          ],
        }),
      ).rejects.toMatchObject({ response: { code: 'HOMEROOM_CLASS_NOT_FOUND' } });
    });

    it('should reject homeroom_assignments referencing an unknown staff member', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      mockAcademicReadFacade.findPeriodById.mockResolvedValue({
        id: PERIOD_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
      });
      mockClassesReadFacade.findClassesGeneric.mockResolvedValue([
        { id: CLASS_A, academic_year_id: ACADEMIC_YEAR_ID },
      ]);
      mockStaffProfileReadFacade.findManyGeneric.mockResolvedValue([]);

      await expect(
        service.open(TENANT_ID, USER_ID, {
          ...dto,
          homeroom_assignments: [{ class_id: CLASS_A, homeroom_teacher_staff_id: STAFF_A }],
        }),
      ).rejects.toMatchObject({ response: { code: 'HOMEROOM_STAFF_NOT_FOUND' } });
    });

    it('should reject homeroom_assignments for a class on a different academic year', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      mockAcademicReadFacade.findPeriodById.mockResolvedValue({
        id: PERIOD_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
      });
      mockClassesReadFacade.findClassesGeneric.mockResolvedValue([
        { id: CLASS_A, academic_year_id: 'a-different-year-uuid' },
      ]);
      mockStaffProfileReadFacade.findManyGeneric.mockResolvedValue([{ id: STAFF_A }]);

      await expect(
        service.open(TENANT_ID, USER_ID, {
          ...dto,
          homeroom_assignments: [{ class_id: CLASS_A, homeroom_teacher_staff_id: STAFF_A }],
        }),
      ).rejects.toMatchObject({ response: { code: 'HOMEROOM_CLASS_WRONG_YEAR' } });
    });
  });

  // ─── getLandingScopeForActor ───────────────────────────────────────────────

  describe('getLandingScopeForActor', () => {
    // Shared fixtures for the competency × matrix join.
    // - Two classes in year group 4 (4A, 4B) + one in year group 5 (5A).
    // - Curriculum matrix: 4A teaches Maths + English; 4B teaches Maths;
    //   5A teaches Biology + English.
    const CLASSES = [
      { id: 'class-4a', year_group_id: 'yg-4' },
      { id: 'class-4b', year_group_id: 'yg-4' },
      { id: 'class-5a', year_group_id: 'yg-5' },
    ];
    const MATRIX = [
      { class_id: 'class-4a', subject_id: 'subj-maths' },
      { class_id: 'class-4a', subject_id: 'subj-english' },
      { class_id: 'class-4b', subject_id: 'subj-maths' },
      { class_id: 'class-5a', subject_id: 'subj-biology' },
      { class_id: 'class-5a', subject_id: 'subj-english' },
    ];

    beforeEach(() => {
      mockClassesReadFacade.findClassesGeneric.mockResolvedValue(CLASSES);
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue(MATRIX);
    });

    it('should return every matrix pair for an admin (no schedule dependency)', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValueOnce(baseWindow);

      const result = await service.getLandingScopeForActor(TENANT_ID, {
        userId: 'admin-uuid',
        isAdmin: true,
      });

      expect(result).toEqual({
        is_admin: true,
        overall_class_ids: [],
        subject_assignments: MATRIX,
        active_window_id: WINDOW_ID,
        no_timetable_applied: false,
      });
      expect(mockStaffProfileReadFacade.resolveProfileId).not.toHaveBeenCalled();
      expect(mockSchedulesReadFacade.hasAppliedSchedule).not.toHaveBeenCalled();
      expect(mockSchedulesReadFacade.getTeacherAssignmentsForYear).not.toHaveBeenCalled();
    });

    it('should return the teacher scheduled pairs from the live schedules table', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValueOnce(baseWindow);
      mockStaffProfileReadFacade.resolveProfileId.mockResolvedValueOnce('staff-uuid');
      mockPrisma.reportCommentWindowHomeroom.findMany.mockResolvedValueOnce([
        { class_id: 'class-4a' },
      ]);
      mockSchedulesReadFacade.hasAppliedSchedule.mockResolvedValueOnce(true);
      mockSchedulesReadFacade.getTeacherAssignmentsForYear.mockResolvedValueOnce([
        { class_id: 'class-4a', subject_id: 'subj-maths' },
        { class_id: 'class-4b', subject_id: 'subj-maths' },
      ]);

      const result = await service.getLandingScopeForActor(TENANT_ID, {
        userId: 'teacher-uuid',
        isAdmin: false,
      });

      expect(result).toEqual({
        is_admin: false,
        overall_class_ids: ['class-4a'],
        subject_assignments: [
          { class_id: 'class-4a', subject_id: 'subj-maths' },
          { class_id: 'class-4b', subject_id: 'subj-maths' },
        ],
        active_window_id: WINDOW_ID,
        no_timetable_applied: false,
      });
      expect(mockSchedulesReadFacade.getTeacherAssignmentsForYear).toHaveBeenCalledWith(
        TENANT_ID,
        'year-uuid',
        'staff-uuid',
      );
    });

    it('should surface no_timetable_applied when no schedule has been applied', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValueOnce(baseWindow);
      mockStaffProfileReadFacade.resolveProfileId.mockResolvedValueOnce('staff-uuid');
      mockPrisma.reportCommentWindowHomeroom.findMany.mockResolvedValueOnce([
        { class_id: 'class-4a' },
      ]);
      mockSchedulesReadFacade.hasAppliedSchedule.mockResolvedValueOnce(false);

      const result = await service.getLandingScopeForActor(TENANT_ID, {
        userId: 'teacher-uuid',
        isAdmin: false,
      });

      expect(result).toEqual({
        is_admin: false,
        overall_class_ids: ['class-4a'],
        subject_assignments: [],
        active_window_id: WINDOW_ID,
        no_timetable_applied: true,
      });
      expect(mockSchedulesReadFacade.getTeacherAssignmentsForYear).not.toHaveBeenCalled();
    });

    it('should return empty overall + subject pairs when no window is open', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValueOnce(null);
      mockStaffProfileReadFacade.resolveProfileId.mockResolvedValueOnce('staff-uuid');
      mockSchedulesReadFacade.hasAppliedSchedule.mockResolvedValueOnce(true);
      mockSchedulesReadFacade.getTeacherAssignmentsForYear.mockResolvedValueOnce([
        { class_id: 'class-5a', subject_id: 'subj-biology' },
      ]);

      const result = await service.getLandingScopeForActor(TENANT_ID, {
        userId: 'teacher-uuid',
        isAdmin: false,
      });
      // Subject assignments still come back (teaching assignments are
      // window-independent), but overall_class_ids is empty because
      // nothing is open for the teacher to write to.
      expect(result.overall_class_ids).toEqual([]);
      expect(result.subject_assignments).toEqual([
        { class_id: 'class-5a', subject_id: 'subj-biology' },
      ]);
      expect(result.active_window_id).toBeNull();
    });

    it('should return empty arrays when the actor has no staff profile', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValueOnce(baseWindow);
      mockStaffProfileReadFacade.resolveProfileId.mockRejectedValueOnce(
        new NotFoundException({ code: 'STAFF_PROFILE_NOT_FOUND', message: 'no profile' }),
      );
      const result = await service.getLandingScopeForActor(TENANT_ID, {
        userId: 'rando-uuid',
        isAdmin: false,
      });
      expect(result.overall_class_ids).toEqual([]);
      expect(result.subject_assignments).toEqual([]);
      expect(result.no_timetable_applied).toBe(false);
      expect(mockSchedulesReadFacade.hasAppliedSchedule).not.toHaveBeenCalled();
    });

    it('should return empty pairs when the teacher has no scheduled classes', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValueOnce(baseWindow);
      mockStaffProfileReadFacade.resolveProfileId.mockResolvedValueOnce('staff-uuid');
      mockSchedulesReadFacade.hasAppliedSchedule.mockResolvedValueOnce(true);
      mockSchedulesReadFacade.getTeacherAssignmentsForYear.mockResolvedValueOnce([]);

      const result = await service.getLandingScopeForActor(TENANT_ID, {
        userId: 'teacher-uuid',
        isAdmin: false,
      });
      expect(result.subject_assignments).toEqual([]);
      expect(result.no_timetable_applied).toBe(false);
    });
  });

  // ─── getHomeroomTeacherForClass ────────────────────────────────────────────

  describe('getHomeroomTeacherForClass', () => {
    const SCOPE = { periodId: PERIOD_ID, yearId: 'year-uuid' };

    it('should return null when no window is open for the scope', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValueOnce(null);
      const result = await service.getHomeroomTeacherForClass(TENANT_ID, SCOPE, 'class-uuid');
      expect(result).toBeNull();
    });

    it('should return null when no homeroom is assigned for this class', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValueOnce(baseWindow);
      mockPrisma.reportCommentWindowHomeroom.findFirst.mockResolvedValueOnce(null);
      const result = await service.getHomeroomTeacherForClass(TENANT_ID, SCOPE, 'class-uuid');
      expect(result).toBeNull();
    });

    it('should return the assigned teacher staff_profile_id and user_id', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValueOnce(baseWindow);
      mockPrisma.reportCommentWindowHomeroom.findFirst.mockResolvedValueOnce({
        homeroom_teacher_staff_id: 'staff-uuid',
        staff_profile: { user_id: 'user-uuid' },
      });
      const result = await service.getHomeroomTeacherForClass(TENANT_ID, SCOPE, 'class-uuid');
      expect(result).toEqual({
        staff_profile_id: 'staff-uuid',
        user_id: 'user-uuid',
        comment_window_id: WINDOW_ID,
      });
    });
  });

  // ─── closeNow ──────────────────────────────────────────────────────────────

  describe('closeNow', () => {
    it('should close an open window', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(baseWindow);
      mockRlsTx.reportCommentWindow.update.mockResolvedValue({
        ...baseWindow,
        status: 'closed',
      });
      const result = await service.closeNow(TENANT_ID, USER_ID, WINDOW_ID);
      expect(result.status).toBe('closed');
      expect(mockRlsTx.reportCommentWindow.update).toHaveBeenCalledWith({
        where: { id: WINDOW_ID },
        data: expect.objectContaining({
          status: 'closed',
          closed_by_user_id: USER_ID,
        }),
      });
    });

    it('should reject closing an already closed window', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue({
        ...baseWindow,
        status: 'closed',
      });
      await expect(service.closeNow(TENANT_ID, USER_ID, WINDOW_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── extend ────────────────────────────────────────────────────────────────

  describe('extend', () => {
    it('should extend an open window', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(baseWindow);
      mockRlsTx.reportCommentWindow.update.mockResolvedValue(baseWindow);
      const newClose = new Date('2026-04-20T17:00:00Z');
      await service.extend(TENANT_ID, USER_ID, WINDOW_ID, newClose);
      expect(mockRlsTx.reportCommentWindow.update).toHaveBeenCalledWith({
        where: { id: WINDOW_ID },
        data: { closes_at: newClose },
      });
    });

    it('should reject extending a closed window', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue({
        ...baseWindow,
        status: 'closed',
      });
      await expect(
        service.extend(TENANT_ID, USER_ID, WINDOW_ID, new Date('2030-01-01T00:00:00Z')),
      ).rejects.toThrow(BadRequestException);
    });

    it('edge: should reject new closes_at earlier than opens_at', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(baseWindow);
      await expect(
        service.extend(TENANT_ID, USER_ID, WINDOW_ID, new Date('2020-01-01T00:00:00Z')),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── reopen ────────────────────────────────────────────────────────────────

  describe('reopen', () => {
    it('should reopen a closed window', async () => {
      mockPrisma.reportCommentWindow.findFirst
        .mockResolvedValueOnce({ ...baseWindow, status: 'closed' })
        .mockResolvedValueOnce(null);
      mockRlsTx.reportCommentWindow.update.mockResolvedValue(baseWindow);
      const result = await service.reopen(TENANT_ID, USER_ID, WINDOW_ID);
      expect(result).toEqual(baseWindow);
      expect(mockRlsTx.reportCommentWindow.update).toHaveBeenCalledWith({
        where: { id: WINDOW_ID },
        data: { status: 'open', closed_at: null, closed_by_user_id: null },
      });
    });

    it('should reject reopening an already open window', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(baseWindow);
      await expect(service.reopen(TENANT_ID, USER_ID, WINDOW_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject when another window is already open', async () => {
      mockPrisma.reportCommentWindow.findFirst
        .mockResolvedValueOnce({ ...baseWindow, status: 'closed' })
        .mockResolvedValueOnce({ ...baseWindow, id: 'other-window' });
      await expect(service.reopen(TENANT_ID, USER_ID, WINDOW_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── assertWindowOpenForPeriod ─────────────────────────────────────────────

  describe('assertWindowOpenForPeriod', () => {
    it('should resolve silently when an open window exists', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue({
        ...baseWindow,
        closes_at: new Date(Date.now() + 60_000),
      });
      await expect(
        service.assertWindowOpenForPeriod(TENANT_ID, PERIOD_ID),
      ).resolves.toBeUndefined();
    });

    it('should throw COMMENT_WINDOW_CLOSED when no open window exists', async () => {
      mockPrisma.reportCommentWindow.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      await expect(service.assertWindowOpenForPeriod(TENANT_ID, PERIOD_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw COMMENT_WINDOW_CLOSED when the open row has already expired', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue({
        ...baseWindow,
        closes_at: new Date(Date.now() - 60_000),
      });
      await expect(service.assertWindowOpenForPeriod(TENANT_ID, PERIOD_ID)).rejects.toMatchObject({
        response: { code: 'COMMENT_WINDOW_CLOSED' },
      });
    });
  });
});
