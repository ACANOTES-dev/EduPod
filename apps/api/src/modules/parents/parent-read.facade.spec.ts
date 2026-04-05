import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

import { ParentReadFacade } from './parent-read.facade';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PARENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const STUDENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const parentSummary = {
  id: PARENT_ID,
  tenant_id: TENANT_ID,
  user_id: USER_ID,
  first_name: 'Alice',
  last_name: 'Smith',
  email: 'alice@example.com',
  phone: '+353-1-555-0001',
  whatsapp_phone: '+353-1-555-0002',
  preferred_contact_channels: ['email'],
  relationship_label: 'Mother',
  is_primary_contact: true,
  is_billing_contact: false,
  status: 'active',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

// ─── Mock factories ──────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    parent: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

function buildMockStudentReadFacade() {
  return {
    findStudentIdsByParent: jest.fn().mockResolvedValue([]),
    findParentIdsForStudent: jest.fn().mockResolvedValue([]),
    isParentLinkedToStudent: jest.fn().mockResolvedValue(false),
    findParentIdsByStudentIds: jest.fn().mockResolvedValue([]),
    findParentContactsForStudent: jest.fn().mockResolvedValue([]),
    findStudentLinksForParent: jest.fn().mockResolvedValue([]),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ParentReadFacade — findById', () => {
  let facade: ParentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StudentReadFacade, useValue: buildMockStudentReadFacade() },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return parent summary when found', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue(parentSummary);

    const result = await facade.findById(TENANT_ID, PARENT_ID);

    expect(result).toEqual(parentSummary);
    expect(mockPrisma.parent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PARENT_ID, tenant_id: TENANT_ID },
      }),
    );
  });

  it('should return null when parent not found', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue(null);

    const result = await facade.findById(TENANT_ID, 'nonexistent');

    expect(result).toBeNull();
  });
});

describe('ParentReadFacade — findByIds', () => {
  let facade: ParentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StudentReadFacade, useValue: buildMockStudentReadFacade() },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return matching parents for given IDs', async () => {
    mockPrisma.parent.findMany.mockResolvedValue([parentSummary]);

    const result = await facade.findByIds(TENANT_ID, [PARENT_ID]);

    expect(result).toEqual([parentSummary]);
    expect(mockPrisma.parent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [PARENT_ID] }, tenant_id: TENANT_ID },
      }),
    );
  });

  it('edge: should return empty array when parentIds is empty', async () => {
    const result = await facade.findByIds(TENANT_ID, []);

    expect(result).toEqual([]);
    expect(mockPrisma.parent.findMany).not.toHaveBeenCalled();
  });
});

describe('ParentReadFacade — findByUserId', () => {
  let facade: ParentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StudentReadFacade, useValue: buildMockStudentReadFacade() },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return parent for user_id', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue(parentSummary);

    const result = await facade.findByUserId(TENANT_ID, USER_ID);

    expect(result).toEqual(parentSummary);
    expect(mockPrisma.parent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: USER_ID, tenant_id: TENANT_ID },
      }),
    );
  });

  it('should return null when no parent linked to user', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue(null);

    const result = await facade.findByUserId(TENANT_ID, 'no-match');

    expect(result).toBeNull();
  });
});

describe('ParentReadFacade — findActiveByUserId', () => {
  let facade: ParentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StudentReadFacade, useValue: buildMockStudentReadFacade() },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return active parent for user_id', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue(parentSummary);

    const result = await facade.findActiveByUserId(TENANT_ID, USER_ID);

    expect(result).toEqual(parentSummary);
    expect(mockPrisma.parent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: USER_ID, tenant_id: TENANT_ID, status: 'active' },
      }),
    );
  });

  it('should return null when parent is not active', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue(null);

    const result = await facade.findActiveByUserId(TENANT_ID, USER_ID);

    expect(result).toBeNull();
  });
});

describe('ParentReadFacade — existsOrThrow', () => {
  let facade: ParentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StudentReadFacade, useValue: buildMockStudentReadFacade() },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should not throw when parent exists', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });

    await expect(facade.existsOrThrow(TENANT_ID, PARENT_ID)).resolves.toBeUndefined();
  });

  it('should throw NotFoundException when parent does not exist', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue(null);

    await expect(facade.existsOrThrow(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
  });
});

