import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

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
    findFirst: jest.fn(),
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
  let mockPrisma: {
    teacherCompetency: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    staffProfile: { findFirst: jest.Mock };
    subject: { findFirst: jest.Mock; findMany: jest.Mock };
    yearGroup: { findFirst: jest.Mock; findMany: jest.Mock };
    academicYear: { findFirst: jest.Mock };
    class: { findMany: jest.Mock };
    classSubjectGradeConfig: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      teacherCompetency: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
      },
      staffProfile: { findFirst: jest.fn() },
      subject: { findFirst: jest.fn(), findMany: jest.fn() },
      yearGroup: { findFirst: jest.fn(), findMany: jest.fn() },
      academicYear: { findFirst: jest.fn() },
      class: { findMany: jest.fn() },
      classSubjectGradeConfig: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TeacherCompetenciesService, { provide: PrismaService, useValue: mockPrisma }],
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
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);
      mockPrisma.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: YG_ID });
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });

      await expect(service.create(TENANT_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when subject does not exist', async () => {
      mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_ID });
      mockPrisma.subject.findFirst.mockResolvedValue(null);
      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: YG_ID });
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: AY_ID });

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
      mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

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
      mockPrisma.academicYear.findFirst
        .mockResolvedValueOnce({ id: AY_ID })
        .mockResolvedValueOnce({ id: AY_ID_TARGET });
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
      mockPrisma.academicYear.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: AY_ID_TARGET });

      await expect(
        service.copyFromAcademicYear(TENANT_ID, 'nonexistent', AY_ID_TARGET),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when target year does not exist', async () => {
      mockPrisma.academicYear.findFirst
        .mockResolvedValueOnce({ id: AY_ID })
        .mockResolvedValueOnce(null);

      await expect(service.copyFromAcademicYear(TENANT_ID, AY_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when source has no data', async () => {
      mockPrisma.academicYear.findFirst
        .mockResolvedValueOnce({ id: AY_ID })
        .mockResolvedValueOnce({ id: AY_ID_TARGET });
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);

      await expect(service.copyFromAcademicYear(TENANT_ID, AY_ID, AY_ID_TARGET)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── copyToYears ─────────────────────────────────────────────────────────────

  describe('copyToYears', () => {
    it('should copy competencies to multiple target year groups', async () => {
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        {
          id: COMP_ID,
          staff_profile_id: STAFF_ID,
          subject_id: SUBJECT_ID,
          year_group_id: YG_ID,
          is_primary: true,
        },
      ]);
      mockTx.teacherCompetency.findFirst.mockResolvedValue(null);
      mockTx.teacherCompetency.create.mockResolvedValue({ id: 'new-comp' });

      const result = await service.copyToYears(TENANT_ID, {
        academic_year_id: AY_ID,
        source_year_group_id: YG_ID,
        targets: [
          { year_group_id: 'yg-2', subject_ids: [SUBJECT_ID] },
          { year_group_id: 'yg-3', subject_ids: [SUBJECT_ID] },
        ],
      });

      expect(result.data.copied).toBe(2);
      expect(result.data.skipped).toBe(0);
    });

    it('should skip existing competencies', async () => {
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        {
          id: COMP_ID,
          staff_profile_id: STAFF_ID,
          subject_id: SUBJECT_ID,
          year_group_id: YG_ID,
          is_primary: true,
        },
      ]);
      mockTx.teacherCompetency.findFirst.mockResolvedValue({ id: 'existing' });

      const result = await service.copyToYears(TENANT_ID, {
        academic_year_id: AY_ID,
        source_year_group_id: YG_ID,
        targets: [{ year_group_id: 'yg-2', subject_ids: [SUBJECT_ID] }],
      });

      expect(result.data.copied).toBe(0);
      expect(result.data.skipped).toBe(1);
    });

    it('should throw BadRequestException when no source competencies found', async () => {
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);

      await expect(
        service.copyToYears(TENANT_ID, {
          academic_year_id: AY_ID,
          source_year_group_id: YG_ID,
          targets: [{ year_group_id: 'yg-2', subject_ids: [SUBJECT_ID] }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle multiple subjects in different targets', async () => {
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        {
          id: COMP_ID,
          staff_profile_id: STAFF_ID,
          subject_id: 'sub-1',
          year_group_id: YG_ID,
          is_primary: true,
        },
        {
          id: 'comp-2',
          staff_profile_id: 'staff-2',
          subject_id: 'sub-2',
          year_group_id: YG_ID,
          is_primary: false,
        },
      ]);
      mockTx.teacherCompetency.findFirst.mockResolvedValue(null);
      mockTx.teacherCompetency.create.mockResolvedValue({ id: 'new-comp' });

      const result = await service.copyToYears(TENANT_ID, {
        academic_year_id: AY_ID,
        source_year_group_id: YG_ID,
        targets: [{ year_group_id: 'yg-2', subject_ids: ['sub-1', 'sub-2'] }],
      });

      expect(result.data.copied).toBe(2);
    });
  });

  // ─── getCoverage ─────────────────────────────────────────────────────────────

  describe('getCoverage', () => {
    it('should return coverage matrix with covered status when 2+ teachers', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([{ id: YG_ID, name: 'Year 1' }]);
      mockPrisma.class.findMany.mockResolvedValue([{ id: 'class-1', year_group_id: YG_ID }]);
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([
        { class_id: 'class-1', subject_id: SUBJECT_ID },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        {
          year_group_id: YG_ID,
          subject_id: SUBJECT_ID,
          staff_profile: {
            id: STAFF_ID,
            user: { first_name: 'John', last_name: 'Doe' },
          },
        },
        {
          year_group_id: YG_ID,
          subject_id: SUBJECT_ID,
          staff_profile: {
            id: 'staff-2',
            user: { first_name: 'Jane', last_name: 'Smith' },
          },
        },
      ]);
      mockPrisma.subject.findMany.mockResolvedValue([{ id: SUBJECT_ID, name: 'Mathematics' }]);

      const result = await service.getCoverage(TENANT_ID, AY_ID);

      expect(result.subjects).toHaveLength(1);
      expect(result.rows).toHaveLength(1);
      expect(result.summary.total).toBe(1);
      expect(result.summary.covered).toBe(1);
      expect(result.summary.gaps).toBe(0);
      expect(result.summary.at_risk).toBe(0);
    });

    it('should identify gaps when no teachers are assigned', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([{ id: YG_ID, name: 'Year 1' }]);
      mockPrisma.class.findMany.mockResolvedValue([{ id: 'class-1', year_group_id: YG_ID }]);
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([
        { class_id: 'class-1', subject_id: SUBJECT_ID },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      mockPrisma.subject.findMany.mockResolvedValue([{ id: SUBJECT_ID, name: 'Mathematics' }]);

      const result = await service.getCoverage(TENANT_ID, AY_ID);

      expect(result.summary.total).toBe(1);
      expect(result.summary.gaps).toBe(1);
      expect(result.summary.covered).toBe(0);
    });

    it('should identify at-risk when only one teacher is assigned', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([{ id: YG_ID, name: 'Year 1' }]);
      mockPrisma.class.findMany.mockResolvedValue([{ id: 'class-1', year_group_id: YG_ID }]);
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([
        { class_id: 'class-1', subject_id: SUBJECT_ID },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        {
          year_group_id: YG_ID,
          subject_id: SUBJECT_ID,
          staff_profile: {
            id: STAFF_ID,
            user: { first_name: 'John', last_name: 'Doe' },
          },
        },
      ]);
      mockPrisma.subject.findMany.mockResolvedValue([{ id: SUBJECT_ID, name: 'Mathematics' }]);

      const result = await service.getCoverage(TENANT_ID, AY_ID);

      expect(result.summary.at_risk).toBe(1);
      expect(result.summary.covered).toBe(0); // 1 teacher = at risk, not covered
    });

    it('should handle multiple year groups and subjects', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        { id: 'yg-1', name: 'Year 1' },
        { id: 'yg-2', name: 'Year 2' },
      ]);
      mockPrisma.class.findMany.mockResolvedValue([
        { id: 'class-1', year_group_id: 'yg-1' },
        { id: 'class-2', year_group_id: 'yg-2' },
      ]);
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([
        { class_id: 'class-1', subject_id: 'sub-1' },
        { class_id: 'class-2', subject_id: 'sub-2' },
      ]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        {
          year_group_id: 'yg-1',
          subject_id: 'sub-1',
          staff_profile: { id: 'staff-1', user: { first_name: 'Alice', last_name: 'Smith' } },
        },
        {
          year_group_id: 'yg-1',
          subject_id: 'sub-1',
          staff_profile: { id: 'staff-2', user: { first_name: 'Bob', last_name: 'Jones' } },
        },
      ]);
      mockPrisma.subject.findMany.mockResolvedValue([
        { id: 'sub-1', name: 'Math' },
        { id: 'sub-2', name: 'English' },
      ]);

      const result = await service.getCoverage(TENANT_ID, AY_ID);

      expect(result.rows).toHaveLength(2); // Two year groups
      expect(result.summary.covered).toBe(1); // Math in Year 1 has 2 teachers
      expect(result.summary.gaps).toBe(1); // English in Year 2 has no teachers
    });

    it('should handle empty curriculum gracefully', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([{ id: YG_ID, name: 'Year 1' }]);
      mockPrisma.class.findMany.mockResolvedValue([]);
      mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([]);
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);
      mockPrisma.subject.findMany.mockResolvedValue([]);

      const result = await service.getCoverage(TENANT_ID, AY_ID);

      expect(result.rows).toHaveLength(0);
      expect(result.summary.total).toBe(0);
    });
  });
});
