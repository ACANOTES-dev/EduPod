import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

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
const CLASS_ID = 'class-1';
const COMP_ID = 'comp-1';

const mockTx = {
  teacherCompetency: {
    create: jest.fn(),
    update: jest.fn(),
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
  let module: TestingModule;
  let mockPrisma: {
    teacherCompetency: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      teacherCompetency: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        {
          provide: AcademicReadFacade,
          useValue: {
            findYearByIdOrThrow: jest.fn().mockResolvedValue('year-1'),
            findSubjectByIdOrThrow: jest.fn().mockResolvedValue('subject-1'),
            findYearGroupByIdOrThrow: jest.fn().mockResolvedValue('yg-1'),
            findAllYearGroups: jest.fn().mockResolvedValue([]),
            findSubjectsByIdsWithOrder: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ClassesReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue(null),
            existsOrThrow: jest.fn().mockResolvedValue(undefined),
            findByAcademicYear: jest.fn().mockResolvedValue([]),
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
            existsOrThrow: jest.fn().mockResolvedValue(undefined),
            findByIds: jest.fn().mockResolvedValue([]),
          },
        },
        TeacherCompetenciesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TeacherCompetenciesService>(TeacherCompetenciesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── list ─────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('applies tenant + academic_year filters and leaves class_id unconstrained when omitted', async () => {
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([{ id: COMP_ID }]);

      const result = await service.list(TENANT_ID, { academic_year_id: AY_ID });

      expect(result.data).toHaveLength(1);
      expect(mockPrisma.teacherCompetency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, academic_year_id: AY_ID },
        }),
      );
    });

    it('filters by class_id when a UUID is passed', async () => {
      await service.list(TENANT_ID, { academic_year_id: AY_ID, class_id: CLASS_ID });

      expect(mockPrisma.teacherCompetency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ class_id: CLASS_ID }),
        }),
      );
    });

    it('filters to pool rows (class_id IS NULL) when class_id="null" literal is passed', async () => {
      await service.list(TENANT_ID, { academic_year_id: AY_ID, class_id: 'null' });

      expect(mockPrisma.teacherCompetency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ class_id: null }),
        }),
      );
    });

    it('threads staff_profile_id, subject_id, year_group_id filters through', async () => {
      await service.list(TENANT_ID, {
        academic_year_id: AY_ID,
        staff_profile_id: STAFF_ID,
        subject_id: SUBJECT_ID,
        year_group_id: YG_ID,
      });

      expect(mockPrisma.teacherCompetency.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            staff_profile_id: STAFF_ID,
            subject_id: SUBJECT_ID,
            year_group_id: YG_ID,
          }),
        }),
      );
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseDto = {
      staff_profile_id: STAFF_ID,
      subject_id: SUBJECT_ID,
      year_group_id: YG_ID,
      academic_year_id: AY_ID,
    };

    it('creates a pool competency (no class_id) when no duplicate pool row exists', async () => {
      mockTx.teacherCompetency.create.mockResolvedValue({ id: COMP_ID, class_id: null });

      const result = await service.create(TENANT_ID, baseDto);

      expect(result).toEqual(expect.objectContaining({ id: COMP_ID, class_id: null }));
      expect(mockTx.teacherCompetency.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ class_id: null }),
        }),
      );
    });

    it('rejects a second pool row for same teacher/subject/year with CONFLICT', async () => {
      mockPrisma.teacherCompetency.findFirst.mockResolvedValue({ id: 'already-exists' });

      await expect(service.create(TENANT_ID, baseDto)).rejects.toThrow(ConflictException);
    });

    it('creates a pin competency when class_id belongs to the tenant and matches the year group', async () => {
      const classFacade = module.get(ClassesReadFacade);
      (classFacade.findById as jest.Mock).mockResolvedValue({
        id: CLASS_ID,
        year_group_id: YG_ID,
      });
      mockTx.teacherCompetency.create.mockResolvedValue({ id: COMP_ID, class_id: CLASS_ID });

      const result = await service.create(TENANT_ID, { ...baseDto, class_id: CLASS_ID });

      expect(result).toEqual(expect.objectContaining({ id: COMP_ID, class_id: CLASS_ID }));
      // The pool-uniqueness check MUST NOT run when class_id is set.
      expect(mockPrisma.teacherCompetency.findFirst).not.toHaveBeenCalled();
    });

    it('throws CLASS_NOT_FOUND when class_id does not belong to the tenant', async () => {
      const classFacade = module.get(ClassesReadFacade);
      (classFacade.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, { ...baseDto, class_id: CLASS_ID }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CLASS_NOT_FOUND' }),
      });
    });

    it('throws CLASS_YEAR_GROUP_MISMATCH when class.year_group_id differs from dto.year_group_id', async () => {
      const classFacade = module.get(ClassesReadFacade);
      (classFacade.findById as jest.Mock).mockResolvedValue({
        id: CLASS_ID,
        year_group_id: 'a-different-year-group',
      });

      await expect(
        service.create(TENANT_ID, { ...baseDto, class_id: CLASS_ID }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CLASS_YEAR_GROUP_MISMATCH' }),
      });
    });

    it('translates Prisma P2002 to a CONFLICT response', async () => {
      const classFacade = module.get(ClassesReadFacade);
      (classFacade.findById as jest.Mock).mockResolvedValue({
        id: CLASS_ID,
        year_group_id: YG_ID,
      });
      mockTx.teacherCompetency.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '6.19.2',
        }),
      );

      await expect(service.create(TENANT_ID, { ...baseDto, class_id: CLASS_ID })).rejects.toThrow(
        ConflictException,
      );
    });

    it('propagates NotFoundException from the staff facade', async () => {
      const staffFacade = module.get(StaffProfileReadFacade);
      (staffFacade.existsOrThrow as jest.Mock).mockRejectedValue(
        new NotFoundException('Staff not found'),
      );

      await expect(service.create(TENANT_ID, baseDto)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    const row = {
      id: COMP_ID,
      tenant_id: TENANT_ID,
      academic_year_id: AY_ID,
      staff_profile_id: STAFF_ID,
      subject_id: SUBJECT_ID,
      year_group_id: YG_ID,
      class_id: null as string | null,
    };

    it('returns the existing row unchanged when the body is empty', async () => {
      mockPrisma.teacherCompetency.findFirst.mockResolvedValue(row);

      const result = await service.update(TENANT_ID, COMP_ID, {});

      expect(result).toEqual(expect.objectContaining({ id: COMP_ID }));
      expect(mockTx.teacherCompetency.update).not.toHaveBeenCalled();
    });

    it('promotes a pool row to a pin when class_id is set and matches the year group', async () => {
      mockPrisma.teacherCompetency.findFirst.mockResolvedValue(row);
      const classFacade = module.get(ClassesReadFacade);
      (classFacade.findById as jest.Mock).mockResolvedValue({
        id: CLASS_ID,
        year_group_id: YG_ID,
      });
      mockTx.teacherCompetency.update.mockResolvedValue({ ...row, class_id: CLASS_ID });

      const result = await service.update(TENANT_ID, COMP_ID, { class_id: CLASS_ID });

      expect(mockTx.teacherCompetency.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: COMP_ID },
          data: { class_id: CLASS_ID },
        }),
      );
      expect(result).toEqual(expect.objectContaining({ class_id: CLASS_ID }));
    });

    it('demotes a pin back to a pool row when class_id is null and no duplicate pool exists', async () => {
      mockPrisma.teacherCompetency.findFirst
        .mockResolvedValueOnce({ ...row, class_id: CLASS_ID })
        .mockResolvedValueOnce(null);
      mockTx.teacherCompetency.update.mockResolvedValue({ ...row, class_id: null });

      const result = await service.update(TENANT_ID, COMP_ID, { class_id: null });

      expect(result).toEqual(expect.objectContaining({ class_id: null }));
    });

    it('rejects demotion if another pool row for the same teacher/subject/year already exists', async () => {
      mockPrisma.teacherCompetency.findFirst
        .mockResolvedValueOnce({ ...row, class_id: CLASS_ID })
        .mockResolvedValueOnce({ id: 'other-pool-row' });

      await expect(service.update(TENANT_ID, COMP_ID, { class_id: null })).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects promotion when class belongs to a different year group', async () => {
      mockPrisma.teacherCompetency.findFirst.mockResolvedValue(row);
      const classFacade = module.get(ClassesReadFacade);
      (classFacade.findById as jest.Mock).mockResolvedValue({
        id: CLASS_ID,
        year_group_id: 'not-the-same-year-group',
      });

      await expect(
        service.update(TENANT_ID, COMP_ID, { class_id: CLASS_ID }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CLASS_YEAR_GROUP_MISMATCH' }),
      });
    });

    it('throws NotFoundException when the competency id does not exist', async () => {
      mockPrisma.teacherCompetency.findFirst.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, 'missing', { class_id: null })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── getCoverage (per-class) ──────────────────────────────────────────────

  describe('getCoverage', () => {
    it('returns one row per (class, subject) with the right mode for pinned / pool / missing', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findAllYearGroups as jest.Mock).mockResolvedValue([
        { id: 'yg-2', name: 'Year 2' },
      ]);
      (acadFacade.findSubjectsByIdsWithOrder as jest.Mock).mockResolvedValue([
        { id: 'sub-eng', name: 'English' },
        { id: 'sub-math', name: 'Maths' },
      ]);

      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findByAcademicYear as jest.Mock).mockResolvedValue([
        { id: 'cls-2a', name: '2A', year_group_id: 'yg-2', status: 'active' },
        { id: 'cls-2b', name: '2B', year_group_id: 'yg-2', status: 'active' },
      ]);

      const gradebookFacade = module.get(GradebookReadFacade);
      (gradebookFacade.findClassSubjectConfigs as jest.Mock).mockResolvedValue([
        { class_id: 'cls-2a', subject_id: 'sub-eng' },
        { class_id: 'cls-2a', subject_id: 'sub-math' },
        { class_id: 'cls-2b', subject_id: 'sub-eng' },
        { class_id: 'cls-2b', subject_id: 'sub-math' },
      ]);

      // Sarah is pinned to 2A English. David + Michael are pool teachers for Year 2 English.
      // No one can teach Maths — both classes end up 'missing' for Maths.
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([
        {
          staff_profile_id: 'sarah',
          subject_id: 'sub-eng',
          year_group_id: 'yg-2',
          class_id: 'cls-2a',
        },
        { staff_profile_id: 'david', subject_id: 'sub-eng', year_group_id: 'yg-2', class_id: null },
        {
          staff_profile_id: 'michael',
          subject_id: 'sub-eng',
          year_group_id: 'yg-2',
          class_id: null,
        },
      ]);

      const result = await service.getCoverage(TENANT_ID, AY_ID);

      expect(result.summary.total).toBe(4); // 2 classes × 2 subjects
      expect(result.summary.pinned).toBe(1);
      expect(result.summary.pool).toBe(1);
      expect(result.summary.missing).toBe(2);

      const findRow = (classId: string, subjectId: string) =>
        result.rows.find((r) => r.class_id === classId && r.subject_id === subjectId);

      expect(findRow('cls-2a', 'sub-eng')).toMatchObject({
        mode: 'pinned',
        eligible_teacher_count: 1,
        year_group_name: 'Year 2',
        subject_name: 'English',
      });
      expect(findRow('cls-2b', 'sub-eng')).toMatchObject({
        mode: 'pool',
        eligible_teacher_count: 2,
      });
      expect(findRow('cls-2a', 'sub-math')).toMatchObject({ mode: 'missing' });
      expect(findRow('cls-2b', 'sub-math')).toMatchObject({ mode: 'missing' });
    });

    it('ignores inactive classes', async () => {
      const acadFacade = module.get(AcademicReadFacade);
      (acadFacade.findAllYearGroups as jest.Mock).mockResolvedValue([
        { id: 'yg-2', name: 'Year 2' },
      ]);

      const classesFacade = module.get(ClassesReadFacade);
      (classesFacade.findByAcademicYear as jest.Mock).mockResolvedValue([
        { id: 'cls-2a', name: '2A', year_group_id: 'yg-2', status: 'archived' },
      ]);

      const result = await service.getCoverage(TENANT_ID, AY_ID);

      expect(result.rows).toHaveLength(0);
      expect(result.summary.total).toBe(0);
    });
  });

  // ─── bulkCreate ──────────────────────────────────────────────────────────

  describe('bulkCreate', () => {
    it('creates every competency and carries class_id through', async () => {
      const classFacade = module.get(ClassesReadFacade);
      (classFacade.findById as jest.Mock).mockResolvedValue({
        id: CLASS_ID,
        year_group_id: YG_ID,
      });
      mockTx.teacherCompetency.create
        .mockResolvedValueOnce({ id: 'new-1' })
        .mockResolvedValueOnce({ id: 'new-2' });

      const result = await service.bulkCreate(TENANT_ID, {
        staff_profile_id: STAFF_ID,
        academic_year_id: AY_ID,
        competencies: [
          { subject_id: SUBJECT_ID, year_group_id: YG_ID }, // pool row
          { subject_id: SUBJECT_ID, year_group_id: YG_ID, class_id: CLASS_ID }, // pin
        ],
      });

      expect(result.meta.created).toBe(2);
      const createCalls = mockTx.teacherCompetency.create.mock.calls.map(
        (c: [Record<string, unknown>]) => c[0],
      );
      expect((createCalls[0] as { data: { class_id: null } }).data.class_id).toBeNull();
      expect((createCalls[1] as { data: { class_id: string } }).data.class_id).toBe(CLASS_ID);
    });

    it('rejects when a competency references a class in a different year group', async () => {
      const classFacade = module.get(ClassesReadFacade);
      (classFacade.findById as jest.Mock).mockResolvedValue({
        id: CLASS_ID,
        year_group_id: 'wrong-yg',
      });

      await expect(
        service.bulkCreate(TENANT_ID, {
          staff_profile_id: STAFF_ID,
          academic_year_id: AY_ID,
          competencies: [{ subject_id: SUBJECT_ID, year_group_id: YG_ID, class_id: CLASS_ID }],
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'CLASS_YEAR_GROUP_MISMATCH' }),
      });
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes an existing competency', async () => {
      mockPrisma.teacherCompetency.findFirst.mockResolvedValue({ id: COMP_ID });

      const result = await service.delete(TENANT_ID, COMP_ID);

      expect(result.message).toBe('Teacher competency deleted');
    });

    it('throws NotFoundException when the competency does not exist', async () => {
      mockPrisma.teacherCompetency.findFirst.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteAllForTeacher ─────────────────────────────────────────────────

  describe('deleteAllForTeacher', () => {
    it('deletes everything for the given staff profile', async () => {
      mockTx.teacherCompetency.deleteMany.mockResolvedValue({ count: 3 });

      const result = await service.deleteAllForTeacher(TENANT_ID, AY_ID, STAFF_ID);

      expect(result.meta.deleted).toBe(3);
    });
  });

  // ─── copyFromAcademicYear ────────────────────────────────────────────────

  describe('copyFromAcademicYear', () => {
    it('throws BadRequestException when the source year has no competencies', async () => {
      mockPrisma.teacherCompetency.findMany.mockResolvedValue([]);

      await expect(service.copyFromAcademicYear(TENANT_ID, AY_ID, AY_ID_TARGET)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
