import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { StudentReadFacade } from './student-read.facade';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID_2 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PARENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const HOUSEHOLD_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const YEAR_GROUP_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const studentDisplay = {
  id: STUDENT_ID,
  first_name: 'John',
  last_name: 'Doe',
  full_name: 'John Doe',
  first_name_ar: null,
  last_name_ar: null,
  student_number: 'STU-001',
  gender: 'male',
  date_of_birth: new Date('2010-05-15'),
  status: 'active',
  year_group_id: YEAR_GROUP_ID,
  class_homeroom_id: null,
  household_id: HOUSEHOLD_ID,
  year_group: { id: YEAR_GROUP_ID, name: 'Year 5' },
  homeroom_class: null,
};

const parentDisplay = {
  id: PARENT_ID,
  first_name: 'Jane',
  last_name: 'Doe',
  email: 'jane@example.com',
  phone: '+971501234567',
  is_primary_contact: true,
  is_billing_contact: true,
};

// ─── Mock Prisma factory ─────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    student: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    studentParent: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StudentReadFacade — findById', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return student when found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(studentDisplay);

    const result = await facade.findById(TENANT_ID, STUDENT_ID);

    expect(result).toEqual(studentDisplay);
    expect(mockPrisma.student.findFirst).toHaveBeenCalledWith({
      where: { id: STUDENT_ID, tenant_id: TENANT_ID },
      select: expect.objectContaining({ id: true, first_name: true, last_name: true }),
    });
  });

  it('should return null when student not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    const result = await facade.findById(TENANT_ID, 'nonexistent');

    expect(result).toBeNull();
  });
});

describe('StudentReadFacade — findByIds', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return empty array when studentIds is empty', async () => {
    const result = await facade.findByIds(TENANT_ID, []);

    expect(result).toEqual([]);
    expect(mockPrisma.student.findMany).not.toHaveBeenCalled();
  });

  it('should return students matching the provided IDs', async () => {
    mockPrisma.student.findMany.mockResolvedValue([studentDisplay]);

    const result = await facade.findByIds(TENANT_ID, [STUDENT_ID]);

    expect(result).toHaveLength(1);
    expect(mockPrisma.student.findMany).toHaveBeenCalledWith({
      where: { id: { in: [STUDENT_ID] }, tenant_id: TENANT_ID },
      select: expect.objectContaining({ id: true }),
    });
  });
});

describe('StudentReadFacade — findParentsForStudent', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return parent links for a student', async () => {
    const link = {
      student_id: STUDENT_ID,
      parent_id: PARENT_ID,
      relationship_label: 'Mother',
      parent: parentDisplay,
    };
    mockPrisma.studentParent.findMany.mockResolvedValue([link]);

    const result = await facade.findParentsForStudent(TENANT_ID, STUDENT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.parent.first_name).toBe('Jane');
    expect(mockPrisma.studentParent.findMany).toHaveBeenCalledWith({
      where: { student_id: STUDENT_ID, tenant_id: TENANT_ID },
      select: expect.objectContaining({
        student_id: true,
        parent_id: true,
        relationship_label: true,
        parent: expect.anything(),
      }),
    });
  });

  it('should return empty array when no parents linked', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([]);

    const result = await facade.findParentsForStudent(TENANT_ID, STUDENT_ID);

    expect(result).toEqual([]);
  });
});

describe('StudentReadFacade — findParentsForStudents', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return empty array when studentIds is empty', async () => {
    const result = await facade.findParentsForStudents(TENANT_ID, []);

    expect(result).toEqual([]);
    expect(mockPrisma.studentParent.findMany).not.toHaveBeenCalled();
  });

  it('should return parent links for multiple students', async () => {
    const links = [
      {
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
        relationship_label: 'Father',
        parent: parentDisplay,
      },
      {
        student_id: STUDENT_ID_2,
        parent_id: PARENT_ID,
        relationship_label: 'Father',
        parent: parentDisplay,
      },
    ];
    mockPrisma.studentParent.findMany.mockResolvedValue(links);

    const result = await facade.findParentsForStudents(TENANT_ID, [STUDENT_ID, STUDENT_ID_2]);

    expect(result).toHaveLength(2);
    expect(mockPrisma.studentParent.findMany).toHaveBeenCalledWith({
      where: { student_id: { in: [STUDENT_ID, STUDENT_ID_2] }, tenant_id: TENANT_ID },
      select: expect.objectContaining({ student_id: true, parent_id: true }),
    });
  });
});

