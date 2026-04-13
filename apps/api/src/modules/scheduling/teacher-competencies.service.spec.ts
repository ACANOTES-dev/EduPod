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
      (staffFacade.existsOrThrow as jest.Mock).mockRejectedValue(
        new NotFoundException('Staff not found'),
      );

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when subject does not exist', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findSubjectByIdOrThrow as jest.Mock).mockRejectedValue(
        new NotFoundException('Subject not found'),
      );

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── bulkCreate ──────────────────────────────────────────────────────────────

  describe('bulkCreate', () => {
    const dto = {
      staff_profile_id: STAFF_ID,
      academic_year_id: AY_ID,
      competencies: [{ subject_id: SUBJECT_ID, year_group_id: YG_ID }],
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
      (staffFacade.existsOrThrow as jest.Mock).mockRejectedValue(
        new NotFoundException('Staff not found'),
      );

      await expect(service.bulkCreate(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    // is_primary was the only mutable field and it was dropped in Stage 1 of the
    // scheduler rebuild. The endpoint now just resolves the row by id; Stage 3
    // rebuilds the API around class_id.
    it('should return the existing competency by id', async () => {
      mockPrisma.teacherCompetency.findFirst.mockResolvedValue({ id: COMP_ID });

      const result = await service.update(TENANT_ID, COMP_ID);

      expect(result).toEqual(expect.objectContaining({ id: COMP_ID }));
    });

    it('should throw NotFoundException when competency does not exist', async () => {
      mockPrisma.teacherCompetency.findFirst.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
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
        },
      ]);
      mockTx.teacherCompetency.create.mockResolvedValue({ id: 'new-comp' });

      const result = await service.copyFromAcademicYear(TENANT_ID, AY_ID, AY_ID_TARGET);

      expect(result.data).toHaveLength(1);
      expect(result.meta.copied).toBe(1);
    });

    it('should throw NotFoundException when source year does not exist', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearByIdOrThrow as jest.Mock).mockRejectedValue(
        new NotFoundException('Year not found'),
      );

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

  // ─── copyToYears ────────────────────────────────────────────────────────────

  describe('copyToYears', () => {
    const _mockTxWithFind = {
      ...mockTx,
      teacherCompetency: {
        ...mockTx.teacherCompetency,
        findFirst: jest.fn(),
        create: mockTx.teacherCompetency.create,
      },
    };

    it('should copy competencies to multiple target year groups', async () => {
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        {
          staff_profile_id: STAFF_ID,
          subject_id: SUBJECT_ID,
          year_group_id: 'source-yg',
        },
      ]);
      mockTx.teacherCompetency.create.mockResolvedValue({});

      // Mock findFirst inside the transaction to return null (no existing competency)
      const originalTxImpl = jest.requireMock('../../common/middleware/rls.middleware');
      const mockTxProxy = new Proxy(mockTx, {
        get(target, prop) {
          if (prop === 'teacherCompetency') {
            return {
              ...target.teacherCompetency,
              findFirst: jest.fn().mockResolvedValue(null),
            };
          }
          return (target as Record<string, unknown>)[prop as string];
        },
      });
      (originalTxImpl.createRlsClient as jest.Mock).mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTxProxy)),
      });

      const result = await service.copyToYears(TENANT_ID, {
        academic_year_id: AY_ID,
        source_year_group_id: 'source-yg',
        targets: [{ year_group_id: 'target-yg-1', subject_ids: [SUBJECT_ID] }],
      });

      expect(result.data.copied).toBe(1);
      expect(result.data.skipped).toBe(0);
    });

    it('should throw BadRequestException when source has no competencies', async () => {
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);

      await expect(
        service.copyToYears(TENANT_ID, {
          academic_year_id: AY_ID,
          source_year_group_id: 'source-yg',
          targets: [{ year_group_id: 'target-yg-1', subject_ids: [SUBJECT_ID] }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should skip when competency already exists in target', async () => {
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        {
          staff_profile_id: STAFF_ID,
          subject_id: SUBJECT_ID,
          year_group_id: 'source-yg',
        },
      ]);

      const originalTxImpl = jest.requireMock('../../common/middleware/rls.middleware');
      const mockTxWithExisting = new Proxy(mockTx, {
        get(target, prop) {
          if (prop === 'teacherCompetency') {
            return {
              ...target.teacherCompetency,
              findFirst: jest.fn().mockResolvedValue({ id: 'existing-comp' }),
            };
          }
          return (target as Record<string, unknown>)[prop as string];
        },
      });
      (originalTxImpl.createRlsClient as jest.Mock).mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
            fn(mockTxWithExisting),
          ),
      });

      const result = await service.copyToYears(TENANT_ID, {
        academic_year_id: AY_ID,
        source_year_group_id: 'source-yg',
        targets: [{ year_group_id: 'target-yg-1', subject_ids: [SUBJECT_ID] }],
      });

      expect(result.data.copied).toBe(0);
      expect(result.data.skipped).toBe(1);
    });
  });

  // ─── getCoverage ───���────────────────────────────────────────────────────────

  describe('getCoverage', () => {
    it('should return coverage matrix with gaps, at_risk, and covered counts', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findAllYearGroups as jest.Mock).mockResolvedValue([
        { id: YG_ID, name: 'Year 1' },
      ]);
      (acadFacade.findSubjectsByIdsWithOrder as jest.Mock).mockResolvedValue([
        { id: SUBJECT_ID, name: 'Maths' },
      ]);

      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findByAcademicYear as jest.Mock).mockResolvedValue([
        { id: 'cls-1', year_group_id: YG_ID, academic_year_id: AY_ID, status: 'active' },
      ]);

      const gradebookFacade = module.get(GradebookReadFacade);
      (gradebookFacade.findClassSubjectConfigs as jest.Mock).mockResolvedValue([
        {
          class_id: 'cls-1',
          subject_id: SUBJECT_ID,
          subject: { id: SUBJECT_ID, name: 'Maths' },
          class_name: 'Class 1',
        },
      ]);

      // 2 teachers assigned => "covered"
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        {
          year_group_id: YG_ID,
          subject_id: SUBJECT_ID,
          staff_profile: { id: 'sp-1', user: { first_name: 'Alice', last_name: 'Brown' } },
        },
        {
          year_group_id: YG_ID,
          subject_id: SUBJECT_ID,
          staff_profile: { id: 'sp-2', user: { first_name: 'Bob', last_name: 'Smith' } },
        },
      ]);

      const result = await service.getCoverage(TENANT_ID, AY_ID);

      expect(result.summary.covered).toBe(1);
      expect(result.summary.gaps).toBe(0);
      expect(result.summary.at_risk).toBe(0);
      expect(result.summary.total).toBe(1);
      expect(result.rows).toHaveLength(1);
      expect(result.subjects).toHaveLength(1);
    });

    it('should report gaps when no teacher is assigned', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findAllYearGroups as jest.Mock).mockResolvedValue([
        { id: YG_ID, name: 'Year 1' },
      ]);
      (acadFacade.findSubjectsByIdsWithOrder as jest.Mock).mockResolvedValue([
        { id: SUBJECT_ID, name: 'Maths' },
      ]);

      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findByAcademicYear as jest.Mock).mockResolvedValue([
        { id: 'cls-1', year_group_id: YG_ID, academic_year_id: AY_ID, status: 'active' },
      ]);

      const gradebookFacade = module.get(GradebookReadFacade);
      (gradebookFacade.findClassSubjectConfigs as jest.Mock).mockResolvedValue([
        {
          class_id: 'cls-1',
          subject_id: SUBJECT_ID,
          subject: { id: SUBJECT_ID, name: 'Maths' },
          class_name: 'Class 1',
        },
      ]);

      // No teachers assigned
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);

      const result = await service.getCoverage(TENANT_ID, AY_ID);

      expect(result.summary.gaps).toBe(1);
      expect(result.summary.covered).toBe(0);
    });

    it('should report at_risk when only one teacher is assigned', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findAllYearGroups as jest.Mock).mockResolvedValue([
        { id: YG_ID, name: 'Year 1' },
      ]);
      (acadFacade.findSubjectsByIdsWithOrder as jest.Mock).mockResolvedValue([
        { id: SUBJECT_ID, name: 'Maths' },
      ]);

      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findByAcademicYear as jest.Mock).mockResolvedValue([
        { id: 'cls-1', year_group_id: YG_ID, academic_year_id: AY_ID, status: 'active' },
      ]);

      const gradebookFacade = module.get(GradebookReadFacade);
      (gradebookFacade.findClassSubjectConfigs as jest.Mock).mockResolvedValue([
        {
          class_id: 'cls-1',
          subject_id: SUBJECT_ID,
          subject: { id: SUBJECT_ID, name: 'Maths' },
          class_name: 'Class 1',
        },
      ]);

      // Only one teacher
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        {
          year_group_id: YG_ID,
          subject_id: SUBJECT_ID,
          staff_profile: { id: 'sp-1', user: { first_name: 'Alice', last_name: 'Brown' } },
        },
      ]);

      const result = await service.getCoverage(TENANT_ID, AY_ID);

      expect(result.summary.at_risk).toBe(1);
      expect(result.summary.gaps).toBe(0);
    });

    it('should exclude inactive classes from coverage', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findAllYearGroups as jest.Mock).mockResolvedValue([
        { id: YG_ID, name: 'Year 1' },
      ]);

      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findByAcademicYear as jest.Mock).mockResolvedValue([
        { id: 'cls-1', year_group_id: YG_ID, academic_year_id: AY_ID, status: 'archived' },
      ]);

      const result = await service.getCoverage(TENANT_ID, AY_ID);

      // No active classes -> no subjects -> empty rows
      expect(result.rows).toHaveLength(0);
    });

    it('should return empty when no classes at all', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findAllYearGroups as jest.Mock).mockResolvedValue([]);

      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findByAcademicYear as jest.Mock).mockResolvedValue([]);

      const result = await service.getCoverage(TENANT_ID, AY_ID);

      expect(result.rows).toHaveLength(0);
      expect(result.subjects).toHaveLength(0);
      expect(result.summary.total).toBe(0);
    });

    it('should mark cells as not in curriculum for subjects not assigned to year group', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findAllYearGroups as jest.Mock).mockResolvedValue([
        { id: YG_ID, name: 'Year 1' },
      ]);
      (acadFacade.findSubjectsByIdsWithOrder as jest.Mock).mockResolvedValue([
        { id: SUBJECT_ID, name: 'Maths' },
        { id: 'sub-2', name: 'Art' },
      ]);

      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findByAcademicYear as jest.Mock).mockResolvedValue([
        { id: 'cls-1', year_group_id: YG_ID, academic_year_id: AY_ID, status: 'active' },
      ]);

      const gradebookFacade = module.get(GradebookReadFacade);
      // Only Maths is configured, not Art
      (gradebookFacade.findClassSubjectConfigs as jest.Mock).mockResolvedValue([
        {
          class_id: 'cls-1',
          subject_id: SUBJECT_ID,
          subject: { id: SUBJECT_ID, name: 'Maths' },
          class_name: 'Class 1',
        },
      ]);

      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);

      const result = await service.getCoverage(TENANT_ID, AY_ID);

      const row = result.rows[0]!;
      const mathsCell = row.cells.find((c) => c.subject_id === SUBJECT_ID);
      const artCell = row.cells.find((c) => c.subject_id === 'sub-2');

      expect(mathsCell?.in_curriculum).toBe(true);
      expect(artCell?.in_curriculum).toBe(false);
    });
  });
});
