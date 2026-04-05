import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ClassesReadFacade } from './classes-read.facade';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLASS_ID_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbcc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID_2 = 'dddddddd-dddd-dddd-dddd-ddddddddddee';
const STAFF_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const YEAR_GROUP_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const ACADEMIC_YEAR_ID = '11111111-1111-1111-1111-111111111111';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const classSummary = {
  id: CLASS_ID,
  name: '10A',
  year_group_id: YEAR_GROUP_ID,
  subject_id: null,
  academic_year_id: ACADEMIC_YEAR_ID,
  status: 'active',
  tenant_id: TENANT_ID,
  year_group: { id: YEAR_GROUP_ID, name: 'Year 10' },
  subject: null,
};

const classStaffRow = {
  class_id: CLASS_ID,
  staff_profile_id: STAFF_ID,
  assignment_role: 'teacher',
  tenant_id: TENANT_ID,
};

// ─── Mock factory ─────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    class: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    classEnrolment: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    classStaff: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

// ─── Tests: findById ─────────────────────────────────────────────────────────

describe('ClassesReadFacade — findById', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return class summary when found', async () => {
    mockPrisma.class.findFirst.mockResolvedValue(classSummary);

    const result = await facade.findById(TENANT_ID, CLASS_ID);

    expect(result).toEqual(classSummary);
  });

  it('should return null when class not found', async () => {
    mockPrisma.class.findFirst.mockResolvedValue(null);

    const result = await facade.findById(TENANT_ID, 'nonexistent');

    expect(result).toBeNull();
  });
});

// ─── Tests: existsOrThrow ───────────────────────────────────────────────────

describe('ClassesReadFacade — existsOrThrow', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should not throw when class exists', async () => {
    mockPrisma.class.findFirst.mockResolvedValue({ id: CLASS_ID });

    await expect(facade.existsOrThrow(TENANT_ID, CLASS_ID)).resolves.toBeUndefined();
  });

  it('should throw NotFoundException when class does not exist', async () => {
    mockPrisma.class.findFirst.mockResolvedValue(null);

    await expect(facade.existsOrThrow(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
  });
});

// ─── Tests: findByYearGroup ─────────────────────────────────────────────────

describe('ClassesReadFacade — findByYearGroup', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return classes for the year group', async () => {
    mockPrisma.class.findMany.mockResolvedValue([classSummary]);

    const result = await facade.findByYearGroup(TENANT_ID, YEAR_GROUP_ID);

    expect(result).toEqual([classSummary]);
    expect(mockPrisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT_ID, year_group_id: YEAR_GROUP_ID },
      }),
    );
  });

  it('should return empty array when no classes in year group', async () => {
    mockPrisma.class.findMany.mockResolvedValue([]);

    const result = await facade.findByYearGroup(TENANT_ID, YEAR_GROUP_ID);

    expect(result).toEqual([]);
  });
});

// ─── Tests: findEnrolledStudentIds ──────────────────────────────────────────

describe('ClassesReadFacade — findEnrolledStudentIds', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return student IDs of active enrolments', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([
      { student_id: STUDENT_ID },
      { student_id: STUDENT_ID_2 },
    ]);

    const result = await facade.findEnrolledStudentIds(TENANT_ID, CLASS_ID);

    expect(result).toEqual([STUDENT_ID, STUDENT_ID_2]);
  });

  it('should return empty array when no enrolments', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

    const result = await facade.findEnrolledStudentIds(TENANT_ID, CLASS_ID);

    expect(result).toEqual([]);
  });
});

// ─── Tests: countEnrolledStudents ───────────────────────────────────────────

describe('ClassesReadFacade — countEnrolledStudents', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return count of active enrolments', async () => {
    mockPrisma.classEnrolment.count.mockResolvedValue(15);

    const result = await facade.countEnrolledStudents(TENANT_ID, CLASS_ID);

    expect(result).toBe(15);
  });
});

// ─── Tests: findEnrolledStudentsWithDetails ─────────────────────────────────

describe('ClassesReadFacade — findEnrolledStudentsWithDetails', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return enrolments with student details', async () => {
    const enrolmentWithStudent = {
      id: 'enrol-1',
      class_id: CLASS_ID,
      student_id: STUDENT_ID,
      student: {
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
        student_number: 'STU-001',
        year_group: { id: YEAR_GROUP_ID, name: 'Year 10' },
        homeroom_class: null,
      },
    };
    mockPrisma.classEnrolment.findMany.mockResolvedValue([enrolmentWithStudent]);

    const result = await facade.findEnrolledStudentsWithDetails(TENANT_ID, CLASS_ID);

    expect(result).toEqual([enrolmentWithStudent]);
  });
});