describe('StudentReadFacade — findStudentWithHousehold', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return student with household details', async () => {
    const studentWithHousehold = {
      ...studentDisplay,
      household: {
        id: HOUSEHOLD_ID,
        household_name: 'Doe Family',
        primary_billing_parent_id: PARENT_ID,
      },
    };
    mockPrisma.student.findFirst.mockResolvedValue(studentWithHousehold);

    const result = await facade.findStudentWithHousehold(TENANT_ID, STUDENT_ID);

    expect(result).toBeDefined();
    expect(result?.household.household_name).toBe('Doe Family');
    expect(result?.household.primary_billing_parent_id).toBe(PARENT_ID);
  });

  it('should return null when student not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    const result = await facade.findStudentWithHousehold(TENANT_ID, 'nonexistent');

    expect(result).toBeNull();
  });
});

describe('StudentReadFacade — existsOrThrow', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should resolve without throwing when student exists', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });

    await expect(facade.existsOrThrow(TENANT_ID, STUDENT_ID)).resolves.toBeUndefined();
  });

  it('should throw NotFoundException when student does not exist', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(facade.existsOrThrow(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
  });

  it('should include student ID in error message', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(facade.existsOrThrow(TENANT_ID, 'bad-id')).rejects.toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'STUDENT_NOT_FOUND',
          message: expect.stringContaining('bad-id'),
        }),
      }),
    );
  });
});

describe('StudentReadFacade — findDisplayNames', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return empty Map when studentIds is empty', async () => {
    const result = await facade.findDisplayNames(TENANT_ID, []);

    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
    expect(mockPrisma.student.findMany).not.toHaveBeenCalled();
  });

  it('should return a Map of id -> "first last"', async () => {
    mockPrisma.student.findMany.mockResolvedValue([
      { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' },
      { id: STUDENT_ID_2, first_name: 'Sara', last_name: 'Ali' },
    ]);

    const result = await facade.findDisplayNames(TENANT_ID, [STUDENT_ID, STUDENT_ID_2]);

    expect(result.get(STUDENT_ID)).toBe('John Doe');
    expect(result.get(STUDENT_ID_2)).toBe('Sara Ali');
    expect(result.size).toBe(2);
  });

  it('should exclude IDs that do not exist in the database', async () => {
    mockPrisma.student.findMany.mockResolvedValue([
      { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' },
    ]);

    const result = await facade.findDisplayNames(TENANT_ID, [STUDENT_ID, 'missing-id']);

    expect(result.size).toBe(1);
    expect(result.has('missing-id')).toBe(false);
  });
});

describe('StudentReadFacade — findActiveByYearGroup', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should query for active students in the given year group', async () => {
    mockPrisma.student.findMany.mockResolvedValue([
      { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' },
    ]);

    const result = await facade.findActiveByYearGroup(TENANT_ID, YEAR_GROUP_ID);

    expect(result).toHaveLength(1);
    expect(mockPrisma.student.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, status: 'active', year_group_id: YEAR_GROUP_ID },
      select: { id: true, first_name: true, last_name: true },
      orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }],
    });
  });

  it('should return empty array when no active students in year group', async () => {
    mockPrisma.student.findMany.mockResolvedValue([]);

    const result = await facade.findActiveByYearGroup(TENANT_ID, YEAR_GROUP_ID);

    expect(result).toEqual([]);
  });
});

describe('StudentReadFacade — count', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should count students with tenant filter only when no extra where', async () => {
    mockPrisma.student.count.mockResolvedValue(42);

    const result = await facade.count(TENANT_ID);

    expect(result).toBe(42);
    expect(mockPrisma.student.count).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID },
    });
  });

  it('should merge additional where clause with tenant filter', async () => {
    mockPrisma.student.count.mockResolvedValue(10);

    const result = await facade.count(TENANT_ID, { status: 'active' });

    expect(result).toBe(10);
    expect(mockPrisma.student.count).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, status: 'active' },
    });
  });
});

describe('StudentReadFacade — isParentLinked', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return true when parent-student link exists', async () => {
    mockPrisma.studentParent.findFirst.mockResolvedValue({ student_id: STUDENT_ID });

    const result = await facade.isParentLinked(TENANT_ID, STUDENT_ID, PARENT_ID);

    expect(result).toBe(true);
  });

  it('should return false when parent-student link does not exist', async () => {
    mockPrisma.studentParent.findFirst.mockResolvedValue(null);

    const result = await facade.isParentLinked(TENANT_ID, STUDENT_ID, PARENT_ID);

    expect(result).toBe(false);
  });
});

