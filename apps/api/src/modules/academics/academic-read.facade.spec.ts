import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import { AcademicReadFacade } from './academic-read.facade';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PERIOD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SUBJECT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const YG_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const CLASS_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const STUDENT_ID = '11111111-1111-1111-1111-111111111111';

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

const mockPrisma = {
  academicYear: {
    findFirst: jest.fn(),
  },
  academicPeriod: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  yearGroup: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  subject: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

const mockClassesReadFacade = {
  findEnrolmentsGeneric: jest.fn(),
  findEnrolledStudentIds: jest.fn(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AcademicReadFacade', () => {
  let facade: AcademicReadFacade;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AcademicReadFacade,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClassesReadFacade, useValue: mockClassesReadFacade },
      ],
    }).compile();

    facade = module.get(AcademicReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findYearByIdOrThrow ─────────────────────────────────────────────────

  describe('AcademicReadFacade — findYearByIdOrThrow', () => {
    it('should return year id when found', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: YEAR_ID });
      const result = await facade.findYearByIdOrThrow(TENANT_ID, YEAR_ID);
      expect(result).toBe(YEAR_ID);
    });

    it('should throw NotFoundException when year not found', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);
      await expect(facade.findYearByIdOrThrow(TENANT_ID, YEAR_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── findSubjectByIdOrThrow ──────────────────────────────────────────────

  describe('AcademicReadFacade — findSubjectByIdOrThrow', () => {
    it('should return subject id when found', async () => {
      mockPrisma.subject.findFirst.mockResolvedValue({ id: SUBJECT_ID });
      const result = await facade.findSubjectByIdOrThrow(TENANT_ID, SUBJECT_ID);
      expect(result).toBe(SUBJECT_ID);
    });

    it('should throw NotFoundException when subject not found', async () => {
      mockPrisma.subject.findFirst.mockResolvedValue(null);
      await expect(facade.findSubjectByIdOrThrow(TENANT_ID, SUBJECT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── findYearGroupByIdOrThrow ────────────────────────────────────────────

  describe('AcademicReadFacade — findYearGroupByIdOrThrow', () => {
    it('should return year group id when found', async () => {
      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: YG_ID });
      const result = await facade.findYearGroupByIdOrThrow(TENANT_ID, YG_ID);
      expect(result).toBe(YG_ID);
    });

    it('should throw NotFoundException when year group not found', async () => {
      mockPrisma.yearGroup.findFirst.mockResolvedValue(null);
      await expect(facade.findYearGroupByIdOrThrow(TENANT_ID, YG_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── findCurrentYearId ───────────────────────────────────────────────────

  describe('AcademicReadFacade — findCurrentYearId', () => {
    it('should return year id when active year exists', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: YEAR_ID });
      const result = await facade.findCurrentYearId(TENANT_ID);
      expect(result).toBe(YEAR_ID);
    });

    it('should throw NotFoundException when no active year', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);
      await expect(facade.findCurrentYearId(TENANT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findSubjectsByIdsWithOrder ──────────────────────────────────────────

  describe('AcademicReadFacade — findSubjectsByIdsWithOrder', () => {
    it('should return empty array when subjectIds is empty', async () => {
      const result = await facade.findSubjectsByIdsWithOrder(TENANT_ID, []);
      expect(result).toEqual([]);
      expect(mockPrisma.subject.findMany).not.toHaveBeenCalled();
    });

    it('should query subjects when ids provided', async () => {
      mockPrisma.subject.findMany.mockResolvedValue([{ id: SUBJECT_ID, name: 'Math', code: 'MA' }]);
      const result = await facade.findSubjectsByIdsWithOrder(TENANT_ID, [SUBJECT_ID]);
      expect(result).toHaveLength(1);
    });
  });

  // ─── findSubjectsByIds ───────────────────────────────────────────────────

  describe('AcademicReadFacade — findSubjectsByIds', () => {
    it('should return empty array when subjectIds is empty', async () => {
      const result = await facade.findSubjectsByIds(TENANT_ID, []);
      expect(result).toEqual([]);
      expect(mockPrisma.subject.findMany).not.toHaveBeenCalled();
    });

    it('should query subjects when ids provided', async () => {
      mockPrisma.subject.findMany.mockResolvedValue([{ id: SUBJECT_ID, name: 'Math', code: 'MA' }]);
      const result = await facade.findSubjectsByIds(TENANT_ID, [SUBJECT_ID]);
      expect(result).toHaveLength(1);
    });
  });

  // ─── findPeriodsByIds ────────────────────────────────────────────────────

  describe('AcademicReadFacade — findPeriodsByIds', () => {
    it('should return empty array when periodIds is empty', async () => {
      const result = await facade.findPeriodsByIds(TENANT_ID, []);
      expect(result).toEqual([]);
      expect(mockPrisma.academicPeriod.findMany).not.toHaveBeenCalled();
    });

    it('should query periods when ids provided', async () => {
      mockPrisma.academicPeriod.findMany.mockResolvedValue([{ id: PERIOD_ID, name: 'Term 1' }]);
      const result = await facade.findPeriodsByIds(TENANT_ID, [PERIOD_ID]);
      expect(result).toHaveLength(1);
    });
  });

  // ─── findClassEnrolments ─────────────────────────────────────────────────

  describe('AcademicReadFacade — findClassEnrolments', () => {
    it('should call without date filter when no periodId', async () => {
      mockClassesReadFacade.findEnrolmentsGeneric.mockResolvedValue([]);
      await facade.findClassEnrolments(TENANT_ID, CLASS_ID);
      expect(mockClassesReadFacade.findEnrolmentsGeneric).toHaveBeenCalled();
    });

    it('should apply date filter when periodId is provided', async () => {
      mockPrisma.academicPeriod.findFirst.mockResolvedValue({
        start_date: new Date('2026-01-01'),
        end_date: new Date('2026-06-30'),
      });
      mockClassesReadFacade.findEnrolmentsGeneric.mockResolvedValue([]);

      await facade.findClassEnrolments(TENANT_ID, CLASS_ID, PERIOD_ID);

      expect(mockPrisma.academicPeriod.findFirst).toHaveBeenCalled();
      expect(mockClassesReadFacade.findEnrolmentsGeneric).toHaveBeenCalled();
    });

    it('edge: should handle null period (not found) gracefully', async () => {
      mockPrisma.academicPeriod.findFirst.mockResolvedValue(null);
      mockClassesReadFacade.findEnrolmentsGeneric.mockResolvedValue([]);

      await facade.findClassEnrolments(TENANT_ID, CLASS_ID, PERIOD_ID);

      expect(mockClassesReadFacade.findEnrolmentsGeneric).toHaveBeenCalled();
    });
  });

  // ─── findStudentEnrolments ───────────────────────────────────────────────

  describe('AcademicReadFacade — findStudentEnrolments', () => {
    it('should call without date filter when no periodId', async () => {
      mockClassesReadFacade.findEnrolmentsGeneric.mockResolvedValue([]);
      await facade.findStudentEnrolments(TENANT_ID, STUDENT_ID);
      expect(mockClassesReadFacade.findEnrolmentsGeneric).toHaveBeenCalled();
    });

    it('should apply date filter when periodId is provided', async () => {
      mockPrisma.academicPeriod.findFirst.mockResolvedValue({
        start_date: new Date('2026-01-01'),
        end_date: new Date('2026-06-30'),
      });
      mockClassesReadFacade.findEnrolmentsGeneric.mockResolvedValue([]);

      await facade.findStudentEnrolments(TENANT_ID, STUDENT_ID, PERIOD_ID);
      expect(mockPrisma.academicPeriod.findFirst).toHaveBeenCalled();
    });
  });

  // ─── findStudentIdsForClass ──────────────────────────────────────────────

  describe('AcademicReadFacade — findStudentIdsForClass', () => {
    it('should delegate to classesReadFacade', async () => {
      mockClassesReadFacade.findEnrolledStudentIds.mockResolvedValue([STUDENT_ID]);
      const result = await facade.findStudentIdsForClass(TENANT_ID, CLASS_ID);
      expect(result).toEqual([STUDENT_ID]);
    });
  });

  // ─── findSubjectsGeneric ─────────────────────────────────────────────────

  describe('AcademicReadFacade — findSubjectsGeneric', () => {
    it('should pass include when provided', async () => {
      mockPrisma.subject.findMany.mockResolvedValue([]);
      await facade.findSubjectsGeneric(TENANT_ID, {
        include: { des_code_mapping: true } as Record<string, boolean>,
      });
      expect(mockPrisma.subject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ include: { des_code_mapping: true } }),
      );
    });

    it('should pass select when provided', async () => {
      mockPrisma.subject.findMany.mockResolvedValue([]);
      await facade.findSubjectsGeneric(TENANT_ID, { select: { id: true, name: true } });
      expect(mockPrisma.subject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: { id: true, name: true } }),
      );
    });

    it('should pass orderBy when provided', async () => {
      mockPrisma.subject.findMany.mockResolvedValue([]);
      await facade.findSubjectsGeneric(TENANT_ID, { orderBy: { name: 'asc' } });
      expect(mockPrisma.subject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
    });

    it('should not include optional fields when not provided', async () => {
      mockPrisma.subject.findMany.mockResolvedValue([]);
      await facade.findSubjectsGeneric(TENANT_ID, {});
      const call = mockPrisma.subject.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.include).toBeUndefined();
      expect(call.select).toBeUndefined();
      expect(call.orderBy).toBeUndefined();
    });
  });

  // ─── findYearGroupsGeneric ───────────────────────────────────────────────

  describe('AcademicReadFacade — findYearGroupsGeneric', () => {
    it('should use default orderBy when not provided', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      await facade.findYearGroupsGeneric(TENANT_ID);
      expect(mockPrisma.yearGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { display_order: 'asc' } }),
      );
    });

    it('should use provided orderBy', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      await facade.findYearGroupsGeneric(TENANT_ID, undefined, { name: 'desc' });
      expect(mockPrisma.yearGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'desc' } }),
      );
    });

    it('should pass select when provided', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      await facade.findYearGroupsGeneric(TENANT_ID, { id: true, name: true });
      expect(mockPrisma.yearGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: { id: true, name: true } }),
      );
    });

    it('should not pass select when not provided', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      await facade.findYearGroupsGeneric(TENANT_ID);
      const call = mockPrisma.yearGroup.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.select).toBeUndefined();
    });
  });

  // ─── findPeriodsGeneric ──────────────────────────────────────────────────

  describe('AcademicReadFacade — findPeriodsGeneric', () => {
    it('should pass select when provided', async () => {
      mockPrisma.academicPeriod.findMany.mockResolvedValue([]);
      await facade.findPeriodsGeneric(TENANT_ID, undefined, { id: true, name: true });
      expect(mockPrisma.academicPeriod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: { id: true, name: true } }),
      );
    });

    it('should not pass select when not provided', async () => {
      mockPrisma.academicPeriod.findMany.mockResolvedValue([]);
      await facade.findPeriodsGeneric(TENANT_ID);
      const call = mockPrisma.academicPeriod.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.select).toBeUndefined();
    });

    it('should merge where clause with tenant_id', async () => {
      mockPrisma.academicPeriod.findMany.mockResolvedValue([]);
      await facade.findPeriodsGeneric(TENANT_ID, { status: 'active' });
      expect(mockPrisma.academicPeriod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: 'active' },
        }),
      );
    });
  });

  // ─── findAllSubjects ─────────────────────────────────────────────────────

  describe('AcademicReadFacade — findAllSubjects', () => {
    it('should pass select when provided', async () => {
      mockPrisma.subject.findMany.mockResolvedValue([]);
      await facade.findAllSubjects(TENANT_ID, { id: true, name: true });
      expect(mockPrisma.subject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: { id: true, name: true } }),
      );
    });

    it('should not pass select when not provided', async () => {
      mockPrisma.subject.findMany.mockResolvedValue([]);
      await facade.findAllSubjects(TENANT_ID);
      const call = mockPrisma.subject.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.select).toBeUndefined();
    });
  });

  // ─── countSubjects ───────────────────────────────────────────────────────

  describe('AcademicReadFacade — countSubjects', () => {
    it('should count with no additional where', async () => {
      mockPrisma.subject.count.mockResolvedValue(5);
      const result = await facade.countSubjects(TENANT_ID);
      expect(result).toBe(5);
    });

    it('should merge additional where clause', async () => {
      mockPrisma.subject.count.mockResolvedValue(3);
      await facade.countSubjects(TENANT_ID, { active: true });
      expect(mockPrisma.subject.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, active: true },
      });
    });
  });

  // ─── Simple delegation methods ───────────────────────────────────────────

  describe('AcademicReadFacade — findCurrentPeriod', () => {
    it('should return current period', async () => {
      const period = { id: PERIOD_ID, status: 'active', academic_year: { name: '2025-26' } };
      mockPrisma.academicPeriod.findFirst.mockResolvedValue(period);
      const result = await facade.findCurrentPeriod(TENANT_ID);
      expect(result).toEqual(period);
    });

    it('should return null when no active period', async () => {
      mockPrisma.academicPeriod.findFirst.mockResolvedValue(null);
      const result = await facade.findCurrentPeriod(TENANT_ID);
      expect(result).toBeNull();
    });
  });

  describe('AcademicReadFacade — findCurrentYear', () => {
    it('should return current year or null', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);
      const result = await facade.findCurrentYear(TENANT_ID);
      expect(result).toBeNull();
    });
  });

  describe('AcademicReadFacade — findPeriodCoveringDate', () => {
    it('should return period covering the date', async () => {
      mockPrisma.academicPeriod.findFirst.mockResolvedValue({ id: PERIOD_ID });
      const result = await facade.findPeriodCoveringDate(TENANT_ID, YEAR_ID, new Date());
      expect(result).toEqual({ id: PERIOD_ID });
    });
  });
});
