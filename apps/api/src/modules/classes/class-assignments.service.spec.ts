import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ClassAssignmentService } from './class-assignments.service';
import type { BulkClassAssignmentDto } from './dto/bulk-class-assignment.dto';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const YEAR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ENROLMENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  student: { findMany: jest.fn(), update: jest.fn() },
  class: { findMany: jest.fn() },
  classEnrolment: {
    create: jest.fn(),
    findFirst: jest.fn(),
    updateMany: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
    ),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    academicYear: { findFirst: jest.fn() },
    student: { findMany: jest.fn() },
    class: { findMany: jest.fn() },
    yearGroup: { findMany: jest.fn() },
    tenantBranding: { findUnique: jest.fn() },
    tenant: { findUnique: jest.fn() },
  };
}

const activeAcademicYear = { id: YEAR_ID };

const baseStudent = {
  id: STUDENT_ID,
  first_name: 'Alice',
  last_name: 'Smith',
  student_number: 'STU-001',
  year_group_id: YEAR_ID,
  class_homeroom_id: null,
  homeroom_class: null,
  status: 'active',
};

const baseClass = {
  id: CLASS_ID,
  name: '10A',
  year_group_id: YEAR_ID,
  max_capacity: 30,
  subject_id: null,
  status: 'active',
  _count: { class_enrolments: 5 },
};

const baseYearGroup = {
  id: YEAR_ID,
  name: 'Year 10',
  display_order: 1,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ClassAssignmentService — getAssignments', () => {
  let service: ClassAssignmentService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassAssignmentService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClassAssignmentService>(ClassAssignmentService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException if no active academic year', async () => {
    mockPrisma.academicYear.findFirst.mockResolvedValue(null);

    await expect(service.getAssignments(TENANT_ID)).rejects.toThrow(NotFoundException);
  });

  it('should return year groups with students and classes', async () => {
    mockPrisma.academicYear.findFirst.mockResolvedValue(activeAcademicYear);
    mockPrisma.student.findMany.mockResolvedValue([
      { ...baseStudent, class_homeroom_id: CLASS_ID, homeroom_class: { id: CLASS_ID, name: '10A' } },
    ]);
    mockPrisma.class.findMany.mockResolvedValue([baseClass]);
    mockPrisma.yearGroup.findMany.mockResolvedValue([baseYearGroup]);

    const result = await service.getAssignments(TENANT_ID);

    expect(result.year_groups).toHaveLength(1);
    expect(result.year_groups[0]?.id).toBe(YEAR_ID);
    expect(result.year_groups[0]?.students).toHaveLength(1);
    expect(result.year_groups[0]?.homeroom_classes).toHaveLength(1);
  });

  it('should count unassigned students correctly', async () => {
    mockPrisma.academicYear.findFirst.mockResolvedValue(activeAcademicYear);
    // Two students: one assigned, one unassigned
    mockPrisma.student.findMany.mockResolvedValue([
      { ...baseStudent, id: STUDENT_ID, class_homeroom_id: CLASS_ID, homeroom_class: { id: CLASS_ID, name: '10A' } },
      { ...baseStudent, id: 'student-2', class_homeroom_id: null, homeroom_class: null },
    ]);
    mockPrisma.class.findMany.mockResolvedValue([baseClass]);
    mockPrisma.yearGroup.findMany.mockResolvedValue([baseYearGroup]);

    const result = await service.getAssignments(TENANT_ID);

    expect(result.unassigned_count).toBe(1);
  });

  it('should return empty year_groups when no students or classes for a year group', async () => {
    mockPrisma.academicYear.findFirst.mockResolvedValue(activeAcademicYear);
    mockPrisma.student.findMany.mockResolvedValue([]);
    mockPrisma.class.findMany.mockResolvedValue([]);
    mockPrisma.yearGroup.findMany.mockResolvedValue([baseYearGroup]);

    const result = await service.getAssignments(TENANT_ID);

    // Year groups with neither students nor classes are filtered out
    expect(result.year_groups).toHaveLength(0);
    expect(result.unassigned_count).toBe(0);
  });

  it('should map enrolled_count from _count on homeroom classes', async () => {
    mockPrisma.academicYear.findFirst.mockResolvedValue(activeAcademicYear);
    mockPrisma.student.findMany.mockResolvedValue([
      { ...baseStudent, class_homeroom_id: CLASS_ID, homeroom_class: { id: CLASS_ID, name: '10A' } },
    ]);
    mockPrisma.class.findMany.mockResolvedValue([{ ...baseClass, _count: { class_enrolments: 12 } }]);
    mockPrisma.yearGroup.findMany.mockResolvedValue([baseYearGroup]);

    const result = await service.getAssignments(TENANT_ID);

    expect(result.year_groups[0]?.homeroom_classes[0]?.enrolled_count).toBe(12);
  });
});