describe('ParentReadFacade — findAllActiveIds', () => {
  let facade: ParentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StudentReadFacade, useValue: buildMockStudentReadFacade() },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return IDs of all active parents with user_id', async () => {
    mockPrisma.parent.findMany.mockResolvedValue([{ id: PARENT_ID }, { id: 'parent-2' }]);

    const result = await facade.findAllActiveIds(TENANT_ID);

    expect(result).toEqual([PARENT_ID, 'parent-2']);
    expect(mockPrisma.parent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT_ID, user_id: { not: null }, status: 'active' },
      }),
    );
  });

  it('should return empty array when no active parents exist', async () => {
    mockPrisma.parent.findMany.mockResolvedValue([]);

    const result = await facade.findAllActiveIds(TENANT_ID);

    expect(result).toEqual([]);
  });
});

describe('ParentReadFacade — findContactByUserId', () => {
  let facade: ParentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StudentReadFacade, useValue: buildMockStudentReadFacade() },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return contact info for user', async () => {
    const contactRow = {
      id: PARENT_ID,
      phone: '+353-1-555-0001',
      whatsapp_phone: '+353-1-555-0002',
      preferred_contact_channels: ['email'],
    };
    mockPrisma.parent.findFirst.mockResolvedValue(contactRow);

    const result = await facade.findContactByUserId(TENANT_ID, USER_ID);

    expect(result).toEqual(contactRow);
  });

  it('should return null when no parent found for user', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue(null);

    const result = await facade.findContactByUserId(TENANT_ID, 'no-match');

    expect(result).toBeNull();
  });
});

describe('ParentReadFacade — resolveIdByUserId', () => {
  let facade: ParentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StudentReadFacade, useValue: buildMockStudentReadFacade() },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return parent ID when found', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });

    const result = await facade.resolveIdByUserId(TENANT_ID, USER_ID);

    expect(result).toBe(PARENT_ID);
  });

  it('should return null when no parent found', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue(null);

    const result = await facade.resolveIdByUserId(TENANT_ID, 'no-match');

    expect(result).toBeNull();
  });
});

describe('ParentReadFacade — findActiveContactsByIds', () => {
  let facade: ParentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StudentReadFacade, useValue: buildMockStudentReadFacade() },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return active contacts with user_id', async () => {
    mockPrisma.parent.findMany.mockResolvedValue([
      { user_id: USER_ID, preferred_contact_channels: ['email'] },
    ]);

    const result = await facade.findActiveContactsByIds(TENANT_ID, [PARENT_ID]);

    expect(result).toEqual([{ user_id: USER_ID, preferred_contact_channels: ['email'] }]);
  });

  it('edge: should return empty array when parentIds is empty', async () => {
    const result = await facade.findActiveContactsByIds(TENANT_ID, []);

    expect(result).toEqual([]);
    expect(mockPrisma.parent.findMany).not.toHaveBeenCalled();
  });

  it('edge: should filter out parents with null user_id from results', async () => {
    mockPrisma.parent.findMany.mockResolvedValue([
      { user_id: USER_ID, preferred_contact_channels: ['email'] },
      { user_id: null, preferred_contact_channels: ['sms'] },
    ]);

    const result = await facade.findActiveContactsByIds(TENANT_ID, [PARENT_ID, 'parent-2']);

    expect(result).toHaveLength(1);
    expect(result[0]?.user_id).toBe(USER_ID);
  });
});

// ─── Delegation methods (to StudentReadFacade) ─────────────────────────────

describe('ParentReadFacade — findLinkedStudentIds', () => {
  let facade: ParentReadFacade;
  let mockStudentFacade: ReturnType<typeof buildMockStudentReadFacade>;

  beforeEach(async () => {
    mockStudentFacade = buildMockStudentReadFacade();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delegate to studentReadFacade.findStudentIdsByParent', async () => {
    mockStudentFacade.findStudentIdsByParent.mockResolvedValue([STUDENT_ID]);

    const result = await facade.findLinkedStudentIds(TENANT_ID, PARENT_ID);

    expect(result).toEqual([STUDENT_ID]);
    expect(mockStudentFacade.findStudentIdsByParent).toHaveBeenCalledWith(TENANT_ID, PARENT_ID);
  });
});

describe('ParentReadFacade — findParentUserIdsForStudent', () => {
  let facade: ParentReadFacade;
  let mockStudentFacade: ReturnType<typeof buildMockStudentReadFacade>;

  beforeEach(async () => {
    mockStudentFacade = buildMockStudentReadFacade();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delegate to studentReadFacade.findParentIdsForStudent', async () => {
    const parentIdRow = { id: PARENT_ID, user_id: USER_ID };
    mockStudentFacade.findParentIdsForStudent.mockResolvedValue([parentIdRow]);

    const result = await facade.findParentUserIdsForStudent(TENANT_ID, STUDENT_ID);

    expect(result).toEqual([parentIdRow]);
    expect(mockStudentFacade.findParentIdsForStudent).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
  });
});