// ─── Tests: findEnrolmentCountsByClasses ────────────────────────────────────

describe('ClassesReadFacade — findEnrolmentCountsByClasses', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return a map with counts per class ID', async () => {
    mockPrisma.classEnrolment.groupBy.mockResolvedValue([
      { class_id: CLASS_ID, _count: { student_id: 10 } },
    ]);

    const result = await facade.findEnrolmentCountsByClasses(TENANT_ID, [CLASS_ID, CLASS_ID_2]);

    expect(result.get(CLASS_ID)).toBe(10);
    expect(result.get(CLASS_ID_2)).toBe(0);
  });

  it('edge: should return empty map when classIds is empty', async () => {
    const result = await facade.findEnrolmentCountsByClasses(TENANT_ID, []);

    expect(result.size).toBe(0);
    expect(mockPrisma.classEnrolment.groupBy).not.toHaveBeenCalled();
  });
});

// ─── Tests: findStaffByClass ────────────────────────────────────────────────

describe('ClassesReadFacade — findStaffByClass', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return staff assignments for a class', async () => {
    mockPrisma.classStaff.findMany.mockResolvedValue([classStaffRow]);

    const result = await facade.findStaffByClass(TENANT_ID, CLASS_ID);

    expect(result).toEqual([classStaffRow]);
  });
});

// ─── Tests: findStaffByClasses ──────────────────────────────────────────────

describe('ClassesReadFacade — findStaffByClasses', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return staff for multiple classes', async () => {
    mockPrisma.classStaff.findMany.mockResolvedValue([classStaffRow]);

    const result = await facade.findStaffByClasses(TENANT_ID, [CLASS_ID]);

    expect(result).toEqual([classStaffRow]);
  });

  it('edge: should return empty array when classIds is empty', async () => {
    const result = await facade.findStaffByClasses(TENANT_ID, []);

    expect(result).toEqual([]);
    expect(mockPrisma.classStaff.findMany).not.toHaveBeenCalled();
  });
});

// ─── Tests: findClassesByStaff ──────────────────────────────────────────────

describe('ClassesReadFacade — findClassesByStaff', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return class assignments for staff', async () => {
    mockPrisma.classStaff.findMany.mockResolvedValue([classStaffRow]);

    const result = await facade.findClassesByStaff(TENANT_ID, STAFF_ID);

    expect(result).toEqual([classStaffRow]);
    expect(mockPrisma.classStaff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT_ID, staff_profile_id: STAFF_ID },
      }),
    );
  });
});

// ─── Tests: findClassIdsByStaff ─────────────────────────────────────────────

describe('ClassesReadFacade — findClassIdsByStaff', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return class IDs for a staff member', async () => {
    mockPrisma.classStaff.findMany.mockResolvedValue([
      { class_id: CLASS_ID },
      { class_id: CLASS_ID_2 },
    ]);

    const result = await facade.findClassIdsByStaff(TENANT_ID, STAFF_ID);

    expect(result).toEqual([CLASS_ID, CLASS_ID_2]);
  });
});

// ─── Tests: findStaffByYearGroup ────────────────────────────────────────────

describe('ClassesReadFacade — findStaffByYearGroup', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return staff assignments for classes in the year group', async () => {
    mockPrisma.classStaff.findMany.mockResolvedValue([classStaffRow]);

    const result = await facade.findStaffByYearGroup(TENANT_ID, YEAR_GROUP_ID);

    expect(result).toEqual([classStaffRow]);
    expect(mockPrisma.classStaff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          class_entity: { year_group_id: YEAR_GROUP_ID },
        }),
      }),
    );
  });
});

// ─── Tests: isStaffAssignedToClass ──────────────────────────────────────────

describe('ClassesReadFacade — isStaffAssignedToClass', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return true when staff is assigned', async () => {
    mockPrisma.classStaff.findFirst.mockResolvedValue({ class_id: CLASS_ID });

    const result = await facade.isStaffAssignedToClass(TENANT_ID, STAFF_ID, CLASS_ID);

    expect(result).toBe(true);
  });

  it('should return false when staff is not assigned', async () => {
    mockPrisma.classStaff.findFirst.mockResolvedValue(null);

    const result = await facade.isStaffAssignedToClass(TENANT_ID, STAFF_ID, CLASS_ID);

    expect(result).toBe(false);
  });
});