describe('ClassAssignmentService — bulkAssign', () => {
  let service: ClassAssignmentService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    // Reset RLS tx mocks
    mockRlsTx.student.findMany.mockReset();
    mockRlsTx.class.findMany.mockReset();
    mockRlsTx.classEnrolment.create.mockReset();
    mockRlsTx.classEnrolment.findFirst.mockReset().mockResolvedValue(null);
    mockRlsTx.classEnrolment.updateMany.mockReset().mockResolvedValue({ count: 0 });
    mockRlsTx.student.update.mockReset().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassAssignmentService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClassAssignmentService>(ClassAssignmentService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should assign student to a class successfully', async () => {
    mockRlsTx.student.findMany.mockResolvedValue([
      { id: STUDENT_ID, status: 'active', year_group_id: YEAR_ID, class_homeroom_id: null },
    ]);
    mockRlsTx.class.findMany.mockResolvedValue([
      { id: CLASS_ID, status: 'active', subject_id: null, year_group_id: YEAR_ID },
    ]);
    mockRlsTx.classEnrolment.create.mockResolvedValue({ id: ENROLMENT_ID });

    const dto: BulkClassAssignmentDto = {
      start_date: '2025-09-01',
      assignments: [{ student_id: STUDENT_ID, class_id: CLASS_ID }],
    };

    const result = await service.bulkAssign(TENANT_ID, dto);

    expect(result.assigned).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockRlsTx.classEnrolment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          class_id: CLASS_ID,
          student_id: STUDENT_ID,
          status: 'active',
        }),
      }),
    );
  });

  it('should skip already-enrolled students', async () => {
    mockRlsTx.student.findMany.mockResolvedValue([
      { id: STUDENT_ID, status: 'active', year_group_id: YEAR_ID, class_homeroom_id: CLASS_ID },
    ]);
    mockRlsTx.class.findMany.mockResolvedValue([
      { id: CLASS_ID, status: 'active', subject_id: null, year_group_id: YEAR_ID },
    ]);

    const dto: BulkClassAssignmentDto = {
      start_date: '2025-09-01',
      assignments: [{ student_id: STUDENT_ID, class_id: CLASS_ID }],
    };

    const result = await service.bulkAssign(TENANT_ID, dto);

    expect(result.skipped).toBe(1);
    expect(result.assigned).toBe(0);
    expect(mockRlsTx.classEnrolment.create).not.toHaveBeenCalled();
  });

  it('should report error for inactive student', async () => {
    mockRlsTx.student.findMany.mockResolvedValue([
      { id: STUDENT_ID, status: 'withdrawn', year_group_id: YEAR_ID, class_homeroom_id: null },
    ]);
    mockRlsTx.class.findMany.mockResolvedValue([
      { id: CLASS_ID, status: 'active', subject_id: null, year_group_id: YEAR_ID },
    ]);

    const dto: BulkClassAssignmentDto = {
      start_date: '2025-09-01',
      assignments: [{ student_id: STUDENT_ID, class_id: CLASS_ID }],
    };

    const result = await service.bulkAssign(TENANT_ID, dto);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.student_id).toBe(STUDENT_ID);
    expect(result.errors[0]?.reason).toMatch(/not active/i);
  });

  it('should report error for year group mismatch', async () => {
    mockRlsTx.student.findMany.mockResolvedValue([
      { id: STUDENT_ID, status: 'active', year_group_id: YEAR_ID, class_homeroom_id: null },
    ]);
    mockRlsTx.class.findMany.mockResolvedValue([
      { id: CLASS_ID, status: 'active', subject_id: null, year_group_id: 'different-year-group' },
    ]);

    const dto: BulkClassAssignmentDto = {
      start_date: '2025-09-01',
      assignments: [{ student_id: STUDENT_ID, class_id: CLASS_ID }],
    };

    const result = await service.bulkAssign(TENANT_ID, dto);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toMatch(/year group/i);
  });

  it('should report error when student not found', async () => {
    mockRlsTx.student.findMany.mockResolvedValue([]);
    mockRlsTx.class.findMany.mockResolvedValue([
      { id: CLASS_ID, status: 'active', subject_id: null, year_group_id: YEAR_ID },
    ]);

    const dto: BulkClassAssignmentDto = {
      start_date: '2025-09-01',
      assignments: [{ student_id: STUDENT_ID, class_id: CLASS_ID }],
    };

    const result = await service.bulkAssign(TENANT_ID, dto);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.reason).toMatch(/not found/i);
  });
});

describe('ClassAssignmentService — getExportData', () => {
  let service: ClassAssignmentService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassAssignmentService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClassAssignmentService>(ClassAssignmentService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException if no active academic year', async () => {
    mockPrisma.academicYear.findFirst.mockResolvedValue(null);

    await expect(service.getExportData(TENANT_ID)).rejects.toThrow(NotFoundException);
  });

  it('should return class lists with students grouped by class', async () => {
    mockPrisma.academicYear.findFirst.mockResolvedValue({ id: YEAR_ID, name: '2025/2026' });
    mockPrisma.student.findMany.mockResolvedValue([
      {
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
        middle_name: null,
        student_number: 'STU-001',
        national_id: null,
        nationality: null,
        city_of_birth: null,
        gender: 'female',
        date_of_birth: new Date('2010-01-01'),
        medical_notes: null,
        has_allergy: false,
        allergy_details: null,
        class_homeroom_id: CLASS_ID,
        year_group_id: YEAR_ID,
        student_parents: [],
      },
    ]);
    mockPrisma.class.findMany.mockResolvedValue([
      {
        id: CLASS_ID,
        name: '10A',
        year_group_id: YEAR_ID,
        year_group: { name: 'Year 10', display_order: 1 },
      },
    ]);
    mockPrisma.tenantBranding.findUnique.mockResolvedValue({
      school_name_display: 'Test School',
      school_name_ar: null,
      logo_url: 'https://example.com/logo.png',
    });
    mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'Test School' });

    const result = await service.getExportData(TENANT_ID);

    expect(result.academic_year).toBe('2025/2026');
    expect(result.class_lists).toHaveLength(1);
    expect(result.class_lists[0]?.students).toHaveLength(1);
    expect(result.class_lists[0]?.students[0]?.first_name).toBe('Alice');
  });
});