describe('ParentReadFacade — isLinkedToStudent', () => {
  let facade: ParentReadFacade;
  let mockStudentFacade: ReturnType<typeof buildMockStudentReadFacade>;

  beforeEach(async () => {
    mockStudentFacade = buildMockStudentReadFacade();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return true when parent is linked to student', async () => {
    mockStudentFacade.isParentLinkedToStudent.mockResolvedValue(true);

    const result = await facade.isLinkedToStudent(TENANT_ID, PARENT_ID, STUDENT_ID);

    expect(result).toBe(true);
    expect(mockStudentFacade.isParentLinkedToStudent).toHaveBeenCalledWith(
      TENANT_ID,
      PARENT_ID,
      STUDENT_ID,
    );
  });

  it('should return false when parent is not linked to student', async () => {
    mockStudentFacade.isParentLinkedToStudent.mockResolvedValue(false);

    const result = await facade.isLinkedToStudent(TENANT_ID, PARENT_ID, STUDENT_ID);

    expect(result).toBe(false);
  });
});

describe('ParentReadFacade — findParentIdsByStudentIds', () => {
  let facade: ParentReadFacade;
  let mockStudentFacade: ReturnType<typeof buildMockStudentReadFacade>;

  beforeEach(async () => {
    mockStudentFacade = buildMockStudentReadFacade();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delegate to studentReadFacade.findParentIdsByStudentIds', async () => {
    mockStudentFacade.findParentIdsByStudentIds.mockResolvedValue([PARENT_ID]);

    const result = await facade.findParentIdsByStudentIds(TENANT_ID, [STUDENT_ID]);

    expect(result).toEqual([PARENT_ID]);
    expect(mockStudentFacade.findParentIdsByStudentIds).toHaveBeenCalledWith(TENANT_ID, [
      STUDENT_ID,
    ]);
  });
});

describe('ParentReadFacade — findParentContactsForStudent', () => {
  let facade: ParentReadFacade;
  let mockStudentFacade: ReturnType<typeof buildMockStudentReadFacade>;

  beforeEach(async () => {
    mockStudentFacade = buildMockStudentReadFacade();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delegate to studentReadFacade.findParentContactsForStudent', async () => {
    const contactData = [
      {
        parent: {
          user_id: USER_ID,
          whatsapp_phone: null,
          phone: '+353-1',
          preferred_contact_channels: ['email'],
        },
      },
    ];
    mockStudentFacade.findParentContactsForStudent.mockResolvedValue(contactData);

    const result = await facade.findParentContactsForStudent(TENANT_ID, STUDENT_ID);

    expect(result).toEqual(contactData);
    expect(mockStudentFacade.findParentContactsForStudent).toHaveBeenCalledWith(
      TENANT_ID,
      STUDENT_ID,
    );
  });
});

describe('ParentReadFacade — findStudentLinksForParent', () => {
  let facade: ParentReadFacade;
  let mockStudentFacade: ReturnType<typeof buildMockStudentReadFacade>;

  beforeEach(async () => {
    mockStudentFacade = buildMockStudentReadFacade();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delegate to studentReadFacade.findStudentLinksForParent', async () => {
    const linkData = [
      {
        student_id: STUDENT_ID,
        parent_id: PARENT_ID,
        student: {
          id: STUDENT_ID,
          first_name: 'Ben',
          last_name: 'Smith',
          student_number: 'STU-001',
        },
      },
    ];
    mockStudentFacade.findStudentLinksForParent.mockResolvedValue(linkData);

    const result = await facade.findStudentLinksForParent(TENANT_ID, PARENT_ID);

    expect(result).toEqual(linkData);
    expect(mockStudentFacade.findStudentLinksForParent).toHaveBeenCalledWith(TENANT_ID, PARENT_ID);
  });
});

describe('ParentReadFacade — findActiveByUserIdWithLocale', () => {
  let facade: ParentReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentReadFacade,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StudentReadFacade, useValue: buildMockStudentReadFacade() },
      ],
    }).compile();

    facade = module.get<ParentReadFacade>(ParentReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return active parent with user locale', async () => {
    const parentWithLocale = {
      ...parentSummary,
      user: { preferred_locale: 'ar' },
    };
    mockPrisma.parent.findFirst.mockResolvedValue(parentWithLocale);

    const result = await facade.findActiveByUserIdWithLocale(TENANT_ID, USER_ID);

    expect(result).toEqual(parentWithLocale);
    expect(mockPrisma.parent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: USER_ID, tenant_id: TENANT_ID, status: 'active' },
      }),
    );
  });

  it('should return null when no active parent found', async () => {
    mockPrisma.parent.findFirst.mockResolvedValue(null);

    const result = await facade.findActiveByUserIdWithLocale(TENANT_ID, USER_ID);

    expect(result).toBeNull();
  });
});