// ─── Tests: countStaffByClass ───────────────────────────────────────────────

describe('ClassesReadFacade — countStaffByClass', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return count of staff for the class', async () => {
    mockPrisma.classStaff.count.mockResolvedValue(3);

    const result = await facade.countStaffByClass(TENANT_ID, CLASS_ID);

    expect(result).toBe(3);
  });
});

// ─── Tests: findByAcademicYear ──────────────────────────────────────────────

describe('ClassesReadFacade — findByAcademicYear', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return classes for academic year', async () => {
    mockPrisma.class.findMany.mockResolvedValue([classSummary]);

    const result = await facade.findByAcademicYear(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(result).toEqual([classSummary]);
  });
});

// ─── Tests: findIdsByAcademicYear ───────────────────────────────────────────

describe('ClassesReadFacade — findIdsByAcademicYear', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return class IDs for academic year', async () => {
    mockPrisma.class.findMany.mockResolvedValue([{ id: CLASS_ID }]);

    const result = await facade.findIdsByAcademicYear(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(result).toEqual([CLASS_ID]);
  });
});

// ─── Tests: findNamesByIds ──────────────────────────────────────────────────

describe('ClassesReadFacade — findNamesByIds', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return id+name pairs', async () => {
    mockPrisma.class.findMany.mockResolvedValue([{ id: CLASS_ID, name: '10A' }]);

    const result = await facade.findNamesByIds(TENANT_ID, [CLASS_ID]);

    expect(result).toEqual([{ id: CLASS_ID, name: '10A' }]);
  });

  it('edge: should return empty array when classIds is empty', async () => {
    const result = await facade.findNamesByIds(TENANT_ID, []);

    expect(result).toEqual([]);
    expect(mockPrisma.class.findMany).not.toHaveBeenCalled();
  });
});

// ─── Tests: findIdsByYearGroup ──────────────────────────────────────────────

describe('ClassesReadFacade — findIdsByYearGroup', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return class IDs for year group', async () => {
    mockPrisma.class.findMany.mockResolvedValue([{ id: CLASS_ID }]);

    const result = await facade.findIdsByYearGroup(TENANT_ID, YEAR_GROUP_ID);

    expect(result).toEqual([CLASS_ID]);
  });
});

// ─── Tests: findYearGroupId ─────────────────────────────────────────────────

describe('ClassesReadFacade — findYearGroupId', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return year group ID when class found', async () => {
    mockPrisma.class.findFirst.mockResolvedValue({ year_group_id: YEAR_GROUP_ID });

    const result = await facade.findYearGroupId(TENANT_ID, CLASS_ID);

    expect(result).toBe(YEAR_GROUP_ID);
  });

  it('should return null when class not found', async () => {
    mockPrisma.class.findFirst.mockResolvedValue(null);

    const result = await facade.findYearGroupId(TENANT_ID, 'nonexistent');

    expect(result).toBeNull();
  });

  it('should return null when class has no year_group_id', async () => {
    mockPrisma.class.findFirst.mockResolvedValue({ year_group_id: null });

    const result = await facade.findYearGroupId(TENANT_ID, CLASS_ID);

    expect(result).toBeNull();
  });
});

// ─── Tests: countByAcademicYear ─────────────────────────────────────────────

describe('ClassesReadFacade — countByAcademicYear', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return count without filters', async () => {
    mockPrisma.class.count.mockResolvedValue(5);

    const result = await facade.countByAcademicYear(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(result).toBe(5);
  });

  it('should apply status filter when provided', async () => {
    mockPrisma.class.count.mockResolvedValue(3);

    await facade.countByAcademicYear(TENANT_ID, ACADEMIC_YEAR_ID, { status: 'active' });

    expect(mockPrisma.class.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('should apply subjectType filter when provided', async () => {
    mockPrisma.class.count.mockResolvedValue(2);

    await facade.countByAcademicYear(TENANT_ID, ACADEMIC_YEAR_ID, { subjectType: 'academic' });

    expect(mockPrisma.class.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subject: { subject_type: 'academic' },
        }),
      }),
    );
  });
});

