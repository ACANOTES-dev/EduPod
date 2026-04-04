import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { GradebookReadFacade } from '../gradebook/gradebook-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { TeacherCompetenciesService } from './teacher-competencies.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AY_ID = 'ay-1';
const AY_ID_TARGET = 'ay-2';
const STAFF_ID = 'staff-1';
const SUBJECT_ID = 'sub-1';
const YG_ID = 'yg-1';
const COMP_ID = 'comp-1';

const mockTx = {
  teacherCompetency: {
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('TeacherCompetenciesService', () => {
  let service: TeacherCompetenciesService;
  let module: TestingModule;
  let mockPrisma: {
    teacherCompetency: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    staffProfile: { findFirst: jest.Mock };
    subject: { findFirst: jest.Mock };
    yearGroup: { findFirst: jest.Mock };
    academicYear: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      teacherCompetency: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      staffProfile: { findFirst: jest.fn() },
      subject: { findFirst: jest.fn() },
      yearGroup: { findFirst: jest.fn() },
      academicYear: { findFirst: jest.fn() },
    };

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
          provide: ClassesReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
            existsOrThrow: jest.fn().mockResolvedValue(undefined),
            findEnrolledStudentIds: jest.fn().mockResolvedValue([]),
            countEnrolledStudents: jest.fn().mockResolvedValue(0),
            findOtherClassEnrolmentsForStudents: jest.fn().mockResolvedValue([]),
            findByAcademicYear: jest.fn().mockResolvedValue([]),
            findByYearGroup: jest.fn().mockResolvedValue([]),
            findIdsByAcademicYear: jest.fn().mockResolvedValue([]),
            countByAcademicYear: jest.fn().mockResolvedValue(0),
            findClassesWithoutTeachers: jest.fn().mockResolvedValue([]),
            findClassIdsForStudent: jest.fn().mockResolvedValue([]),
            findEnrolmentPairsForAcademicYear: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: GradebookReadFacade,
          useValue: {
            findClassSubjectConfigs: jest.fn().mockResolvedValue([]),
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
        TeacherCompetenciesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TeacherCompetenciesService>(TeacherCompetenciesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listAll ─────────────────────────────────────────────────────────────────

  describe('listAll', () => {
    it('should return all competencies for an academic year', async () => {
      const records = [{ id: COMP_ID, staff_profile_id: STAFF_ID, subject_id: SUBJECT_ID }];
      mockPrisma.teacherCompetency.findMany.mockResolvedValue(records);

      const result = await service.listAll(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(1);
      expect(mockPrisma.teacherCompetency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, academic_year_id: AY_ID },
        }),
      );
    });

    it('should return empty data when none exist', async () => {
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);

      const result = await service.listAll(TENANT_ID, AY_ID);

      expect(result.data).toHaveLength(0);
    });
  });

  // ─── listByTeacher ───────────────────────────────────────────────────────────

  describe('listByTeacher', () => {
    it('should return competencies filtered by teacher', async () => {
      const records = [{ id: COMP_ID, staff_profile_id: STAFF_ID }];
      mockPrisma.teacherCompetency.findMany.mockResolvedValue(records);

      const result = await service.listByTeacher(TENANT_ID, AY_ID, STAFF_ID);

      expect(result.data).toHaveLength(1);
      expect(mockPrisma.teacherCompetency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ staff_profile_id: STAFF_ID }),
        }),
      );
    });
  });

  // ─── listBySubjectYear ───────────────────────────────────────────────────────

  describe('listBySubjectYear', () => {
    it('should return competencies for a specific subject and year group', async () => {
      const records = [{ id: COMP_ID, subject_id: SUBJECT_ID, year_group_id: YG_ID }];
      mockPrisma.teacherCompetency.findMany.mockResolvedValue(records);

      const result = await service.listBySubjectYear(TENANT_ID, AY_ID, SUBJECT_ID, YG_ID);

      expect(result.data).toHaveLength(1);
      expect(mockPrisma.teacherCompetency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            subject_id: SUBJECT_ID,
            year_group_id: YG_ID,
          }),
        }),
      );
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      staff_profile_id: STAFF_ID,
      subject_id: SUBJECT_ID,
      year_group_id: YG_ID,
      academic_year_id: AY_ID,
      is_primary: true,
    };

    it('should create a competency when all relations are valid', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_ID });
      mockPrisma.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: YG_ID });
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      mockTx.teacherCompetency.create.mockResolvedValue({ id: COMP_ID, ...dto });

      const result = await service.create(TENANT_ID, dto);

      expect(result).toEqual(expect.objectContaining({ id: COMP_ID }));
    });

    it('should throw NotFoundException when staff does not exist', async () => {
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.existsOrThrow as jest.Mock).mockRejectedValue(new NotFoundException('Staff not found'));

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when subject does not exist', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findSubjectByIdOrThrow as jest.Mock).mockRejectedValue(new NotFoundException('Subject not found'));

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── bulkCreate ──────────────────────────────────────────────────────────────

  describe('bulkCreate', () => {
    const dto = {
      staff_profile_id: STAFF_ID,
      academic_year_id: AY_ID,
      competencies: [{ subject_id: SUBJECT_ID, year_group_id: YG_ID, is_primary: true }],
    };

    it('should bulk create competencies', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_ID });
      mockTx.teacherCompetency.create.mockResolvedValue({ id: 'new-comp' });

      const result = await service.bulkCreate(TENANT_ID, dto);

      expect(result.data).toHaveLength(1);
      expect(result.meta.created).toBe(1);
    });

    it('should throw NotFoundException when staff profile does not exist', async () => {
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.existsOrThrow as jest.Mock).mockRejectedValue(new NotFoundException('Staff not found'));

      await expect(service.bulkCreate(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update a competency', async () => {
      mockPrisma.teacherCompetency.findFirst.mockResolvedValue({ id: COMP_ID });
      mockPrisma.teacherCompetency.update.mockResolvedValue({ id: COMP_ID, is_primary: false });

      const result = await service.update(TENANT_ID, COMP_ID, { is_primary: false });

      expect(result).toEqual(expect.objectContaining({ id: COMP_ID, is_primary: false }));
    });

    it('should throw NotFoundException when competency does not exist', async () => {
      mockPrisma.teacherCompetency.findFirst.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, 'nonexistent', { is_primary: true })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete a competency', async () => {
      mockPrisma.teacherCompetency.findFirst.mockResolvedValue({ id: COMP_ID });
      mockTx.teacherCompetency.delete.mockResolvedValue({ id: COMP_ID });

      const result = await service.delete(TENANT_ID, COMP_ID);

      expect(result.message).toBe('Teacher competency deleted');
    });

    it('should throw NotFoundException when competency does not exist', async () => {
      mockPrisma.teacherCompetency.findFirst.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteAllForTeacher ─────────────────────────────────────────────────────

  describe('deleteAllForTeacher', () => {
    it('should delete all competencies for a teacher', async () => {
      mockTx.teacherCompetency.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.deleteAllForTeacher(TENANT_ID, AY_ID, STAFF_ID);

      expect(result.message).toBe('All competencies deleted');
      expect(result.meta.deleted).toBe(3);
    });

    it('should return zero deleted when teacher has no competencies', async () => {
      mockTx.teacherCompetency.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.deleteAllForTeacher(TENANT_ID, AY_ID, STAFF_ID);

      expect(result.meta.deleted).toBe(0);
    });
  });

  // ─── copyFromAcademicYear ────────────────────────────────────────────────────

  describe('copyFromAcademicYear', () => {
    it('should copy competencies from source to target year', async () => {
      // findYearByIdOrThrow resolves by default from facade mock
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        {
          id: COMP_ID,
          staff_profile_id: STAFF_ID,
          subject_id: SUBJECT_ID,
          year_group_id: YG_ID,
          is_primary: true,
        },
      ]);
      mockTx.teacherCompetency.create.mockResolvedValue({ id: 'new-comp' });

      const result = await service.copyFromAcademicYear(TENANT_ID, AY_ID, AY_ID_TARGET);

      expect(result.data).toHaveLength(1);
      expect(result.meta.copied).toBe(1);
    });

    it('should throw NotFoundException when source year does not exist', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearByIdOrThrow as jest.Mock).mockRejectedValue(new NotFoundException('Year not found'));

      await expect(
        service.copyFromAcademicYear(TENANT_ID, 'nonexistent', AY_ID_TARGET),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when target year does not exist', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearByIdOrThrow as jest.Mock)
        .mockResolvedValueOnce({ id: AY_ID })
        .mockRejectedValueOnce(new NotFoundException('Year not found'));

      await expect(service.copyFromAcademicYear(TENANT_ID, AY_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when source has no data', async () => {
      // findYearByIdOrThrow resolves by default from facade mock
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);

      await expect(service.copyFromAcademicYear(TENANT_ID, AY_ID, AY_ID_TARGET)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
