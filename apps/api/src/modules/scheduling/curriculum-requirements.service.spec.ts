import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { GradebookReadFacade } from '../gradebook/gradebook-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import { CurriculumRequirementsService } from './curriculum-requirements.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AY_ID = 'ay-1';
const AY_ID_TARGET = 'ay-2';
const YG_ID = 'yg-1';
const SUBJECT_ID = 'sub-1';
const CR_ID = 'cr-1';

const mockTx = {
  curriculumRequirement: {
    create: jest.fn(),
    update: jest.fn(),
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

describe('CurriculumRequirementsService', () => {
  let service: CurriculumRequirementsService;
  let module: TestingModule;
  let mockPrisma: {
    curriculumRequirement: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
    };
    subject: { findFirst: jest.Mock };
    yearGroup: { findFirst: jest.Mock };
    academicYear: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      curriculumRequirement: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
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
        CurriculumRequirementsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CurriculumRequirementsService>(CurriculumRequirementsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── list ────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return paginated curriculum requirements', async () => {
      const records = [
        {
          id: CR_ID,
          subject: { id: SUBJECT_ID, name: 'Math' },
          year_group: { id: YG_ID, name: 'Y1' },
        },
      ];
      mockPrisma.curriculumRequirement.findMany.mockResolvedValue(records);
      mockPrisma.curriculumRequirement.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        academic_year_id: AY_ID,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    });

    it('should filter by year_group_id when provided', async () => {
      mockPrisma.curriculumRequirement.findMany.mockResolvedValue([]);
      mockPrisma.curriculumRequirement.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        academic_year_id: AY_ID,
        year_group_id: YG_ID,
      });

      expect(mockPrisma.curriculumRequirement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ year_group_id: YG_ID }),
        }),
      );
    });

    it('should return empty data when no requirements exist', async () => {
      mockPrisma.curriculumRequirement.findMany.mockResolvedValue([]);
      mockPrisma.curriculumRequirement.count.mockResolvedValue(0);

      const result = await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        academic_year_id: AY_ID,
      });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  // ─── getById ─────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('should return a curriculum requirement by id', async () => {
      const record = { id: CR_ID, min_periods_per_week: 5 };
      mockPrisma.curriculumRequirement.findFirst.mockResolvedValue(record);

      const result = await service.getById(TENANT_ID, CR_ID);

      expect(result.id).toBe(CR_ID);
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrisma.curriculumRequirement.findFirst.mockResolvedValue(null);

      await expect(service.getById(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      subject_id: SUBJECT_ID,
      year_group_id: YG_ID,
      academic_year_id: AY_ID,
      min_periods_per_week: 5,
      max_periods_per_day: 2,
      requires_double_period: false,
    };

    it('should create a curriculum requirement when relations are valid', async () => {
      mockPrisma.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: YG_ID });
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });
      mockTx.curriculumRequirement.create.mockResolvedValue({ id: CR_ID, ...dto });

      const result = await service.create(TENANT_ID, dto);

      expect(result).toEqual(expect.objectContaining({ id: CR_ID }));
      expect(mockTx.curriculumRequirement.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException when subject does not exist', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findSubjectByIdOrThrow as jest.Mock).mockRejectedValue(
        new NotFoundException('Subject not found'),
      );

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when year group does not exist', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearGroupByIdOrThrow as jest.Mock).mockRejectedValue(
        new NotFoundException('Year group not found'),
      );

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when academic year does not exist', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearByIdOrThrow as jest.Mock).mockRejectedValue(
        new NotFoundException('Year not found'),
      );

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update a curriculum requirement', async () => {
      mockPrisma.curriculumRequirement.findFirst.mockResolvedValue({ id: CR_ID });
      mockTx.curriculumRequirement.update.mockResolvedValue({
        id: CR_ID,
        min_periods_per_week: 6,
      });

      const result = await service.update(TENANT_ID, CR_ID, { min_periods_per_week: 6 });

      expect(result).toEqual(expect.objectContaining({ id: CR_ID, min_periods_per_week: 6 }));
    });

    it('should throw NotFoundException when requirement does not exist', async () => {
      mockPrisma.curriculumRequirement.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, 'nonexistent', { min_periods_per_week: 6 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete a curriculum requirement', async () => {
      mockPrisma.curriculumRequirement.findFirst.mockResolvedValue({ id: CR_ID });
      mockTx.curriculumRequirement.delete.mockResolvedValue({ id: CR_ID });

      const result = await service.delete(TENANT_ID, CR_ID);

      expect(result.message).toBe('Curriculum requirement deleted');
    });

    it('should throw NotFoundException when requirement does not exist', async () => {
      mockPrisma.curriculumRequirement.findFirst.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── bulkUpsert ──────────────────────────────────────────────────────────────

  describe('bulkUpsert', () => {
    const items = [
      {
        subject_id: SUBJECT_ID,
        year_group_id: YG_ID,
        academic_year_id: AY_ID,
        min_periods_per_week: 5,
        max_periods_per_day: 2,
        requires_double_period: false,
      },
    ];

    it('should bulk upsert curriculum requirements', async () => {
      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: YG_ID });
      mockTx.curriculumRequirement.deleteMany.mockResolvedValue({ count: 0 });
      mockTx.curriculumRequirement.create.mockResolvedValue({
        id: 'new-cr-1',
        subject_id: SUBJECT_ID,
      });

      const result = await service.bulkUpsert(TENANT_ID, AY_ID, YG_ID, items);

      expect(result.data).toHaveLength(1);
      expect(result.meta.upserted).toBe(1);
    });

    it('should throw NotFoundException when year group does not exist', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findYearGroupByIdOrThrow as jest.Mock).mockRejectedValue(
        new NotFoundException('Year group not found'),
      );

      await expect(service.bulkUpsert(TENANT_ID, AY_ID, 'nonexistent', items)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── copyFromAcademicYear ────────────────────────────────────────────────────

  describe('copyFromAcademicYear', () => {
    it('should copy requirements from source to target year', async () => {
      // findYearByIdOrThrow resolves by default from facade mock
      mockPrisma.curriculumRequirement.findMany.mockResolvedValue([
        {
          id: CR_ID,
          year_group_id: YG_ID,
          subject_id: SUBJECT_ID,
          min_periods_per_week: 5,
          max_periods_per_day: 2,
          preferred_periods_per_week: null,
          requires_double_period: false,
          double_period_count: null,
        },
      ]);
      mockTx.curriculumRequirement.create.mockResolvedValue({ id: 'new-cr' });

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
        .mockResolvedValueOnce({ id: AY_ID }) // source resolves
        .mockRejectedValueOnce(new NotFoundException('Year not found')); // target rejects

      await expect(service.copyFromAcademicYear(TENANT_ID, AY_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when source has no data', async () => {
      // findYearByIdOrThrow resolves by default from facade mock
      mockPrisma.curriculumRequirement.findMany.mockResolvedValue([]);

      await expect(service.copyFromAcademicYear(TENANT_ID, AY_ID, AY_ID_TARGET)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── update — optional field branches ───────────────────────────────────────

  describe('update — optional fields', () => {
    beforeEach(() => {
      mockPrisma.curriculumRequirement.findFirst.mockResolvedValue({ id: CR_ID });
    });

    it('should update max_periods_per_day when provided', async () => {
      mockTx.curriculumRequirement.update.mockResolvedValue({
        id: CR_ID,
        max_periods_per_day: 3,
      });

      const result = await service.update(TENANT_ID, CR_ID, { max_periods_per_day: 3 });

      expect(result).toEqual(expect.objectContaining({ max_periods_per_day: 3 }));
    });

    it('should update preferred_periods_per_week when provided', async () => {
      mockTx.curriculumRequirement.update.mockResolvedValue({
        id: CR_ID,
        preferred_periods_per_week: 7,
      });

      const result = await service.update(TENANT_ID, CR_ID, { preferred_periods_per_week: 7 });

      expect(result).toEqual(expect.objectContaining({ preferred_periods_per_week: 7 }));
    });

    it('should update requires_double_period when provided', async () => {
      mockTx.curriculumRequirement.update.mockResolvedValue({
        id: CR_ID,
        requires_double_period: true,
      });

      const result = await service.update(TENANT_ID, CR_ID, { requires_double_period: true });

      expect(result).toEqual(expect.objectContaining({ requires_double_period: true }));
    });

    it('should update double_period_count when provided', async () => {
      mockTx.curriculumRequirement.update.mockResolvedValue({
        id: CR_ID,
        double_period_count: 2,
      });

      const result = await service.update(TENANT_ID, CR_ID, { double_period_count: 2 });

      expect(result).toEqual(expect.objectContaining({ double_period_count: 2 }));
    });

    it('should update period_duration when provided', async () => {
      mockTx.curriculumRequirement.update.mockResolvedValue({
        id: CR_ID,
        period_duration: 45,
      });

      const result = await service.update(TENANT_ID, CR_ID, { period_duration: 45 });

      expect(result).toEqual(expect.objectContaining({ period_duration: 45 }));
    });

    it('should update multiple fields at once', async () => {
      mockTx.curriculumRequirement.update.mockResolvedValue({
        id: CR_ID,
        min_periods_per_week: 4,
        max_periods_per_day: 2,
        requires_double_period: true,
        double_period_count: 1,
        period_duration: 60,
      });

      const result = await service.update(TENANT_ID, CR_ID, {
        min_periods_per_week: 4,
        max_periods_per_day: 2,
        requires_double_period: true,
        double_period_count: 1,
        period_duration: 60,
      });

      expect(result).toEqual(
        expect.objectContaining({
          min_periods_per_week: 4,
          max_periods_per_day: 2,
          requires_double_period: true,
        }),
      );
    });
  });

  // ─── getMatrixSubjects ──────────────────────────────────────────────────────

  describe('getMatrixSubjects', () => {
    it('should return empty array when no active classes exist', async () => {
      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findByYearGroup as jest.Mock).mockResolvedValue([]);

      const result = await service.getMatrixSubjects(TENANT_ID, AY_ID, YG_ID);

      expect(result).toEqual([]);
    });

    it('should filter out non-active and wrong academic year classes', async () => {
      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findByYearGroup as jest.Mock).mockResolvedValue([
        { id: 'cls-1', name: '1A', academic_year_id: AY_ID, status: 'active' },
        { id: 'cls-2', name: '1B', academic_year_id: AY_ID, status: 'archived' },
        { id: 'cls-3', name: '1C', academic_year_id: 'other-ay', status: 'active' },
      ]);

      const gbFacade = module.get(GradebookReadFacade);
      (gbFacade.findClassSubjectConfigs as jest.Mock).mockResolvedValue([]);

      const result = await service.getMatrixSubjects(TENANT_ID, AY_ID, YG_ID);

      // Only cls-1 should be passed to findClassSubjectConfigs
      expect(gbFacade.findClassSubjectConfigs).toHaveBeenCalledWith(TENANT_ID, ['cls-1']);
      expect(result).toEqual([]);
    });

    it('should group subjects across classes and sort by name', async () => {
      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findByYearGroup as jest.Mock).mockResolvedValue([
        { id: 'cls-1', name: '1A', academic_year_id: AY_ID, status: 'active' },
        { id: 'cls-2', name: '1B', academic_year_id: AY_ID, status: 'active' },
      ]);

      const gbFacade = module.get(GradebookReadFacade);
      (gbFacade.findClassSubjectConfigs as jest.Mock).mockResolvedValue([
        { subject_id: 'sub-1', subject: { id: 'sub-1', name: 'Maths' }, class_name: '1A' },
        { subject_id: 'sub-1', subject: { id: 'sub-1', name: 'Maths' }, class_name: '1B' },
        { subject_id: 'sub-2', subject: { id: 'sub-2', name: 'English' }, class_name: '1A' },
      ]);

      const result = await service.getMatrixSubjects(TENANT_ID, AY_ID, YG_ID);

      expect(result).toHaveLength(2);
      // Sorted alphabetically by subject name
      expect(result[0]!.subject.name).toBe('English');
      expect(result[0]!.classes).toEqual(['1A']);
      expect(result[1]!.subject.name).toBe('Maths');
      expect(result[1]!.classes).toEqual(['1A', '1B']);
    });

    it('should return empty when all classes are inactive', async () => {
      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findByYearGroup as jest.Mock).mockResolvedValue([
        { id: 'cls-1', name: '1A', academic_year_id: AY_ID, status: 'archived' },
      ]);

      const result = await service.getMatrixSubjects(TENANT_ID, AY_ID, YG_ID);

      expect(result).toEqual([]);
    });
  });

  // ─── create — optional nullable fields ──────────────────────────────────────

  describe('create — with optional fields', () => {
    it('should pass optional fields as null when not provided', async () => {
      const dto = {
        subject_id: SUBJECT_ID,
        year_group_id: YG_ID,
        academic_year_id: AY_ID,
        min_periods_per_week: 5,
        max_periods_per_day: 2,
        requires_double_period: false,
      };
      mockTx.curriculumRequirement.create.mockResolvedValue({ id: CR_ID, ...dto });

      await service.create(TENANT_ID, dto);

      expect(mockTx.curriculumRequirement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            preferred_periods_per_week: null,
            double_period_count: null,
            period_duration: null,
          }),
        }),
      );
    });

    it('should pass optional fields when provided', async () => {
      const dto = {
        subject_id: SUBJECT_ID,
        year_group_id: YG_ID,
        academic_year_id: AY_ID,
        min_periods_per_week: 5,
        max_periods_per_day: 2,
        requires_double_period: true,
        preferred_periods_per_week: 6,
        double_period_count: 1,
        period_duration: 50,
      };
      mockTx.curriculumRequirement.create.mockResolvedValue({ id: CR_ID, ...dto });

      await service.create(TENANT_ID, dto);

      expect(mockTx.curriculumRequirement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            preferred_periods_per_week: 6,
            double_period_count: 1,
            period_duration: 50,
          }),
        }),
      );
    });
  });

  // ─── bulkUpsert — with optional fields ──────────────────────────────────────

  describe('bulkUpsert — optional fields', () => {
    it('should pass optional fields in bulk create', async () => {
      const items = [
        {
          subject_id: SUBJECT_ID,
          year_group_id: YG_ID,
          academic_year_id: AY_ID,
          min_periods_per_week: 5,
          max_periods_per_day: 2,
          requires_double_period: true,
          preferred_periods_per_week: 6,
          double_period_count: 2,
          period_duration: 40,
        },
      ];

      mockTx.curriculumRequirement.deleteMany.mockResolvedValue({ count: 0 });
      mockTx.curriculumRequirement.create.mockResolvedValue({ id: 'new-cr-1' });

      const result = await service.bulkUpsert(TENANT_ID, AY_ID, YG_ID, items);

      expect(result.data).toHaveLength(1);
      expect(mockTx.curriculumRequirement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            preferred_periods_per_week: 6,
            double_period_count: 2,
            period_duration: 40,
          }),
        }),
      );
    });
  });
});