// ─── Tests: findClassesWithoutTeachers ──────────────────────────────────────

describe('ClassesReadFacade — findClassesWithoutTeachers', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return classes without teacher assignments', async () => {
    mockPrisma.class.findMany.mockResolvedValue([{ id: CLASS_ID, name: '10B' }]);

    const result = await facade.findClassesWithoutTeachers(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(result).toEqual([{ id: CLASS_ID, name: '10B' }]);
  });
});

// ─── Tests: findClassIdsForStudent ──────────────────────────────────────────

describe('ClassesReadFacade — findClassIdsForStudent', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return class IDs for student active enrolments', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([
      { class_id: CLASS_ID },
      { class_id: CLASS_ID_2 },
    ]);

    const result = await facade.findClassIdsForStudent(TENANT_ID, STUDENT_ID);

    expect(result).toEqual([CLASS_ID, CLASS_ID_2]);
  });
});

// ─── Tests: findOtherClassEnrolmentsForStudents ─────────────────────────────

describe('ClassesReadFacade — findOtherClassEnrolmentsForStudents', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return enrolments in other classes', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([
      { class_id: CLASS_ID_2, student_id: STUDENT_ID },
    ]);

    const result = await facade.findOtherClassEnrolmentsForStudents(
      TENANT_ID,
      [STUDENT_ID],
      CLASS_ID,
    );

    expect(result).toEqual([{ class_id: CLASS_ID_2, student_id: STUDENT_ID }]);
  });

  it('edge: should return empty array when studentIds is empty', async () => {
    const result = await facade.findOtherClassEnrolmentsForStudents(TENANT_ID, [], CLASS_ID);

    expect(result).toEqual([]);
    expect(mockPrisma.classEnrolment.findMany).not.toHaveBeenCalled();
  });
});

// ─── Tests: countEnrolments ─────────────────────────────────────────────────

describe('ClassesReadFacade — countEnrolments', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should count all active enrolments for tenant', async () => {
    mockPrisma.classEnrolment.count.mockResolvedValue(50);

    const result = await facade.countEnrolments(TENANT_ID);

    expect(result).toBe(50);
  });

  it('should filter by classId when provided', async () => {
    mockPrisma.classEnrolment.count.mockResolvedValue(10);

    await facade.countEnrolments(TENANT_ID, CLASS_ID);

    expect(mockPrisma.classEnrolment.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ class_id: CLASS_ID }),
      }),
    );
  });
});

// ─── Tests: findClassEnrolmentsWithStudents ─────────────────────────────────

describe('ClassesReadFacade — findClassEnrolmentsWithStudents', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return enrolments without date filter', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

    await facade.findClassEnrolmentsWithStudents(TENANT_ID, CLASS_ID);

    expect(mockPrisma.classEnrolment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          class_id: CLASS_ID,
          status: 'active',
        }),
      }),
    );
  });

  it('should apply date filter when provided', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

    const startDate = new Date('2025-09-01');
    const endDate = new Date('2026-06-30');

    await facade.findClassEnrolmentsWithStudents(TENANT_ID, CLASS_ID, {
      start_date: startDate,
      end_date: endDate,
    });

    expect(mockPrisma.classEnrolment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          start_date: { lte: endDate },
        }),
      }),
    );
  });
});

// ─── Tests: findEnrolmentsForStudent ────────────────────────────────────────

describe('ClassesReadFacade — findEnrolmentsForStudent', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return all enrolments for a student', async () => {
    const enrolment = {
      id: 'enrol-1',
      class_id: CLASS_ID,
      student_id: STUDENT_ID,
      status: 'active',
      class_entity: { id: CLASS_ID, name: '10A' },
    };
    mockPrisma.classEnrolment.findMany.mockResolvedValue([enrolment]);

    const result = await facade.findEnrolmentsForStudent(TENANT_ID, STUDENT_ID);

    expect(result).toEqual([enrolment]);
  });
});

// ─── Tests: findStudentEnrolmentsWithClasses ────────────────────────────────

