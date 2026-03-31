import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { CurriculumMatrixService } from './curriculum-matrix.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID_1 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLASS_ID_2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SUBJECT_ID_1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SUBJECT_ID_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ACADEMIC_YEAR_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const YEAR_GROUP_ID = '11111111-1111-1111-1111-111111111111';
const GRADING_SCALE_ID = '22222222-2222-2222-2222-222222222222';
const CONFIG_ID = '33333333-3333-3333-3333-333333333333';
const PERIOD_ID = '44444444-4444-4444-4444-444444444444';
const CATEGORY_ID = '55555555-5555-5555-5555-555555555555';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  class: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  subject: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  classSubjectGradeConfig: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
  gradingScale: {
    findFirst: jest.fn(),
  },
  assessment: {
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  academicPeriod: {
    findFirst: jest.fn(),
  },
  assessmentCategory: {
    findFirst: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Prisma mock ──────────────────────────────────────────────────────────────

const mockPrisma = {};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CurriculumMatrixService', () => {
  let service: CurriculumMatrixService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [CurriculumMatrixService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<CurriculumMatrixService>(CurriculumMatrixService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getMatrix ───────────────────────────────────────────────────────────

  describe('getMatrix', () => {
    it('should return classes, subjects, and assignments', async () => {
      const classes = [
        {
          id: CLASS_ID_1,
          name: 'Class 1A',
          year_group: { id: YEAR_GROUP_ID, name: 'Year 1' },
          academic_year: { id: ACADEMIC_YEAR_ID, name: '2024-2025' },
        },
      ];
      const subjects = [{ id: SUBJECT_ID_1, name: 'Mathematics', code: 'MATH' }];
      const configs = [{ id: CONFIG_ID, class_id: CLASS_ID_1, subject_id: SUBJECT_ID_1 }];

      mockRlsTx.class.findMany.mockResolvedValueOnce(classes);
      mockRlsTx.subject.findMany.mockResolvedValueOnce(subjects);
      mockRlsTx.classSubjectGradeConfig.findMany.mockResolvedValueOnce(configs);

      const result = await service.getMatrix(TENANT_ID);

      expect(result.classes).toEqual(classes);
      expect(result.subjects).toEqual(subjects);
      expect(result.assignments).toEqual([
        { class_id: CLASS_ID_1, subject_id: SUBJECT_ID_1, config_id: CONFIG_ID },
      ]);
    });

    it('should filter classes by academic_year_id when provided', async () => {
      mockRlsTx.class.findMany.mockResolvedValueOnce([]);
      mockRlsTx.subject.findMany.mockResolvedValueOnce([]);

      await service.getMatrix(TENANT_ID, ACADEMIC_YEAR_ID);

      expect(mockRlsTx.class.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            academic_year_id: ACADEMIC_YEAR_ID,
          }),
        }),
      );
    });

    it('should return empty assignments when no classes exist', async () => {
      mockRlsTx.class.findMany.mockResolvedValueOnce([]);
      mockRlsTx.subject.findMany.mockResolvedValueOnce([
        { id: SUBJECT_ID_1, name: 'Mathematics', code: 'MATH' },
      ]);

      const result = await service.getMatrix(TENANT_ID);

      expect(result.classes).toEqual([]);
      expect(result.assignments).toEqual([]);
      // Should NOT call findMany for configs when no classes
      expect(mockRlsTx.classSubjectGradeConfig.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── toggle ──────────────────────────────────────────────────────────────

  describe('toggle', () => {
    it('should throw NotFoundException when class does not exist', async () => {
      mockRlsTx.class.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.toggle(TENANT_ID, CLASS_ID_1, SUBJECT_ID_1, true);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'CLASS_NOT_FOUND',
      });
    });

    it('should throw NotFoundException when subject does not exist', async () => {
      mockRlsTx.class.findFirst.mockResolvedValueOnce({ id: CLASS_ID_1 });
      mockRlsTx.subject.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.toggle(TENANT_ID, CLASS_ID_1, SUBJECT_ID_1, true);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'SUBJECT_NOT_FOUND',
      });
    });

    it('should create config when enabling and no existing config', async () => {
      mockRlsTx.class.findFirst.mockResolvedValueOnce({ id: CLASS_ID_1 });
      mockRlsTx.subject.findFirst.mockResolvedValueOnce({ id: SUBJECT_ID_1 });
      mockRlsTx.classSubjectGradeConfig.findFirst.mockResolvedValueOnce(null); // no existing
      mockRlsTx.gradingScale.findFirst.mockResolvedValueOnce({ id: GRADING_SCALE_ID });
      mockRlsTx.classSubjectGradeConfig.create.mockResolvedValueOnce({
        id: CONFIG_ID,
        class_id: CLASS_ID_1,
        subject_id: SUBJECT_ID_1,
      });

      const result = await service.toggle(TENANT_ID, CLASS_ID_1, SUBJECT_ID_1, true);

      expect(result).toEqual({ enabled: true, config_id: CONFIG_ID });
      expect(mockRlsTx.classSubjectGradeConfig.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          class_id: CLASS_ID_1,
          subject_id: SUBJECT_ID_1,
          grading_scale_id: GRADING_SCALE_ID,
        }),
      });
    });

    it('should return existing config when already enabled', async () => {
      mockRlsTx.class.findFirst.mockResolvedValueOnce({ id: CLASS_ID_1 });
      mockRlsTx.subject.findFirst.mockResolvedValueOnce({ id: SUBJECT_ID_1 });
      mockRlsTx.classSubjectGradeConfig.findFirst.mockResolvedValueOnce({ id: CONFIG_ID });

      const result = await service.toggle(TENANT_ID, CLASS_ID_1, SUBJECT_ID_1, true);

      expect(result).toEqual({ enabled: true, config_id: CONFIG_ID });
      expect(mockRlsTx.classSubjectGradeConfig.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when no grading scale exists', async () => {
      mockRlsTx.class.findFirst.mockResolvedValueOnce({ id: CLASS_ID_1 });
      mockRlsTx.subject.findFirst.mockResolvedValueOnce({ id: SUBJECT_ID_1 });
      mockRlsTx.classSubjectGradeConfig.findFirst.mockResolvedValueOnce(null);
      mockRlsTx.gradingScale.findFirst.mockResolvedValueOnce(null); // no scale

      let caught: unknown;
      try {
        await service.toggle(TENANT_ID, CLASS_ID_1, SUBJECT_ID_1, true);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'NO_GRADING_SCALE',
      });
    });

    it('should delete config when disabling with no assessments', async () => {
      mockRlsTx.class.findFirst.mockResolvedValueOnce({ id: CLASS_ID_1 });
      mockRlsTx.subject.findFirst.mockResolvedValueOnce({ id: SUBJECT_ID_1 });
      mockRlsTx.assessment.count.mockResolvedValueOnce(0);
      mockRlsTx.classSubjectGradeConfig.deleteMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.toggle(TENANT_ID, CLASS_ID_1, SUBJECT_ID_1, false);

      expect(result).toEqual({ enabled: false, config_id: null });
      expect(mockRlsTx.classSubjectGradeConfig.deleteMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, class_id: CLASS_ID_1, subject_id: SUBJECT_ID_1 },
      });
    });

    it('should throw BadRequestException when disabling with existing assessments', async () => {
      mockRlsTx.class.findFirst.mockResolvedValueOnce({ id: CLASS_ID_1 });
      mockRlsTx.subject.findFirst.mockResolvedValueOnce({ id: SUBJECT_ID_1 });
      mockRlsTx.assessment.count.mockResolvedValueOnce(5);

      let caught: unknown;
      try {
        await service.toggle(TENANT_ID, CLASS_ID_1, SUBJECT_ID_1, false);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'ASSESSMENTS_EXIST',
      });
      expect(mockRlsTx.classSubjectGradeConfig.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ─── yearGroupAssign ─────────────────────────────────────────────────────

  describe('yearGroupAssign', () => {
    it('should throw NotFoundException when no classes in year group', async () => {
      mockRlsTx.class.findMany.mockResolvedValueOnce([]);

      let caught: unknown;
      try {
        await service.yearGroupAssign(TENANT_ID, ACADEMIC_YEAR_ID, YEAR_GROUP_ID, [
          { subject_id: SUBJECT_ID_1, enabled: true },
        ]);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'NO_CLASSES_IN_YEAR_GROUP',
      });
    });

    it('should throw BadRequestException when no grading scale configured', async () => {
      mockRlsTx.class.findMany.mockResolvedValueOnce([{ id: CLASS_ID_1 }]);
      mockRlsTx.gradingScale.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.yearGroupAssign(TENANT_ID, ACADEMIC_YEAR_ID, YEAR_GROUP_ID, [
          { subject_id: SUBJECT_ID_1, enabled: true },
        ]);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(BadRequestException);
      expect((caught as BadRequestException).getResponse()).toMatchObject({
        code: 'NO_GRADING_SCALE',
      });
    });

    it('should create configs for each class in the year group when enabling', async () => {
      mockRlsTx.class.findMany.mockResolvedValueOnce([{ id: CLASS_ID_1 }, { id: CLASS_ID_2 }]);
      mockRlsTx.gradingScale.findFirst.mockResolvedValueOnce({ id: GRADING_SCALE_ID });
      mockRlsTx.classSubjectGradeConfig.findFirst.mockResolvedValue(null); // no existing
      mockRlsTx.classSubjectGradeConfig.create.mockResolvedValue({ id: CONFIG_ID });

      const result = await service.yearGroupAssign(TENANT_ID, ACADEMIC_YEAR_ID, YEAR_GROUP_ID, [
        { subject_id: SUBJECT_ID_1, enabled: true },
      ]);

      expect(result.created).toBe(2); // 2 classes * 1 subject
      expect(mockRlsTx.classSubjectGradeConfig.create).toHaveBeenCalledTimes(2);
    });

    it('should skip existing configs when enabling', async () => {
      mockRlsTx.class.findMany.mockResolvedValueOnce([{ id: CLASS_ID_1 }]);
      mockRlsTx.gradingScale.findFirst.mockResolvedValueOnce({ id: GRADING_SCALE_ID });
      mockRlsTx.classSubjectGradeConfig.findFirst.mockResolvedValueOnce({ id: CONFIG_ID }); // exists

      const result = await service.yearGroupAssign(TENANT_ID, ACADEMIC_YEAR_ID, YEAR_GROUP_ID, [
        { subject_id: SUBJECT_ID_1, enabled: true },
      ]);

      expect(result.created).toBe(0);
      expect(mockRlsTx.classSubjectGradeConfig.create).not.toHaveBeenCalled();
    });

    it('should remove configs for disabled subjects when no assessments exist', async () => {
      mockRlsTx.class.findMany.mockResolvedValueOnce([{ id: CLASS_ID_1 }]);
      mockRlsTx.gradingScale.findFirst.mockResolvedValueOnce({ id: GRADING_SCALE_ID });
      mockRlsTx.assessment.count.mockResolvedValueOnce(0);
      mockRlsTx.classSubjectGradeConfig.deleteMany.mockResolvedValueOnce({ count: 1 });

      const result = await service.yearGroupAssign(TENANT_ID, ACADEMIC_YEAR_ID, YEAR_GROUP_ID, [
        { subject_id: SUBJECT_ID_1, enabled: false },
      ]);

      expect(result.removed).toBe(1);
      expect(mockRlsTx.classSubjectGradeConfig.deleteMany).toHaveBeenCalled();
    });

    it('should skip removal when assessments exist for a class+subject', async () => {
      mockRlsTx.class.findMany.mockResolvedValueOnce([{ id: CLASS_ID_1 }]);
      mockRlsTx.gradingScale.findFirst.mockResolvedValueOnce({ id: GRADING_SCALE_ID });
      mockRlsTx.assessment.count.mockResolvedValueOnce(3); // assessments exist

      const result = await service.yearGroupAssign(TENANT_ID, ACADEMIC_YEAR_ID, YEAR_GROUP_ID, [
        { subject_id: SUBJECT_ID_1, enabled: false },
      ]);

      expect(result.removed).toBe(0);
      expect(mockRlsTx.classSubjectGradeConfig.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ─── bulkCreateAssessments ───────────────────────────────────────────────

  describe('bulkCreateAssessments', () => {
    const bulkDto = {
      class_ids: [CLASS_ID_1],
      subject_ids: [SUBJECT_ID_1],
      academic_period_id: PERIOD_ID,
      category_id: CATEGORY_ID,
      title: 'Midterm Exam',
      max_score: 100,
      due_date: null,
    };

    it('should throw NotFoundException when academic period not found', async () => {
      mockRlsTx.academicPeriod.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.bulkCreateAssessments(TENANT_ID, 'user-1', bulkDto);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'PERIOD_NOT_FOUND',
      });
    });

    it('should throw NotFoundException when category not found', async () => {
      mockRlsTx.academicPeriod.findFirst.mockResolvedValueOnce({ id: PERIOD_ID });
      mockRlsTx.assessmentCategory.findFirst.mockResolvedValueOnce(null);

      let caught: unknown;
      try {
        await service.bulkCreateAssessments(TENANT_ID, 'user-1', bulkDto);
      } catch (e) {
        caught = e;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
      expect((caught as NotFoundException).getResponse()).toMatchObject({
        code: 'CATEGORY_NOT_FOUND',
      });
    });

    it('should create assessments for assigned class+subject combos', async () => {
      mockRlsTx.academicPeriod.findFirst.mockResolvedValueOnce({ id: PERIOD_ID });
      mockRlsTx.assessmentCategory.findFirst.mockResolvedValueOnce({ id: CATEGORY_ID });
      mockRlsTx.classSubjectGradeConfig.findMany.mockResolvedValueOnce([
        { class_id: CLASS_ID_1, subject_id: SUBJECT_ID_1 },
      ]);
      mockRlsTx.assessment.findFirst.mockResolvedValueOnce(null); // no existing
      mockRlsTx.assessment.create.mockResolvedValueOnce({ id: 'new-assessment-id' });

      const result = await service.bulkCreateAssessments(TENANT_ID, 'user-1', bulkDto);

      expect(result.created).toBe(1);
      expect(mockRlsTx.assessment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          class_id: CLASS_ID_1,
          subject_id: SUBJECT_ID_1,
          title: 'Midterm Exam',
          max_score: 100,
          status: 'draft',
        }),
      });
    });

    it('should skip duplicate assessments (same title in same period)', async () => {
      mockRlsTx.academicPeriod.findFirst.mockResolvedValueOnce({ id: PERIOD_ID });
      mockRlsTx.assessmentCategory.findFirst.mockResolvedValueOnce({ id: CATEGORY_ID });
      mockRlsTx.classSubjectGradeConfig.findMany.mockResolvedValueOnce([
        { class_id: CLASS_ID_1, subject_id: SUBJECT_ID_1 },
      ]);
      mockRlsTx.assessment.findFirst.mockResolvedValueOnce({ id: 'existing-assessment' });

      const result = await service.bulkCreateAssessments(TENANT_ID, 'user-1', bulkDto);

      expect(result.created).toBe(0);
      expect(mockRlsTx.assessment.create).not.toHaveBeenCalled();
    });

    it('should handle multiple class+subject combos and count skipped unassigned', async () => {
      const multiDto = {
        ...bulkDto,
        class_ids: [CLASS_ID_1, CLASS_ID_2],
        subject_ids: [SUBJECT_ID_1, SUBJECT_ID_2],
      };
      mockRlsTx.academicPeriod.findFirst.mockResolvedValueOnce({ id: PERIOD_ID });
      mockRlsTx.assessmentCategory.findFirst.mockResolvedValueOnce({ id: CATEGORY_ID });
      // Only 2 out of 4 combos are assigned
      mockRlsTx.classSubjectGradeConfig.findMany.mockResolvedValueOnce([
        { class_id: CLASS_ID_1, subject_id: SUBJECT_ID_1 },
        { class_id: CLASS_ID_2, subject_id: SUBJECT_ID_2 },
      ]);
      mockRlsTx.assessment.findFirst.mockResolvedValue(null); // no existing
      mockRlsTx.assessment.create.mockResolvedValue({ id: 'new-id' });

      const result = await service.bulkCreateAssessments(TENANT_ID, 'user-1', multiDto);

      expect(result.created).toBe(2);
      // 4 total requested - 2 configs found - 0 title dupes = 2 skipped for unassigned
      expect(result.skipped).toBe(2);
    });

    it('should set due_date when provided', async () => {
      const withDue = { ...bulkDto, due_date: '2025-03-15' };
      mockRlsTx.academicPeriod.findFirst.mockResolvedValueOnce({ id: PERIOD_ID });
      mockRlsTx.assessmentCategory.findFirst.mockResolvedValueOnce({ id: CATEGORY_ID });
      mockRlsTx.classSubjectGradeConfig.findMany.mockResolvedValueOnce([
        { class_id: CLASS_ID_1, subject_id: SUBJECT_ID_1 },
      ]);
      mockRlsTx.assessment.findFirst.mockResolvedValueOnce(null);
      mockRlsTx.assessment.create.mockResolvedValueOnce({ id: 'new-id' });

      await service.bulkCreateAssessments(TENANT_ID, 'user-1', withDue);

      expect(mockRlsTx.assessment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          due_date: new Date('2025-03-15'),
        }),
      });
    });

    it('edge: should return zero created when no class+subject combos are assigned', async () => {
      mockRlsTx.academicPeriod.findFirst.mockResolvedValueOnce({ id: PERIOD_ID });
      mockRlsTx.assessmentCategory.findFirst.mockResolvedValueOnce({ id: CATEGORY_ID });
      mockRlsTx.classSubjectGradeConfig.findMany.mockResolvedValueOnce([]); // no configs

      const result = await service.bulkCreateAssessments(TENANT_ID, 'user-1', bulkDto);

      expect(result.created).toBe(0);
      expect(mockRlsTx.assessment.create).not.toHaveBeenCalled();
    });
  });
});