describe('StudentReadFacade — findStudentIdsByParent', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return student IDs for a parent', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      { student_id: STUDENT_ID },
      { student_id: STUDENT_ID_2 },
    ]);

    const result = await facade.findStudentIdsByParent(TENANT_ID, PARENT_ID);

    expect(result).toEqual([STUDENT_ID, STUDENT_ID_2]);
  });

  it('should return empty array when parent has no linked students', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([]);

    const result = await facade.findStudentIdsByParent(TENANT_ID, PARENT_ID);

    expect(result).toEqual([]);
  });
});

describe('StudentReadFacade — findParentIdsForStudent', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return parent objects with id and user_id', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      { parent: { id: PARENT_ID, user_id: 'user-1' } },
    ]);

    const result = await facade.findParentIdsForStudent(TENANT_ID, STUDENT_ID);

    expect(result).toEqual([{ id: PARENT_ID, user_id: 'user-1' }]);
  });

  it('should return parent with null user_id when parent has no user', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      { parent: { id: PARENT_ID, user_id: null } },
    ]);

    const result = await facade.findParentIdsForStudent(TENANT_ID, STUDENT_ID);

    expect(result[0]?.user_id).toBeNull();
  });
});

describe('StudentReadFacade — isParentLinkedToStudent', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return true when link exists', async () => {
    mockPrisma.studentParent.findFirst.mockResolvedValue({ student_id: STUDENT_ID });

    const result = await facade.isParentLinkedToStudent(TENANT_ID, PARENT_ID, STUDENT_ID);

    expect(result).toBe(true);
  });

  it('should return false when link does not exist', async () => {
    mockPrisma.studentParent.findFirst.mockResolvedValue(null);

    const result = await facade.isParentLinkedToStudent(TENANT_ID, PARENT_ID, STUDENT_ID);

    expect(result).toBe(false);
  });
});

describe('StudentReadFacade — findParentIdsByStudentIds', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return empty array when studentIds is empty', async () => {
    const result = await facade.findParentIdsByStudentIds(TENANT_ID, []);

    expect(result).toEqual([]);
    expect(mockPrisma.studentParent.findMany).not.toHaveBeenCalled();
  });

  it('should return unique parent IDs', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      { parent_id: PARENT_ID },
      { parent_id: PARENT_ID }, // duplicate
      { parent_id: 'parent-2' },
    ]);

    const result = await facade.findParentIdsByStudentIds(TENANT_ID, [STUDENT_ID, STUDENT_ID_2]);

    expect(result).toHaveLength(2);
    expect(result).toContain(PARENT_ID);
    expect(result).toContain('parent-2');
  });
});

describe('StudentReadFacade — findParentContactsForStudent', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return parent contact details', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      {
        parent: {
          user_id: 'user-1',
          whatsapp_phone: '+971501234567',
          phone: '+971501234567',
          preferred_contact_channels: ['sms'],
        },
      },
    ]);

    const result = await facade.findParentContactsForStudent(TENANT_ID, STUDENT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.parent.whatsapp_phone).toBe('+971501234567');
  });
});

describe('StudentReadFacade — findStudentLinksForParent', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return student links for a parent', async () => {
    mockPrisma.studentParent.findMany.mockResolvedValue([
      {
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
        student: {
          id: STUDENT_ID,
          first_name: 'John',
          last_name: 'Doe',
          student_number: 'STU-001',
        },
      },
    ]);

    const result = await facade.findStudentLinksForParent(TENANT_ID, PARENT_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.student.first_name).toBe('John');
  });
});

describe('StudentReadFacade — findByHousehold', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return students for a household', async () => {
    mockPrisma.student.findMany.mockResolvedValue([
      { id: STUDENT_ID, first_name: 'John', last_name: 'Doe', student_number: 'STU-001' },
    ]);

    const result = await facade.findByHousehold(TENANT_ID, HOUSEHOLD_ID);

    expect(result).toHaveLength(1);
    expect(mockPrisma.student.findMany).toHaveBeenCalledWith({
      where: { household_id: HOUSEHOLD_ID, tenant_id: TENANT_ID },
      select: { id: true, first_name: true, last_name: true, student_number: true },
    });
  });
});

describe('StudentReadFacade — exists', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return true when student exists', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });

    const result = await facade.exists(TENANT_ID, STUDENT_ID);

    expect(result).toBe(true);
  });

  it('should return false when student does not exist', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    const result = await facade.exists(TENANT_ID, 'nonexistent');

    expect(result).toBe(false);
  });
});

