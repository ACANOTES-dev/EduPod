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
  academicYear: { findFirst: jest.fn(), findMany: jest.fn() },
  academicPeriod: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
  yearGroup: { findFirst: jest.fn(), findMany: jest.fn() },
  subject: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
};

const mockClassesReadFacade = {
  findEnrolmentsGeneric: jest.fn(),
  findEnrolledStudentIds: jest.fn(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AcademicReadFacade — branches', () => {
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

  // ─── findPeriodById ─────────────────────────────────────────────────────
  describe('AcademicReadFacade — findPeriodById', () => {
    it('should return period when found', async () => {
      const period = { id: PERIOD_ID, academic_year: { name: '2025-26' } };
      mockPrisma.academicPeriod.findFirst.mockResolvedValue(period);
      const result = await facade.findPeriodById(TENANT_ID, PERIOD_ID);
      expect(result).toEqual(period);
    });

    it('should return null when not found', async () => {
      mockPrisma.academicPeriod.findFirst.mockResolvedValue(null);
      const result = await facade.findPeriodById(TENANT_ID, PERIOD_ID);
      expect(result).toBeNull();
    });
  });

  // ─── findPeriodsForYear ─────────────────────────────────────────────────
  describe('AcademicReadFacade — findPeriodsForYear', () => {
    it('should return periods ordered by start_date', async () => {
      const periods = [{ id: PERIOD_ID }];
      mockPrisma.academicPeriod.findMany.mockResolvedValue(periods);
      const result = await facade.findPeriodsForYear(TENANT_ID, YEAR_ID);
      expect(result).toEqual(periods);
      expect(mockPrisma.academicPeriod.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { start_date: 'asc' },
          where: { tenant_id: TENANT_ID, academic_year_id: YEAR_ID },
        }),
      );
    });
  });

  // ─── findYearById ───────────────────────────────────────────────────────
  describe('AcademicReadFacade — findYearById', () => {
    it('should return year when found', async () => {
      const year = { id: YEAR_ID, name: '2025-26', status: 'active' };
      mockPrisma.academicYear.findFirst.mockResolvedValue(year);
      const result = await facade.findYearById(TENANT_ID, YEAR_ID);
      expect(result).toEqual(year);
    });

    it('should return null when not found', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);
      const result = await facade.findYearById(TENANT_ID, YEAR_ID);
      expect(result).toBeNull();
    });
  });

  // ─── findCurrentYear (non-null path) ─────────────────────────────────────
  describe('AcademicReadFacade — findCurrentYear', () => {
    it('should return year when active year exists', async () => {
      const year = { id: YEAR_ID, name: '2025-26', status: 'active' };
      mockPrisma.academicYear.findFirst.mockResolvedValue(year);
      const result = await facade.findCurrentYear(TENANT_ID);
      expect(result).toEqual(year);
    });
  });

  // ─── findYearGroupsWithActiveClasses ────────────────────────────────────
  describe('AcademicReadFacade — findYearGroupsWithActiveClasses', () => {
    it('should return year groups with active classes', async () => {
      const ygs = [{ id: YG_ID, name: 'Year 1' }];
      mockPrisma.yearGroup.findMany.mockResolvedValue(ygs);
      const result = await facade.findYearGroupsWithActiveClasses(TENANT_ID, YEAR_ID);
      expect(result).toEqual(ygs);
    });

    it('should return empty when none found', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      const result = await facade.findYearGroupsWithActiveClasses(TENANT_ID, YEAR_ID);
      expect(result).toEqual([]);
    });
  });

  // ─── findAllYearGroups ──────────────────────────────────────────────────
  describe('AcademicReadFacade — findAllYearGroups', () => {
    it('should return all year groups', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([{ id: YG_ID, name: 'Y1' }]);
      const result = await facade.findAllYearGroups(TENANT_ID);
      expect(result).toHaveLength(1);
    });
  });

  // ─── findAllYearGroupsWithOrder ─────────────────────────────────────────
  describe('AcademicReadFacade — findAllYearGroupsWithOrder', () => {
    it('should return year groups with display_order', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        { id: YG_ID, name: 'Y1', display_order: 1 },
      ]);
      const result = await facade.findAllYearGroupsWithOrder(TENANT_ID);
      expect(result[0]!.display_order).toBe(1);
    });
  });

  // ─── findYearGroupById ──────────────────────────────────────────────────
  describe('AcademicReadFacade — findYearGroupById', () => {
    it('should return year group when found', async () => {
      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: YG_ID, name: 'Y1' });
      const result = await facade.findYearGroupById(TENANT_ID, YG_ID);
      expect(result).toEqual({ id: YG_ID, name: 'Y1' });
    });

    it('should return null when not found', async () => {
      mockPrisma.yearGroup.findFirst.mockResolvedValue(null);
      const result = await facade.findYearGroupById(TENANT_ID, YG_ID);
      expect(result).toBeNull();
    });
  });

  // ─── findSubjectById ────────────────────────────────────────────────────
  describe('AcademicReadFacade — findSubjectById', () => {
    it('should return subject when found', async () => {
      const subject = { id: SUBJECT_ID, name: 'Math', code: 'MA', subject_type: 'core' };
      mockPrisma.subject.findFirst.mockResolvedValue(subject);
      const result = await facade.findSubjectById(TENANT_ID, SUBJECT_ID);
      expect(result).toEqual(subject);
    });

    it('should return null when not found', async () => {
      mockPrisma.subject.findFirst.mockResolvedValue(null);
      const result = await facade.findSubjectById(TENANT_ID, SUBJECT_ID);
      expect(result).toBeNull();
    });
  });

  // ─── findYearByName ─────────────────────────────────────────────────────
  describe('AcademicReadFacade — findYearByName', () => {
    it('should return year when found by name', async () => {
      const year = { id: YEAR_ID, name: '2024-2025', status: 'active' };
      mockPrisma.academicYear.findFirst.mockResolvedValue(year);
      const result = await facade.findYearByName(TENANT_ID, '2024-2025');
      expect(result).toEqual(year);
    });

    it('should return null when no year with that name', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);
      const result = await facade.findYearByName(TENANT_ID, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  // ─── findPeriodCoveringDate null case ───────────────────────────────────
  describe('AcademicReadFacade — findPeriodCoveringDate', () => {
    it('should return null when no period covers the date', async () => {
      mockPrisma.academicPeriod.findFirst.mockResolvedValue(null);
      const result = await facade.findPeriodCoveringDate(TENANT_ID, YEAR_ID, new Date());
      expect(result).toBeNull();
    });
  });

  // ─── findYearGroupsWithClassesAndCounts ─────────────────────────────────
  describe('AcademicReadFacade — findYearGroupsWithClassesAndCounts', () => {
    it('should return year groups with nested class counts', async () => {
      const data = [
        {
          id: YG_ID,
          name: 'Year 1',
          classes: [{ id: CLASS_ID, name: '1A', _count: { class_enrolments: 25 } }],
        },
      ];
      mockPrisma.yearGroup.findMany.mockResolvedValue(data);
      const result = await facade.findYearGroupsWithClassesAndCounts(TENANT_ID, YEAR_ID);
      expect(result[0]!.classes[0]!._count.class_enrolments).toBe(25);
    });

    it('should return empty when no year groups have active classes', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      const result = await facade.findYearGroupsWithClassesAndCounts(TENANT_ID, YEAR_ID);
      expect(result).toEqual([]);
    });
  });

  // ─── findClassEnrolments — dateFilter is null ───────────────────────────
  describe('AcademicReadFacade — findClassEnrolments — null dateFilter', () => {
    it('should not apply date filter when period lookup returns null', async () => {
      mockPrisma.academicPeriod.findFirst.mockResolvedValue(null);
      mockClassesReadFacade.findEnrolmentsGeneric.mockResolvedValue([]);

      await facade.findClassEnrolments(TENANT_ID, CLASS_ID, PERIOD_ID);

      // The where clause should NOT have start_date/OR keys
      const callArgs = mockClassesReadFacade.findEnrolmentsGeneric.mock.calls[0]!;
      const whereArg = callArgs[1] as Record<string, unknown>;
      expect(whereArg.start_date).toBeUndefined();
      expect(whereArg.OR).toBeUndefined();
    });
  });

  // ─── findStudentEnrolments — dateFilter is null ─────────────────────────
  describe('AcademicReadFacade — findStudentEnrolments — null dateFilter', () => {
    it('should not apply date filter when period lookup returns null', async () => {
      mockPrisma.academicPeriod.findFirst.mockResolvedValue(null);
      mockClassesReadFacade.findEnrolmentsGeneric.mockResolvedValue([]);

      await facade.findStudentEnrolments(TENANT_ID, STUDENT_ID, PERIOD_ID);

      const callArgs = mockClassesReadFacade.findEnrolmentsGeneric.mock.calls[0]!;
      const whereArg = callArgs[1] as Record<string, unknown>;
      expect(whereArg.start_date).toBeUndefined();
      expect(whereArg.OR).toBeUndefined();
    });

    it('should apply date filter when period lookup returns dates', async () => {
      mockPrisma.academicPeriod.findFirst.mockResolvedValue({
        start_date: new Date('2026-01-01'),
        end_date: new Date('2026-06-30'),
      });
      mockClassesReadFacade.findEnrolmentsGeneric.mockResolvedValue([]);

      await facade.findStudentEnrolments(TENANT_ID, STUDENT_ID, PERIOD_ID);

      const callArgs = mockClassesReadFacade.findEnrolmentsGeneric.mock.calls[0]!;
      const whereArg = callArgs[1] as Record<string, unknown>;
      expect(whereArg.start_date).toBeDefined();
      expect(whereArg.OR).toBeDefined();
    });
  });

  // ─── findSubjectsGeneric — all option combinations ──────────────────────
  describe('AcademicReadFacade — findSubjectsGeneric — where override', () => {
    it('should merge where with tenant_id', async () => {
      mockPrisma.subject.findMany.mockResolvedValue([]);
      await facade.findSubjectsGeneric(TENANT_ID, { where: { active: true } });
      expect(mockPrisma.subject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, active: true },
        }),
      );
    });

    it('should handle all four options simultaneously', async () => {
      mockPrisma.subject.findMany.mockResolvedValue([]);
      await facade.findSubjectsGeneric(TENANT_ID, {
        where: { active: true },
        include: { des_code_mapping: true } as Record<string, boolean>,
        select: { id: true },
        orderBy: { name: 'asc' },
      });
      expect(mockPrisma.subject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { des_code_mapping: true },
          select: { id: true },
          orderBy: { name: 'asc' },
        }),
      );
    });
  });

  // ─── findPeriodsGeneric — no where/no select ───────────────────────────
  describe('AcademicReadFacade — findPeriodsGeneric — no params', () => {
    it('should query with only tenant_id when no where/select', async () => {
      mockPrisma.academicPeriod.findMany.mockResolvedValue([]);
      await facade.findPeriodsGeneric(TENANT_ID);
      const call = mockPrisma.academicPeriod.findMany.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.where).toEqual({ tenant_id: TENANT_ID });
      expect(call.select).toBeUndefined();
    });
  });

  // ─── findAllSubjects — with and without select ─────────────────────────
  describe('AcademicReadFacade — findAllSubjects — combinations', () => {
    it('edge: should handle empty result set', async () => {
      mockPrisma.subject.findMany.mockResolvedValue([]);
      const result = await facade.findAllSubjects(TENANT_ID, { id: true });
      expect(result).toEqual([]);
    });
  });

  // ─── countSubjects — no extra where ─────────────────────────────────────
  describe('AcademicReadFacade — countSubjects — empty where', () => {
    it('should count with just tenant_id when no where supplied', async () => {
      mockPrisma.subject.count.mockResolvedValue(10);
      const result = await facade.countSubjects(TENANT_ID);
      expect(result).toBe(10);
      expect(mockPrisma.subject.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
    });
  });

  // ─── findYearGroupsGeneric — select + default orderBy interaction ──────
  describe('AcademicReadFacade — findYearGroupsGeneric — select + orderBy interaction', () => {
    it('should use both select and custom orderBy when provided', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      await facade.findYearGroupsGeneric(TENANT_ID, { id: true }, { name: 'asc' });
      expect(mockPrisma.yearGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true },
          orderBy: { name: 'asc' },
        }),
      );
    });

    it('should use select with default orderBy when no orderBy provided', async () => {
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);
      await facade.findYearGroupsGeneric(TENANT_ID, { id: true, name: true });
      expect(mockPrisma.yearGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true, name: true },
          orderBy: { display_order: 'asc' },
        }),
      );
    });
  });

  // ─── findCurrentPeriod ──────────────────────────────────────────────────
  describe('AcademicReadFacade — findCurrentPeriod — non-null', () => {
    it('should include academic_year select', async () => {
      const period = { id: PERIOD_ID, status: 'active', academic_year: { name: '2025-26' } };
      mockPrisma.academicPeriod.findFirst.mockResolvedValue(period);
      await facade.findCurrentPeriod(TENANT_ID);
      expect(mockPrisma.academicPeriod.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          include: { academic_year: { select: { name: true } } },
        }),
      );
    });
  });
});