describe('ClassesReadFacade — findStudentEnrolmentsWithClasses', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return student enrolments without date filter', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

    await facade.findStudentEnrolmentsWithClasses(TENANT_ID, STUDENT_ID);

    expect(mockPrisma.classEnrolment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          student_id: STUDENT_ID,
          status: 'active',
        }),
      }),
    );
  });

  it('should apply date filter when provided', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

    const startDate = new Date('2025-09-01');
    const endDate = new Date('2026-06-30');

    await facade.findStudentEnrolmentsWithClasses(TENANT_ID, STUDENT_ID, {
      start_date: startDate,
      end_date: endDate,
    });

    expect(mockPrisma.classEnrolment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          start_date: { lte: endDate },
        }),
      }),
    );
  });
});

// ─── Tests: findEnrolmentPairsForAcademicYear ───────────────────────────────

describe('ClassesReadFacade — findEnrolmentPairsForAcademicYear', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return class_id + student_id pairs', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([
      { class_id: CLASS_ID, student_id: STUDENT_ID },
    ]);

    const result = await facade.findEnrolmentPairsForAcademicYear(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(result).toEqual([{ class_id: CLASS_ID, student_id: STUDENT_ID }]);
  });
});

// ─── Tests: findClassIdsByStudentIds ────────────────────────────────────────

describe('ClassesReadFacade — findClassIdsByStudentIds', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return unique class IDs for students', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([
      { class_id: CLASS_ID },
      { class_id: CLASS_ID },
      { class_id: CLASS_ID_2 },
    ]);

    const result = await facade.findClassIdsByStudentIds(TENANT_ID, [STUDENT_ID]);

    expect(result).toEqual([CLASS_ID, CLASS_ID_2]);
  });

  it('edge: should return empty array when studentIds is empty', async () => {
    const result = await facade.findClassIdsByStudentIds(TENANT_ID, []);

    expect(result).toEqual([]);
    expect(mockPrisma.classEnrolment.findMany).not.toHaveBeenCalled();
  });
});

// ─── Tests: findStaffProfileIdsByClassIds ───────────────────────────────────

describe('ClassesReadFacade — findStaffProfileIdsByClassIds', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return unique staff profile IDs', async () => {
    mockPrisma.classStaff.findMany.mockResolvedValue([
      { staff_profile_id: STAFF_ID },
      { staff_profile_id: STAFF_ID },
      { staff_profile_id: 'staff-2' },
    ]);

    const result = await facade.findStaffProfileIdsByClassIds(TENANT_ID, [CLASS_ID]);

    expect(result).toEqual([STAFF_ID, 'staff-2']);
  });

  it('edge: should return empty array when classIds is empty', async () => {
    const result = await facade.findStaffProfileIdsByClassIds(TENANT_ID, []);

    expect(result).toEqual([]);
    expect(mockPrisma.classStaff.findMany).not.toHaveBeenCalled();
  });
});

// ─── Tests: countClassesGeneric ─────────────────────────────────────────────

describe('ClassesReadFacade — countClassesGeneric', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should count with arbitrary where clause', async () => {
    mockPrisma.class.count.mockResolvedValue(7);

    const result = await facade.countClassesGeneric(TENANT_ID, { status: 'active' });

    expect(result).toBe(7);
    expect(mockPrisma.class.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: TENANT_ID, status: 'active' }),
      }),
    );
  });

  it('should count without additional where clause', async () => {
    mockPrisma.class.count.mockResolvedValue(10);

    const result = await facade.countClassesGeneric(TENANT_ID);

    expect(result).toBe(10);
  });
});

// ─── Tests: findClassesGeneric ──────────────────────────────────────────────

describe('ClassesReadFacade — findClassesGeneric', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should find classes with custom where and select', async () => {
    mockPrisma.class.findMany.mockResolvedValue([{ id: CLASS_ID }]);

    const result = await facade.findClassesGeneric(
      TENANT_ID,
      { status: 'active' },
      { id: true, name: true },
    );

    expect(result).toEqual([{ id: CLASS_ID }]);
  });

  it('should find classes with only where clause (no select)', async () => {
    mockPrisma.class.findMany.mockResolvedValue([]);

    await facade.findClassesGeneric(TENANT_ID, { status: 'active' });

    expect(mockPrisma.class.findMany).toHaveBeenCalled();
  });
});

// ─── Tests: findClassStaffGeneric ───────────────────────────────────────────

describe('ClassesReadFacade — findClassStaffGeneric', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should find class staff with custom where and select', async () => {
    mockPrisma.classStaff.findMany.mockResolvedValue([classStaffRow]);

    const result = await facade.findClassStaffGeneric(
      TENANT_ID,
      { assignment_role: 'teacher' },
      { staff_profile_id: true },
    );

    expect(result).toEqual([classStaffRow]);
  });
});

