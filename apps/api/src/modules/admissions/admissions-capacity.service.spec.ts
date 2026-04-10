import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { AdmissionsCapacityService, type YearGroupPair } from './admissions-capacity.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const ACADEMIC_YEAR_1 = 'a1111111-1111-1111-1111-111111111111';
const ACADEMIC_YEAR_2 = 'a2222222-2222-2222-2222-222222222222';
const YEAR_GROUP_1 = 'b1111111-1111-1111-1111-111111111111';
const YEAR_GROUP_2 = 'b2222222-2222-2222-2222-222222222222';
const STUDENT_ID = 'c1111111-1111-1111-1111-111111111111';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

type RawRow = {
  academic_year_id: string;
  year_group_id: string;
  total_capacity: number;
  enrolled_student_count: number;
  conditional_approval_count: number;
};

function buildMockPrisma() {
  const queryRaw = jest.fn();
  const studentFindFirst = jest.fn();
  const classEnrolmentFindFirst = jest.fn();

  const mock = {
    $queryRaw: queryRaw,
    student: { findFirst: studentFindFirst },
    classEnrolment: { findFirst: classEnrolmentFindFirst },
  };

  return {
    mock: mock as unknown as PrismaService,
    queryRaw,
    studentFindFirst,
    classEnrolmentFindFirst,
  };
}

