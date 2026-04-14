import { Test, TestingModule } from '@nestjs/testing';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { TeachingAllocationsService } from './teaching-allocations.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const STAFF_ID = 'staff-1';
const AY_ID = 'ay-1';
const YG_ID = 'yg-1';
const CLASS_ID = 'class-1';
const SUBJECT_ID = 'subj-1';

describe('TeachingAllocationsService', () => {
  let service: TeachingAllocationsService;
  let module: TestingModule;
  let mockPrisma: {
    classSubjectGradeConfig: { findMany: jest.Mock };
    assessmentCategory: { findMany: jest.Mock };
    teacherGradingWeight: { findMany: jest.Mock };
    assessment: { groupBy: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      classSubjectGradeConfig: { findMany: jest.fn().mockResolvedValue([]) },
      assessmentCategory: { findMany: jest.fn().mockResolvedValue([]) },
      teacherGradingWeight: { findMany: jest.fn().mockResolvedValue([]) },
      assessment: { groupBy: jest.fn().mockResolvedValue([]) },
    };

    module = await Test.createTestingModule({
      providers: [
        TeachingAllocationsService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: StaffProfileReadFacade,
          useValue: {
            resolveProfileId: jest.fn().mockResolvedValue(STAFF_ID),
            findByIds: jest
              .fn()
              .mockResolvedValue([
                { id: STAFF_ID, user: { first_name: 'Sarah', last_name: 'Daly' } },
              ]),
          },
        },
        {
          provide: AcademicReadFacade,
          useValue: {
            findCurrentYear: jest.fn().mockResolvedValue({ id: AY_ID }),
            findSubjectsByIds: jest
              .fn()
              .mockResolvedValue([{ id: SUBJECT_ID, name: 'Mathematics', code: 'MATH' }]),
            findAllYearGroups: jest.fn().mockResolvedValue([{ id: YG_ID, name: '4th Class' }]),
          },
        },
        {
          provide: SchedulesReadFacade,
          useValue: {
            hasAppliedSchedule: jest.fn().mockResolvedValue(true),
            getTeacherAssignmentsForYear: jest.fn().mockResolvedValue([]),
            getAllAssignmentsForYear: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ClassesReadFacade,
          useValue: {
            findByAcademicYear: jest
              .fn()
              .mockResolvedValue([
                { id: CLASS_ID, name: '4A', year_group_id: YG_ID, status: 'active' },
              ]),
          },
        },
      ],
    }).compile();

    service = module.get(TeachingAllocationsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getMyAllocations ──────────────────────────────────────────────────────

  describe('getMyAllocations', () => {
    it('returns no_timetable_applied when there is no active academic year', async () => {
      (module.get(AcademicReadFacade).findCurrentYear as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.getMyAllocations(TENANT_ID, USER_ID);
      expect(result).toEqual({ data: [], meta: { reason: 'no_timetable_applied' } });
    });

    it('returns no_timetable_applied when user has no staff profile', async () => {
      (module.get(StaffProfileReadFacade).resolveProfileId as jest.Mock).mockRejectedValueOnce(
        new Error('No profile'),
      );

      const result = await service.getMyAllocations(TENANT_ID, USER_ID);
      expect(result.meta.reason).toBe('no_timetable_applied');
      expect(result.data).toEqual([]);
    });

    it('returns no_timetable_applied when the schedules table is empty for the year', async () => {
      (module.get(SchedulesReadFacade).hasAppliedSchedule as jest.Mock).mockResolvedValueOnce(
        false,
      );

      const result = await service.getMyAllocations(TENANT_ID, USER_ID);
      expect(result.meta.reason).toBe('no_timetable_applied');
      expect(result.data).toEqual([]);
    });

    it('returns hydrated allocations when the teacher has scheduled classes', async () => {
      (
        module.get(SchedulesReadFacade).getTeacherAssignmentsForYear as jest.Mock
      ).mockResolvedValueOnce([{ class_id: CLASS_ID, subject_id: SUBJECT_ID }]);

      const result = await service.getMyAllocations(TENANT_ID, USER_ID);

      expect(result.meta.reason).toBe('ok');
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        class_id: CLASS_ID,
        class_name: '4A',
        subject_id: SUBJECT_ID,
        subject_name: 'Mathematics',
        teacher_name: 'Sarah Daly',
        year_group_name: '4th Class',
      });
      // is_primary must not leak into the response shape.
      expect(result.data[0]).not.toHaveProperty('is_primary');
    });

    it('returns meta.reason=ok with empty data if the teacher is unscheduled but others are', async () => {
      (module.get(SchedulesReadFacade).hasAppliedSchedule as jest.Mock).mockResolvedValueOnce(true);
      (
        module.get(SchedulesReadFacade).getTeacherAssignmentsForYear as jest.Mock
      ).mockResolvedValueOnce([]);

      const result = await service.getMyAllocations(TENANT_ID, USER_ID);
      expect(result).toEqual({ data: [], meta: { reason: 'ok' } });
    });
  });

  // ─── getAllAllocations ─────────────────────────────────────────────────────

  describe('getAllAllocations', () => {
    it('returns no_timetable_applied when schedules table is empty', async () => {
      (module.get(SchedulesReadFacade).hasAppliedSchedule as jest.Mock).mockResolvedValueOnce(
        false,
      );
      const result = await service.getAllAllocations(TENANT_ID);
      expect(result.meta.reason).toBe('no_timetable_applied');
    });

    it('returns hydrated triples across teachers', async () => {
      (module.get(SchedulesReadFacade).getAllAssignmentsForYear as jest.Mock).mockResolvedValueOnce(
        [{ class_id: CLASS_ID, subject_id: SUBJECT_ID, teacher_staff_id: STAFF_ID }],
      );

      const result = await service.getAllAllocations(TENANT_ID);
      expect(result.meta.reason).toBe('ok');
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.teacher_name).toBe('Sarah Daly');
    });
  });

  // ─── getClassAllocations ───────────────────────────────────────────────────

  describe('getClassAllocations', () => {
    it('filters getAllAllocations by class_id', async () => {
      (module.get(SchedulesReadFacade).getAllAssignmentsForYear as jest.Mock).mockResolvedValueOnce(
        [
          { class_id: CLASS_ID, subject_id: SUBJECT_ID, teacher_staff_id: STAFF_ID },
          { class_id: 'class-other', subject_id: SUBJECT_ID, teacher_staff_id: STAFF_ID },
        ],
      );
      (module.get(ClassesReadFacade).findByAcademicYear as jest.Mock).mockResolvedValueOnce([
        { id: CLASS_ID, name: '4A', year_group_id: YG_ID, status: 'active' },
        { id: 'class-other', name: '4B', year_group_id: YG_ID, status: 'active' },
      ]);

      const result = await service.getClassAllocations(TENANT_ID, CLASS_ID);
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.class_id).toBe(CLASS_ID);
    });
  });
});