// ─── Tests: countClassStaffGeneric ──────────────────────────────────────────

describe('ClassesReadFacade — countClassStaffGeneric', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should count class staff with where clause', async () => {
    mockPrisma.classStaff.count.mockResolvedValue(4);

    const result = await facade.countClassStaffGeneric(TENANT_ID, { assignment_role: 'teacher' });

    expect(result).toBe(4);
  });
});

// ─── Tests: countEnrolmentsGeneric ──────────────────────────────────────────

describe('ClassesReadFacade — countEnrolmentsGeneric', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should count enrolments with where clause', async () => {
    mockPrisma.classEnrolment.count.mockResolvedValue(20);

    const result = await facade.countEnrolmentsGeneric(TENANT_ID, { status: 'active' });

    expect(result).toBe(20);
  });
});

// ─── Tests: findEnrolmentsGeneric ───────────────────────────────────────────

describe('ClassesReadFacade — findEnrolmentsGeneric', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should find enrolments with where, select, and orderBy', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

    await facade.findEnrolmentsGeneric(
      TENANT_ID,
      { status: 'active' },
      { id: true },
      { start_date: 'asc' },
    );

    expect(mockPrisma.classEnrolment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true },
        orderBy: { start_date: 'asc' },
      }),
    );
  });

  it('should find enrolments with only where clause', async () => {
    mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

    await facade.findEnrolmentsGeneric(TENANT_ID);

    expect(mockPrisma.classEnrolment.findMany).toHaveBeenCalled();
  });
});

// ─── Tests: findActiveHomeroomClasses ───────────────────────────────────────

describe('ClassesReadFacade — findActiveHomeroomClasses', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return active homeroom classes', async () => {
    mockPrisma.class.findMany.mockResolvedValue([{ id: CLASS_ID, name: '10A' }]);

    const result = await facade.findActiveHomeroomClasses(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(result).toEqual([{ id: CLASS_ID, name: '10A' }]);
    expect(mockPrisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          subject_id: null,
          status: 'active',
        }),
      }),
    );
  });
});

// ─── Tests: findByIdWithAcademicYear ────────────────────────────────────────

describe('ClassesReadFacade — findByIdWithAcademicYear', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return class with academic year dates', async () => {
    const classWithYear = {
      id: CLASS_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      academic_year: { start_date: new Date('2025-09-01'), end_date: new Date('2026-06-30') },
    };
    mockPrisma.class.findFirst.mockResolvedValue(classWithYear);

    const result = await facade.findByIdWithAcademicYear(TENANT_ID, CLASS_ID);

    expect(result).toEqual(classWithYear);
  });

  it('should return null when class not found', async () => {
    mockPrisma.class.findFirst.mockResolvedValue(null);

    const result = await facade.findByIdWithAcademicYear(TENANT_ID, 'nonexistent');

    expect(result).toBeNull();
  });
});

// ─── Tests: findEnrolledStudentsWithNumber ──────────────────────────────────

describe('ClassesReadFacade — findEnrolledStudentsWithNumber', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return enrolled students with student_number', async () => {
    const enrolmentRow = {
      student: {
        id: STUDENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
        student_number: 'STU-001',
      },
    };
    mockPrisma.classEnrolment.findMany.mockResolvedValue([enrolmentRow]);

    const result = await facade.findEnrolledStudentsWithNumber(TENANT_ID, CLASS_ID);

    expect(result).toEqual([enrolmentRow]);
  });
});

// ─── Tests: findClassesWithYearGroupAndEnrolmentCount ───────────────────────

describe('ClassesReadFacade — findClassesWithYearGroupAndEnrolmentCount', () => {
  let facade: ClassesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ClassesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ClassesReadFacade>(ClassesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return classes with year group and enrolment count', async () => {
    const classRow = {
      id: CLASS_ID,
      name: '10A',
      year_group: { name: 'Year 10' },
      _count: { class_enrolments: 12 },
    };
    mockPrisma.class.findMany.mockResolvedValue([classRow]);

    const result = await facade.findClassesWithYearGroupAndEnrolmentCount(
      TENANT_ID,
      ACADEMIC_YEAR_ID,
    );

    expect(result).toEqual([classRow]);
  });
});