function row(
  academicYearId: string,
  yearGroupId: string,
  total: number,
  enrolled: number,
  conditional: number,
): RawRow {
  return {
    academic_year_id: academicYearId,
    year_group_id: yearGroupId,
    total_capacity: total,
    enrolled_student_count: enrolled,
    conditional_approval_count: conditional,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AdmissionsCapacityService', () => {
  let service: AdmissionsCapacityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdmissionsCapacityService, { provide: PrismaService, useValue: {} }],
    }).compile();

    service = module.get(AdmissionsCapacityService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── getAvailableSeats ────────────────────────────────────────────────────

  describe('getAvailableSeats', () => {
    it('returns configured=false when the year group has no classes', async () => {
      const { mock, queryRaw } = buildMockPrisma();
      // CTE LEFT JOINs still emit one row per pair, with zero counts.
      queryRaw.mockResolvedValue([row(ACADEMIC_YEAR_1, YEAR_GROUP_1, 0, 0, 0)]);

      const result = await service.getAvailableSeats(mock, {
        tenantId: TENANT_A,
        academicYearId: ACADEMIC_YEAR_1,
        yearGroupId: YEAR_GROUP_1,
      });

      expect(result).toEqual({
        total_capacity: 0,
        enrolled_student_count: 0,
        conditional_approval_count: 0,
        available_seats: 0,
        configured: false,
      });
    });

    it('returns full capacity when one class has no students', async () => {
      const { mock, queryRaw } = buildMockPrisma();
      queryRaw.mockResolvedValue([row(ACADEMIC_YEAR_1, YEAR_GROUP_1, 25, 0, 0)]);

      const result = await service.getAvailableSeats(mock, {
        tenantId: TENANT_A,
        academicYearId: ACADEMIC_YEAR_1,
        yearGroupId: YEAR_GROUP_1,
      });

      expect(result).toEqual({
        total_capacity: 25,
        enrolled_student_count: 0,
        conditional_approval_count: 0,
        available_seats: 25,
        configured: true,
      });
    });

    it('subtracts enrolled students from capacity', async () => {
      const { mock, queryRaw } = buildMockPrisma();
      queryRaw.mockResolvedValue([row(ACADEMIC_YEAR_1, YEAR_GROUP_1, 50, 40, 0)]);

      const result = await service.getAvailableSeats(mock, {
        tenantId: TENANT_A,
        academicYearId: ACADEMIC_YEAR_1,
        yearGroupId: YEAR_GROUP_1,
      });

      expect(result.available_seats).toBe(10);
      expect(result.configured).toBe(true);
    });

    it('subtracts conditional approvals from capacity', async () => {
      const { mock, queryRaw } = buildMockPrisma();
      queryRaw.mockResolvedValue([row(ACADEMIC_YEAR_1, YEAR_GROUP_1, 50, 40, 5)]);

      const result = await service.getAvailableSeats(mock, {
        tenantId: TENANT_A,
        academicYearId: ACADEMIC_YEAR_1,
        yearGroupId: YEAR_GROUP_1,
      });

      expect(result.available_seats).toBe(5);
      expect(result.conditional_approval_count).toBe(5);
    });

    it('clamps over-consumption to zero (never returns a negative availability)', async () => {
      const { mock, queryRaw } = buildMockPrisma();
      queryRaw.mockResolvedValue([row(ACADEMIC_YEAR_1, YEAR_GROUP_1, 50, 48, 5)]);

      const result = await service.getAvailableSeats(mock, {
        tenantId: TENANT_A,
        academicYearId: ACADEMIC_YEAR_1,
        yearGroupId: YEAR_GROUP_1,
      });

      expect(result.available_seats).toBe(0);
      expect(result.total_capacity).toBe(50);
      expect(result.enrolled_student_count).toBe(48);
      expect(result.conditional_approval_count).toBe(5);
    });

    it('restricts capacity to active classes and uses the tenant id in the query', async () => {
      const { mock, queryRaw } = buildMockPrisma();
      queryRaw.mockResolvedValue([row(ACADEMIC_YEAR_1, YEAR_GROUP_1, 25, 0, 0)]);

      await service.getAvailableSeats(mock, {
        tenantId: TENANT_A,
        academicYearId: ACADEMIC_YEAR_1,
        yearGroupId: YEAR_GROUP_1,
      });

      expect(queryRaw).toHaveBeenCalledTimes(1);
      const sqlArg = queryRaw.mock.calls[0][0] as Prisma.Sql;
      // Archived/inactive classes must not contribute to capacity.
      expect(sqlArg.sql).toMatch(/c\.status = 'active'/);
      expect(sqlArg.sql).toMatch(/ce\.status = 'active'/);
      expect(sqlArg.sql).toMatch(/a\.status = 'conditional_approval'/);
      // Tenant id is bound as a parameter (no string interpolation into SQL).
      expect(sqlArg.values).toContain(TENANT_A);
    });

    it('does not leak another tenant — the tenant id is always bound into the query', async () => {
      const { mock, queryRaw } = buildMockPrisma();
      queryRaw.mockResolvedValue([row(ACADEMIC_YEAR_1, YEAR_GROUP_1, 25, 0, 0)]);

      await service.getAvailableSeats(mock, {
        tenantId: TENANT_B,
        academicYearId: ACADEMIC_YEAR_1,
        yearGroupId: YEAR_GROUP_1,
      });

      const sqlArg = queryRaw.mock.calls[0][0] as Prisma.Sql;
      expect(sqlArg.values).toContain(TENANT_B);
      expect(sqlArg.values).not.toContain(TENANT_A);
    });

    it('returns a zero/unconfigured fallback when the DB returns nothing', async () => {
      const { mock, queryRaw } = buildMockPrisma();
      queryRaw.mockResolvedValue([]);

      const result = await service.getAvailableSeats(mock, {
        tenantId: TENANT_A,
        academicYearId: ACADEMIC_YEAR_1,
        yearGroupId: YEAR_GROUP_1,
      });

      expect(result).toEqual({
        total_capacity: 0,
        enrolled_student_count: 0,
        conditional_approval_count: 0,
        available_seats: 0,
        configured: false,
      });
    });
  });

  // ── getAvailableSeatsBatch ───────────────────────────────────────────────

  describe('getAvailableSeatsBatch', () => {
    it('returns an empty map when called with no pairs without hitting the DB', async () => {
      const { mock, queryRaw } = buildMockPrisma();

      const result = await service.getAvailableSeatsBatch(mock, {
        tenantId: TENANT_A,
        pairs: [],
      });

      expect(result.size).toBe(0);
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('returns a map keyed by academicYearId:yearGroupId for every requested pair', async () => {
      const { mock, queryRaw } = buildMockPrisma();
      queryRaw.mockResolvedValue([
        row(ACADEMIC_YEAR_1, YEAR_GROUP_1, 50, 40, 0),
        row(ACADEMIC_YEAR_1, YEAR_GROUP_2, 25, 10, 2),
        row(ACADEMIC_YEAR_2, YEAR_GROUP_1, 0, 0, 0),
      ]);

      const pairs: YearGroupPair[] = [
        { academicYearId: ACADEMIC_YEAR_1, yearGroupId: YEAR_GROUP_1 },
        { academicYearId: ACADEMIC_YEAR_1, yearGroupId: YEAR_GROUP_2 },
        { academicYearId: ACADEMIC_YEAR_2, yearGroupId: YEAR_GROUP_1 },
      ];

      const result = await service.getAvailableSeatsBatch(mock, {
        tenantId: TENANT_A,
        pairs,
      });

      expect(result.size).toBe(3);
      expect(result.get(`${ACADEMIC_YEAR_1}:${YEAR_GROUP_1}`)).toEqual({
        total_capacity: 50,
        enrolled_student_count: 40,
        conditional_approval_count: 0,
        available_seats: 10,
        configured: true,
      });
      expect(result.get(`${ACADEMIC_YEAR_1}:${YEAR_GROUP_2}`)).toEqual({
        total_capacity: 25,
        enrolled_student_count: 10,
        conditional_approval_count: 2,
        available_seats: 13,
        configured: true,
      });
      expect(result.get(`${ACADEMIC_YEAR_2}:${YEAR_GROUP_1}`)).toEqual({
        total_capacity: 0,
        enrolled_student_count: 0,
        conditional_approval_count: 0,
        available_seats: 0,
        configured: false,
      });
    });

    it('order-independent — the caller can pass pairs in any order', async () => {
      const { mock, queryRaw } = buildMockPrisma();
      // DB returns rows in reverse order; the map should still key correctly.
      queryRaw.mockResolvedValue([
        row(ACADEMIC_YEAR_2, YEAR_GROUP_1, 25, 0, 0),
        row(ACADEMIC_YEAR_1, YEAR_GROUP_1, 50, 10, 0),
      ]);

      const result = await service.getAvailableSeatsBatch(mock, {
        tenantId: TENANT_A,
        pairs: [
          { academicYearId: ACADEMIC_YEAR_1, yearGroupId: YEAR_GROUP_1 },
          { academicYearId: ACADEMIC_YEAR_2, yearGroupId: YEAR_GROUP_1 },
        ],
      });

      expect(result.get(`${ACADEMIC_YEAR_1}:${YEAR_GROUP_1}`)?.available_seats).toBe(40);
      expect(result.get(`${ACADEMIC_YEAR_2}:${YEAR_GROUP_1}`)?.available_seats).toBe(25);
    });

    it('dedupes duplicate pairs before querying and fills in missing rows', async () => {
      const { mock, queryRaw } = buildMockPrisma();
      queryRaw.mockResolvedValue([row(ACADEMIC_YEAR_1, YEAR_GROUP_1, 30, 5, 0)]);

      const result = await service.getAvailableSeatsBatch(mock, {
        tenantId: TENANT_A,
        pairs: [
          { academicYearId: ACADEMIC_YEAR_1, yearGroupId: YEAR_GROUP_1 },
          { academicYearId: ACADEMIC_YEAR_1, yearGroupId: YEAR_GROUP_1 },
          { academicYearId: ACADEMIC_YEAR_1, yearGroupId: YEAR_GROUP_1 },
        ],
      });

      expect(result.size).toBe(1);
      expect(result.get(`${ACADEMIC_YEAR_1}:${YEAR_GROUP_1}`)?.available_seats).toBe(25);

      // The query only received one copy of the pair in each array.
      const sqlArg = queryRaw.mock.calls[0][0] as Prisma.Sql;
      const ayParam = sqlArg.values.find((v) => Array.isArray(v) && v.includes(ACADEMIC_YEAR_1)) as
        | string[]
        | undefined;
      expect(ayParam).toBeDefined();
      expect(ayParam).toHaveLength(1);
    });
  });

  // ── getStudentYearGroupCapacity ──────────────────────────────────────────

  describe('getStudentYearGroupCapacity', () => {
    it('returns null when the student has no year group', async () => {
      const { mock, studentFindFirst, queryRaw } = buildMockPrisma();
      studentFindFirst.mockResolvedValue({ year_group_id: null });

      const result = await service.getStudentYearGroupCapacity(mock, {
        tenantId: TENANT_A,
        studentId: STUDENT_ID,
      });

      expect(result).toBeNull();
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('returns null when the student has no active class enrolment', async () => {
      const { mock, studentFindFirst, classEnrolmentFindFirst, queryRaw } = buildMockPrisma();
      studentFindFirst.mockResolvedValue({ year_group_id: YEAR_GROUP_1 });
      classEnrolmentFindFirst.mockResolvedValue(null);

      const result = await service.getStudentYearGroupCapacity(mock, {
        tenantId: TENANT_A,
        studentId: STUDENT_ID,
      });

      expect(result).toBeNull();
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('delegates to getAvailableSeats using the derived (year, year_group) pair', async () => {
      const { mock, studentFindFirst, classEnrolmentFindFirst, queryRaw } = buildMockPrisma();
      studentFindFirst.mockResolvedValue({ year_group_id: YEAR_GROUP_1 });
      classEnrolmentFindFirst.mockResolvedValue({
        class_entity: { academic_year_id: ACADEMIC_YEAR_1 },
      });
      queryRaw.mockResolvedValue([row(ACADEMIC_YEAR_1, YEAR_GROUP_1, 25, 20, 0)]);

      const result = await service.getStudentYearGroupCapacity(mock, {
        tenantId: TENANT_A,
        studentId: STUDENT_ID,
      });

      expect(result).toEqual({
        total_capacity: 25,
        enrolled_student_count: 20,
        conditional_approval_count: 0,
        available_seats: 5,
        configured: true,
      });
      expect(classEnrolmentFindFirst).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_A, student_id: STUDENT_ID, status: 'active' },
        select: { class_entity: { select: { academic_year_id: true } } },
        orderBy: { start_date: 'desc' },
      });
    });
  });
});