describe('StudentReadFacade — countByYearGroup', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return Map of year_group_id -> count', async () => {
    mockPrisma.student.groupBy.mockResolvedValue([
      { year_group_id: YEAR_GROUP_ID, _count: 15 },
      { year_group_id: 'yg-2', _count: 20 },
    ]);

    const result = await facade.countByYearGroup(TENANT_ID);

    expect(result).toBeInstanceOf(Map);
    expect(result.get(YEAR_GROUP_ID)).toBe(15);
    expect(result.get('yg-2')).toBe(20);
  });

  it('should exclude groups with null year_group_id', async () => {
    mockPrisma.student.groupBy.mockResolvedValue([
      { year_group_id: YEAR_GROUP_ID, _count: 10 },
      { year_group_id: null, _count: 5 },
    ]);

    const result = await facade.countByYearGroup(TENANT_ID);

    expect(result.size).toBe(1);
    expect(result.has(YEAR_GROUP_ID)).toBe(true);
  });

  it('should filter by status when provided', async () => {
    mockPrisma.student.groupBy.mockResolvedValue([]);

    await facade.countByYearGroup(TENANT_ID, 'active');

    expect(mockPrisma.student.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('should not add status filter when status is not provided', async () => {
    mockPrisma.student.groupBy.mockResolvedValue([]);

    await facade.countByYearGroup(TENANT_ID);

    const call = mockPrisma.student.groupBy.mock.calls[0]?.[0];
    expect(call?.where).toEqual({ tenant_id: TENANT_ID });
  });
});

describe('StudentReadFacade — findAllStudentNumbers', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return all student numbers without limit', async () => {
    mockPrisma.student.findMany.mockResolvedValue([{ id: STUDENT_ID, student_number: 'STU-001' }]);

    const result = await facade.findAllStudentNumbers(TENANT_ID);

    expect(result).toHaveLength(1);
    expect(mockPrisma.student.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID },
      select: { id: true, student_number: true },
    });
  });

  it('should apply take when limit is provided', async () => {
    mockPrisma.student.findMany.mockResolvedValue([]);

    await facade.findAllStudentNumbers(TENANT_ID, 50);

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID },
      select: { id: true, student_number: true },
      take: 50,
    });
  });
});

describe('StudentReadFacade — findByStudentNumbers', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return empty array when studentNumbers is empty', async () => {
    const result = await facade.findByStudentNumbers(TENANT_ID, []);

    expect(result).toEqual([]);
    expect(mockPrisma.student.findMany).not.toHaveBeenCalled();
  });

  it('should look up students by student_number', async () => {
    mockPrisma.student.findMany.mockResolvedValue([
      { id: STUDENT_ID, student_number: 'STU-001', first_name: 'John', last_name: 'Doe' },
    ]);

    const result = await facade.findByStudentNumbers(TENANT_ID, ['STU-001']);

    expect(result).toHaveLength(1);
    expect(mockPrisma.student.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, student_number: { in: ['STU-001'] } },
      select: { id: true, student_number: true, first_name: true, last_name: true },
    });
  });
});

describe('StudentReadFacade — findActiveStudentIds', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return IDs of active students', async () => {
    mockPrisma.student.findMany.mockResolvedValue([{ id: STUDENT_ID }, { id: STUDENT_ID_2 }]);

    const result = await facade.findActiveStudentIds(TENANT_ID);

    expect(result).toEqual([STUDENT_ID, STUDENT_ID_2]);
  });

  it('should merge extra where clause with active status filter', async () => {
    mockPrisma.student.findMany.mockResolvedValue([{ id: STUDENT_ID }]);

    await facade.findActiveStudentIds(TENANT_ID, { year_group_id: YEAR_GROUP_ID });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        status: 'active',
        year_group_id: YEAR_GROUP_ID,
      },
      select: { id: true },
    });
  });
});

