import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RegulatoryOctoberReturnsService } from './regulatory-october-returns.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const ACADEMIC_YEAR_ID = '33333333-3333-3333-3333-333333333333';
const HOUSEHOLD_ID = '44444444-4444-4444-4444-444444444444';

const ACADEMIC_YEAR_RECORD = {
  id: ACADEMIC_YEAR_ID,
  tenant_id: TENANT_ID,
  name: '2025-2026',
  start_date: new Date('2025-09-01'),
  end_date: new Date('2026-06-30'),
  status: 'active',
};

function buildCompleteStudent(overrides: Record<string, unknown> = {}) {
  return {
    id: STUDENT_ID,
    first_name: 'John',
    last_name: 'Doe',
    student_number: 'STU-001',
    national_id: '1234567A',
    date_of_birth: new Date('2010-05-15'),
    gender: 'male',
    nationality: 'Irish',
    entry_date: new Date('2025-09-01'),
    household_id: HOUSEHOLD_ID,
    household: { address_line_1: '123 Main Street' },
    class_enrolments: [
      {
        class_entity: {
          academic_year_id: ACADEMIC_YEAR_ID,
          year_group_id: 'yg-111',
          year_group: { name: '1st Year' },
        },
      },
    ],
    ...overrides,
  };
}

describe('RegulatoryOctoberReturnsService', () => {
  let service: RegulatoryOctoberReturnsService;
  let mockPrisma: {
    academicYear: { findFirst: jest.Mock };
    student: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      academicYear: {
        findFirst: jest.fn().mockResolvedValue(ACADEMIC_YEAR_RECORD),
      },
      student: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryOctoberReturnsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RegulatoryOctoberReturnsService>(RegulatoryOctoberReturnsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── checkReadiness ──────────────────────────────────────────────────────

  describe('RegulatoryOctoberReturnsService — checkReadiness', () => {
    it('should return ready: true when all required data is present', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent(),
        buildCompleteStudent({
          id: 'student-2',
          gender: 'female',
          nationality: 'British',
          national_id: '7654321AB',
        }),
      ]);

      const result = await service.checkReadiness(TENANT_ID, '2025-2026');

      expect(result.ready).toBe(true);
      expect(result.student_count).toBe(2);
      expect(result.academic_year).toBe('2025-2026');

      const requiredCategories = result.categories.filter((c) => c.required);
      for (const cat of requiredCategories) {
        expect(['pass', 'warning']).toContain(cat.status);
      }
    });

    it('should return ready: false when academic year is not found', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      const result = await service.checkReadiness(TENANT_ID, '2099-2100');

      expect(result.ready).toBe(false);
      expect(result.student_count).toBe(0);
      expect(result.categories.every((c) => c.status === 'fail')).toBe(true);
    });

    it('should return ready: false when there are no active students', async () => {
      mockPrisma.student.findMany.mockResolvedValue([]);

      const result = await service.checkReadiness(TENANT_ID, '2025-2026');

      expect(result.ready).toBe(false);
      expect(result.student_count).toBe(0);

      const studentCountCat = result.categories.find((c) => c.field === 'student_count');
      expect(studentCountCat?.status).toBe('fail');
    });

    it('should return ready: false when required fields are missing', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({ gender: null }),
      ]);

      const result = await service.checkReadiness(TENANT_ID, '2025-2026');

      expect(result.ready).toBe(false);

      const genderCat = result.categories.find((c) => c.field === 'gender_breakdown');
      expect(genderCat?.status).toBe('fail');
    });

    it('should not block readiness for optional fields', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent(),
      ]);

      const result = await service.checkReadiness(TENANT_ID, '2025-2026');

      const optionalFields = result.categories.filter((c) => !c.required);
      for (const cat of optionalFields) {
        expect(['pass', 'not_applicable']).toContain(cat.status);
      }
      expect(result.ready).toBe(true);
    });

    it('should return warning status when nationality coverage is between 80-100%', async () => {
      const students = [];
      for (let i = 0; i < 10; i++) {
        students.push(
          buildCompleteStudent({
            id: `student-${i}`,
            nationality: i < 9 ? 'Irish' : null,
          }),
        );
      }
      mockPrisma.student.findMany.mockResolvedValue(students);

      const result = await service.checkReadiness(TENANT_ID, '2025-2026');

      const natCat = result.categories.find((c) => c.field === 'nationality_breakdown');
      expect(natCat?.status).toBe('warning');
      // Nationality warning should not block readiness
      expect(result.ready).toBe(true);
    });

    it('should fail nationality when coverage is below 80%', async () => {
      const students = [];
      for (let i = 0; i < 10; i++) {
        students.push(
          buildCompleteStudent({
            id: `student-${i}`,
            nationality: i < 7 ? 'Irish' : null,
          }),
        );
      }
      mockPrisma.student.findMany.mockResolvedValue(students);

      const result = await service.checkReadiness(TENANT_ID, '2025-2026');

      const natCat = result.categories.find((c) => c.field === 'nationality_breakdown');
      expect(natCat?.status).toBe('fail');
    });

    it('should fail year_group_enrolment when students lack class enrolments with year groups', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({
          class_enrolments: [
            {
              class_entity: {
                academic_year_id: ACADEMIC_YEAR_ID,
                year_group_id: null,
              },
            },
          ],
        }),
      ]);

      const result = await service.checkReadiness(TENANT_ID, '2025-2026');

      const ygCat = result.categories.find((c) => c.field === 'year_group_enrolment');
      expect(ygCat?.status).toBe('fail');
    });

    it('should pass new_entrants when students have entry_date within the academic year', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({ entry_date: new Date('2025-10-01') }),
      ]);

      const result = await service.checkReadiness(TENANT_ID, '2025-2026');

      const newEntCat = result.categories.find((c) => c.field === 'new_entrants');
      expect(newEntCat?.status).toBe('pass');
      expect(newEntCat?.count).toBe(1);
    });
  });

  // ─── preview ─────────────────────────────────────────────────────────────

  describe('RegulatoryOctoberReturnsService — preview', () => {
    it('should return correct aggregates for student data', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({ gender: 'male', nationality: 'Irish' }),
        buildCompleteStudent({
          id: 'student-2',
          gender: 'female',
          nationality: 'Irish',
          entry_date: new Date('2024-09-01'),
          class_enrolments: [
            {
              class_entity: {
                academic_year_id: ACADEMIC_YEAR_ID,
                year_group: { name: '2nd Year' },
              },
            },
          ],
        }),
        buildCompleteStudent({
          id: 'student-3',
          gender: 'other',
          nationality: 'British',
        }),
      ]);

      const result = await service.preview(TENANT_ID, '2025-2026');

      expect(result.academic_year).toBe('2025-2026');
      expect(result.summary.total_students).toBe(3);
      expect(result.summary.gender).toEqual({ male: 1, female: 1, other: 1 });

      // Nationalities sorted by count descending
      expect(result.summary.nationalities).toEqual([
        { nationality: 'Irish', count: 2 },
        { nationality: 'British', count: 1 },
      ]);

      // Year groups
      expect(result.summary.year_groups).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ year_group: '1st Year' }),
          expect.objectContaining({ year_group: '2nd Year' }),
        ]),
      );

      // New entrants: 2 have entry_date 2025-09-01 (within AY range), 1 has 2024-09-01 (outside)
      expect(result.summary.new_entrants).toBe(2);

      expect(result.generated_at).toBeDefined();
    });

    it('should throw NotFoundException when academic year is not found', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(service.preview(TENANT_ID, '2099-2100')).rejects.toThrow(NotFoundException);
    });

    it('should label students without year group as Unassigned', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({
          class_enrolments: [
            {
              class_entity: {
                academic_year_id: 'other-year',
                year_group: { name: 'Some Year' },
              },
            },
          ],
        }),
      ]);

      const result = await service.preview(TENANT_ID, '2025-2026');

      expect(result.summary.year_groups).toEqual([{ year_group: 'Unassigned', count: 1 }]);
    });
  });

  // ─── getStudentIssues ────────────────────────────────────────────────────

  describe('RegulatoryOctoberReturnsService — getStudentIssues', () => {
    it('should return no issues for a student with complete data', async () => {
      mockPrisma.student.findMany.mockResolvedValue([buildCompleteStudent()]);

      const result = await service.getStudentIssues(TENANT_ID, '2025-2026');

      expect(result.total_students).toBe(1);
      expect(result.students_with_issues).toBe(0);
      expect(result.issues).toHaveLength(0);
    });

    it('should report error when PPSN is missing', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({ national_id: null }),
      ]);

      const result = await service.getStudentIssues(TENANT_ID, '2025-2026');

      expect(result.students_with_issues).toBe(1);
      const issue = result.issues[0]!;
      const ppsnProblem = issue.problems.find((p) => p.field === 'national_id');
      expect(ppsnProblem).toBeDefined();
      expect(ppsnProblem?.severity).toBe('error');
      expect(ppsnProblem?.message).toContain('missing');
    });

    it('should report error when PPSN has invalid format', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({ national_id: 'INVALID' }),
      ]);

      const result = await service.getStudentIssues(TENANT_ID, '2025-2026');

      expect(result.students_with_issues).toBe(1);
      const ppsnProblem = result.issues[0]!.problems.find((p) => p.field === 'national_id');
      expect(ppsnProblem?.severity).toBe('error');
      expect(ppsnProblem?.message).toContain('invalid');
    });

    it('should report error when date_of_birth is missing', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({ date_of_birth: null }),
      ]);

      const result = await service.getStudentIssues(TENANT_ID, '2025-2026');

      const dobProblem = result.issues[0]!.problems.find((p) => p.field === 'date_of_birth');
      expect(dobProblem?.severity).toBe('error');
    });

    it('should report error when gender is missing', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({ gender: null }),
      ]);

      const result = await service.getStudentIssues(TENANT_ID, '2025-2026');

      const genderProblem = result.issues[0]!.problems.find((p) => p.field === 'gender');
      expect(genderProblem?.severity).toBe('error');
    });

    it('should report warning when nationality is missing', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({ nationality: null }),
      ]);

      const result = await service.getStudentIssues(TENANT_ID, '2025-2026');

      expect(result.students_with_issues).toBe(1);
      const natProblem = result.issues[0]!.problems.find((p) => p.field === 'nationality');
      expect(natProblem?.severity).toBe('warning');
    });

    it('should report warning when entry_date is missing', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({ entry_date: null }),
      ]);

      const result = await service.getStudentIssues(TENANT_ID, '2025-2026');

      const entryProblem = result.issues[0]!.problems.find((p) => p.field === 'entry_date');
      expect(entryProblem?.severity).toBe('warning');
    });

    it('should report error when student has no active class enrolment', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({ class_enrolments: [] }),
      ]);

      const result = await service.getStudentIssues(TENANT_ID, '2025-2026');

      const enrolProblem = result.issues[0]!.problems.find((p) => p.field === 'class_enrolment');
      expect(enrolProblem?.severity).toBe('error');
    });

    it('should report warning when student has no year group assigned', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({
          class_enrolments: [
            {
              class_entity: {
                academic_year_id: ACADEMIC_YEAR_ID,
                year_group_id: null,
              },
            },
          ],
        }),
      ]);

      const result = await service.getStudentIssues(TENANT_ID, '2025-2026');

      const ygProblem = result.issues[0]!.problems.find((p) => p.field === 'year_group');
      expect(ygProblem?.severity).toBe('warning');
    });

    it('should report warning when household address is missing', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({ household: { address_line_1: null } }),
      ]);

      const result = await service.getStudentIssues(TENANT_ID, '2025-2026');

      const addrProblem = result.issues[0]!.problems.find((p) => p.field === 'address');
      expect(addrProblem?.severity).toBe('warning');
    });

    it('should report warning when household is null', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({ household: null }),
      ]);

      const result = await service.getStudentIssues(TENANT_ID, '2025-2026');

      const addrProblem = result.issues[0]!.problems.find((p) => p.field === 'address');
      expect(addrProblem?.severity).toBe('warning');
    });

    it('should throw NotFoundException when academic year is not found', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(service.getStudentIssues(TENANT_ID, '2099-2100')).rejects.toThrow(NotFoundException);
    });

    it('should aggregate multiple issues per student', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({
          national_id: null,
          gender: null,
          nationality: null,
          class_enrolments: [],
        }),
      ]);

      const result = await service.getStudentIssues(TENANT_ID, '2025-2026');

      expect(result.students_with_issues).toBe(1);
      // national_id (error), gender (error), nationality (warning), class_enrolment (error)
      expect(result.issues[0]!.problems.length).toBeGreaterThanOrEqual(3);
    });

    it('should include student_name and student_number in issue output', async () => {
      mockPrisma.student.findMany.mockResolvedValue([
        buildCompleteStudent({ national_id: null, student_number: 'STU-042' }),
      ]);

      const result = await service.getStudentIssues(TENANT_ID, '2025-2026');

      expect(result.issues[0]!.student_name).toBe('John Doe');
      expect(result.issues[0]!.student_number).toBe('STU-042');
    });
  });

  // ─── validateStudent ─────────────────────────────────────────────────────

  describe('RegulatoryOctoberReturnsService — validateStudent', () => {
    it('should return valid: true for a complete student', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(buildCompleteStudent());

      const result = await service.validateStudent(TENANT_ID, STUDENT_ID);

      expect(result.valid).toBe(true);
      expect(result.problems).toHaveLength(0);
      expect(result.student_id).toBe(STUDENT_ID);
      expect(result.student_name).toBe('John Doe');
    });

    it('should return valid: false when student has issues', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(
        buildCompleteStudent({ national_id: null, gender: null }),
      );

      const result = await service.validateStudent(TENANT_ID, STUDENT_ID);

      expect(result.valid).toBe(false);
      expect(result.problems.length).toBeGreaterThanOrEqual(2);
    });

    it('should throw NotFoundException when student is not found', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(null);

      await expect(service.validateStudent(TENANT_ID, STUDENT_ID)).rejects.toThrow(NotFoundException);
    });

    it('should validate PPSN format correctly', async () => {
      // Valid PPSN formats
      mockPrisma.student.findFirst.mockResolvedValue(
        buildCompleteStudent({ national_id: '1234567AB' }),
      );

      const result1 = await service.validateStudent(TENANT_ID, STUDENT_ID);
      const ppsnProblem1 = result1.problems.find((p) => p.field === 'national_id');
      expect(ppsnProblem1).toBeUndefined();

      // Invalid: too short
      mockPrisma.student.findFirst.mockResolvedValue(
        buildCompleteStudent({ national_id: '12345A' }),
      );

      const result2 = await service.validateStudent(TENANT_ID, STUDENT_ID);
      const ppsnProblem2 = result2.problems.find((p) => p.field === 'national_id');
      expect(ppsnProblem2?.severity).toBe('error');

      // Invalid: no letter suffix
      mockPrisma.student.findFirst.mockResolvedValue(
        buildCompleteStudent({ national_id: '12345678' }),
      );

      const result3 = await service.validateStudent(TENANT_ID, STUDENT_ID);
      const ppsnProblem3 = result3.problems.find((p) => p.field === 'national_id');
      expect(ppsnProblem3?.severity).toBe('error');
    });

    it('should check year group assignment without academic year filter', async () => {
      // validateStudent does not have an academic year context — it checks all enrolments
      mockPrisma.student.findFirst.mockResolvedValue(
        buildCompleteStudent({
          class_enrolments: [
            {
              class_entity: {
                academic_year_id: 'any-year',
                year_group_id: 'yg-111',
              },
            },
          ],
        }),
      );

      const result = await service.validateStudent(TENANT_ID, STUDENT_ID);

      const ygProblem = result.problems.find((p) => p.field === 'year_group');
      expect(ygProblem).toBeUndefined();
    });
  });
});