describe('StudentReadFacade — findManyGeneric', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should pass minimal options (no select/include/orderBy/skip/take)', async () => {
    mockPrisma.student.findMany.mockResolvedValue([]);

    await facade.findManyGeneric(TENANT_ID, {});

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID },
    });
  });

  it('should pass select when provided', async () => {
    mockPrisma.student.findMany.mockResolvedValue([]);

    await facade.findManyGeneric(TENANT_ID, {
      select: { id: true, first_name: true },
    });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, first_name: true },
      }),
    );
  });

  it('should pass include when provided', async () => {
    mockPrisma.student.findMany.mockResolvedValue([]);

    await facade.findManyGeneric(TENANT_ID, {
      include: { year_group: true },
    });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { year_group: true },
      }),
    );
  });

  it('should pass orderBy when provided', async () => {
    mockPrisma.student.findMany.mockResolvedValue([]);

    await facade.findManyGeneric(TENANT_ID, {
      orderBy: { last_name: 'asc' },
    });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { last_name: 'asc' },
      }),
    );
  });

  it('should pass skip and take when provided', async () => {
    mockPrisma.student.findMany.mockResolvedValue([]);

    await facade.findManyGeneric(TENANT_ID, { skip: 10, take: 5 });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 5,
      }),
    );
  });

  it('edge: should handle skip=0 correctly (falsy but valid)', async () => {
    mockPrisma.student.findMany.mockResolvedValue([]);

    await facade.findManyGeneric(TENANT_ID, { skip: 0 });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
      }),
    );
  });

  it('edge: should handle take=0 correctly (falsy but valid)', async () => {
    mockPrisma.student.findMany.mockResolvedValue([]);

    await facade.findManyGeneric(TENANT_ID, { take: 0 });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 0,
      }),
    );
  });

  it('should merge additional where clause with tenant_id', async () => {
    mockPrisma.student.findMany.mockResolvedValue([]);

    await facade.findManyGeneric(TENANT_ID, {
      where: { status: 'active' },
    });

    expect(mockPrisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT_ID, status: 'active' },
      }),
    );
  });
});

describe('StudentReadFacade — findOneGeneric', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should query with minimal options (no select/include)', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });

    await facade.findOneGeneric(TENANT_ID, STUDENT_ID);

    expect(mockPrisma.student.findFirst).toHaveBeenCalledWith({
      where: { id: STUDENT_ID, tenant_id: TENANT_ID },
    });
  });

  it('should pass select when provided', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });

    await facade.findOneGeneric(TENANT_ID, STUDENT_ID, {
      select: { id: true, first_name: true },
    });

    expect(mockPrisma.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, first_name: true },
      }),
    );
  });

  it('should pass include when provided', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });

    await facade.findOneGeneric(TENANT_ID, STUDENT_ID, {
      include: { year_group: true },
    });

    expect(mockPrisma.student.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { year_group: true },
      }),
    );
  });

  it('should return null when student not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    const result = await facade.findOneGeneric(TENANT_ID, 'nonexistent');

    expect(result).toBeNull();
  });
});

describe('StudentReadFacade — findWithDependencyCounts', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return student with dependency counts', async () => {
    const expected = {
      id: STUDENT_ID,
      _count: {
        attendance_records: 5,
        grades: 10,
        class_enrolments: 3,
        invoice_lines: 2,
        report_cards: 1,
      },
    };
    mockPrisma.student.findUnique.mockResolvedValue(expected);

    const result = await facade.findWithDependencyCounts(STUDENT_ID);

    expect(result).toEqual(expected);
    expect(mockPrisma.student.findUnique).toHaveBeenCalledWith({
      where: { id: STUDENT_ID },
      select: {
        id: true,
        _count: {
          select: {
            attendance_records: true,
            grades: true,
            class_enrolments: true,
            invoice_lines: true,
            report_cards: true,
          },
        },
      },
    });
  });

  it('should return null when student not found', async () => {
    mockPrisma.student.findUnique.mockResolvedValue(null);

    const result = await facade.findWithDependencyCounts('nonexistent');

    expect(result).toBeNull();
  });
});

describe('StudentReadFacade — groupBy', () => {
  let facade: StudentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [StudentReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    facade = module.get<StudentReadFacade>(StudentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should group by specified fields with count', async () => {
    mockPrisma.student.groupBy.mockResolvedValue([
      { gender: 'male', _count: 20 },
      { gender: 'female', _count: 15 },
    ]);

    const result = await facade.groupBy(TENANT_ID, ['gender' as never]);

    expect(result).toHaveLength(2);
    expect(mockPrisma.student.groupBy).toHaveBeenCalledWith({
      by: ['gender'],
      where: { tenant_id: TENANT_ID },
      _count: true,
    });
  });

  it('should merge additional where clause', async () => {
    mockPrisma.student.groupBy.mockResolvedValue([]);

    await facade.groupBy(TENANT_ID, ['status' as never], { year_group_id: YEAR_GROUP_ID });

    expect(mockPrisma.student.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { tenant_id: TENANT_ID, year_group_id: YEAR_GROUP_ID },
      _count: true,
    });
  });
});
