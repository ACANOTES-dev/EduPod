import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ParentsService } from './parents.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOUSEHOLD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  parent: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  householdParent: {
    create: jest.fn(),
  },
  student: {
    findFirst: jest.fn(),
  },
  studentParent: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
    },
  };
}

const baseParent = {
  id: PARENT_ID,
  tenant_id: TENANT_ID,
  user_id: null,
  first_name: 'Alice',
  last_name: 'Smith',
  email: 'alice@example.com',
  phone: '+353-1-555-0001',
  whatsapp_phone: null,
  preferred_contact_channels: ['email'],
  relationship_label: 'Mother',
  is_primary_contact: true,
  is_billing_contact: false,
  status: 'active',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

const baseCreateDto = {
  first_name: 'Alice',
  last_name: 'Smith',
  email: 'alice@example.com' as string | undefined,
  preferred_contact_channels: ['email' as const],
};

// ─── Tests: create ────────────────────────────────────────────────────────────

describe('ParentsService — create', () => {
  let service: ParentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.parent.create.mockReset().mockResolvedValue(baseParent);
    mockRlsTx.householdParent.create.mockReset().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ParentsService>(ParentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a parent and link to user by email when user exists', async () => {
    const USER_ID = 'user-uuid-0001';
    mockPrisma.user.findUnique.mockResolvedValue({ id: USER_ID });

    const result = await service.create(TENANT_ID, baseCreateDto);

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'alice@example.com' },
      select: { id: true },
    });
    expect(mockRlsTx.parent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          first_name: 'Alice',
          last_name: 'Smith',
        }),
      }),
    );
    expect(result).toHaveProperty('id', PARENT_ID);
  });

  it('should create a parent without user link when no email match', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await service.create(TENANT_ID, baseCreateDto);

    expect(mockRlsTx.parent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          user_id: null,
        }),
      }),
    );
  });

  it('should create a parent without querying user when no email provided', async () => {
    const dto = { ...baseCreateDto, email: undefined };

    await service.create(TENANT_ID, dto);

    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockRlsTx.parent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: null }),
      }),
    );
  });

  it('should link parent to household when household_id provided', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await service.create(TENANT_ID, { ...baseCreateDto, household_id: HOUSEHOLD_ID, role_label: 'Guardian' });

    expect(mockRlsTx.householdParent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          household_id: HOUSEHOLD_ID,
          parent_id: PARENT_ID,
          role_label: 'Guardian',
        }),
      }),
    );
  });

  it('should throw ConflictException on duplicate email (P2002)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    mockRlsTx.parent.create.mockReset().mockRejectedValue(p2002);

    await expect(service.create(TENANT_ID, baseCreateDto)).rejects.toThrow(ConflictException);
  });
});

// ─── Tests: findAll ───────────────────────────────────────────────────────────

describe('ParentsService — findAll', () => {
  let service: ParentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.parent.findMany.mockReset().mockResolvedValue([baseParent]);
    mockRlsTx.parent.count.mockReset().mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ParentsService>(ParentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated parents', async () => {
    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('should apply search filter across first_name, last_name, and email', async () => {
    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, search: 'Alice' });

    expect(mockRlsTx.parent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ first_name: expect.anything() }),
            expect.objectContaining({ last_name: expect.anything() }),
            expect.objectContaining({ email: expect.anything() }),
          ]),
        }),
      }),
    );
  });

  it('should filter by status when provided', async () => {
    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, status: 'active' });

    expect(mockRlsTx.parent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('should apply correct skip for page 2', async () => {
    await service.findAll(TENANT_ID, { page: 2, pageSize: 20 });

    expect(mockRlsTx.parent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20 }),
    );
  });
});

// ─── Tests: findOne ───────────────────────────────────────────────────────────

describe('ParentsService — findOne', () => {
  let service: ParentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ParentsService>(ParentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return parent detail including household and student links', async () => {
    mockRlsTx.parent.findFirst.mockReset().mockResolvedValue({
      ...baseParent,
      household_parents: [
        { household_id: HOUSEHOLD_ID, parent_id: PARENT_ID, household: { id: HOUSEHOLD_ID, household_name: 'Smith Family' } },
      ],
      student_parents: [],
    });

    const result = await service.findOne(TENANT_ID, PARENT_ID);

    expect(result.id).toBe(PARENT_ID);
    expect(result).toHaveProperty('household_parents');
    expect(result).toHaveProperty('student_parents');
  });

  it('should throw NotFoundException if parent not found', async () => {
    mockRlsTx.parent.findFirst.mockReset().mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, PARENT_ID)).rejects.toThrow(NotFoundException);
  });
});

// ─── Tests: update ────────────────────────────────────────────────────────────

describe('ParentsService — update', () => {
  let service: ParentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.parent.findFirst.mockReset().mockResolvedValue(baseParent);
    mockRlsTx.parent.update.mockReset().mockResolvedValue({
      ...baseParent,
      first_name: 'Alicia',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ParentsService>(ParentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should update parent fields', async () => {
    const result = await service.update(TENANT_ID, PARENT_ID, { first_name: 'Alicia' });

    expect(mockRlsTx.parent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PARENT_ID },
        data: expect.objectContaining({ first_name: 'Alicia' }),
      }),
    );
    expect(result).toHaveProperty('first_name', 'Alicia');
  });

  it('should throw NotFoundException when parent does not exist', async () => {
    mockRlsTx.parent.findFirst.mockReset().mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, PARENT_ID, { first_name: 'Alicia' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException on duplicate email during update (P2002)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    mockRlsTx.parent.update.mockReset().mockRejectedValue(p2002);

    await expect(
      service.update(TENANT_ID, PARENT_ID, { email: 'duplicate@example.com' }),
    ).rejects.toThrow(ConflictException);
  });
});

// ─── Tests: linkStudent ───────────────────────────────────────────────────────

describe('ParentsService — linkStudent', () => {
  let service: ParentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.parent.findFirst.mockReset().mockResolvedValue(baseParent);
    mockRlsTx.student.findFirst.mockReset().mockResolvedValue({
      id: STUDENT_ID,
      tenant_id: TENANT_ID,
      first_name: 'Ben',
      last_name: 'Smith',
    });
    mockRlsTx.studentParent.create.mockReset().mockResolvedValue({
      student_id: STUDENT_ID,
      parent_id: PARENT_ID,
      tenant_id: TENANT_ID,
      relationship_label: 'Mother',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ParentsService>(ParentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should link student to parent successfully', async () => {
    const result = await service.linkStudent(TENANT_ID, PARENT_ID, STUDENT_ID, 'Mother');

    expect(mockRlsTx.studentParent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          parent_id: PARENT_ID,
          relationship_label: 'Mother',
        }),
      }),
    );
    expect(result).toHaveProperty('student_id', STUDENT_ID);
  });

  it('should throw NotFoundException when parent not found', async () => {
    mockRlsTx.parent.findFirst.mockReset().mockResolvedValue(null);

    await expect(
      service.linkStudent(TENANT_ID, PARENT_ID, STUDENT_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when student not found', async () => {
    mockRlsTx.student.findFirst.mockReset().mockResolvedValue(null);

    await expect(
      service.linkStudent(TENANT_ID, PARENT_ID, STUDENT_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when student already linked (P2002)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    mockRlsTx.studentParent.create.mockReset().mockRejectedValue(p2002);

    await expect(
      service.linkStudent(TENANT_ID, PARENT_ID, STUDENT_ID),
    ).rejects.toThrow(ConflictException);
  });
});

// ─── Tests: unlinkStudent ─────────────────────────────────────────────────────

describe('ParentsService — unlinkStudent', () => {
  let service: ParentsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ParentsService>(ParentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should unlink student successfully', async () => {
    mockRlsTx.studentParent.findUnique.mockReset().mockResolvedValue({
      student_id: STUDENT_ID,
      parent_id: PARENT_ID,
    });
    mockRlsTx.studentParent.delete.mockReset().mockResolvedValue({});

    await service.unlinkStudent(TENANT_ID, PARENT_ID, STUDENT_ID);

    expect(mockRlsTx.studentParent.delete).toHaveBeenCalledWith({
      where: {
        student_id_parent_id: {
          student_id: STUDENT_ID,
          parent_id: PARENT_ID,
        },
      },
    });
  });

  it('should throw NotFoundException when unlinking nonexistent link', async () => {
    mockRlsTx.studentParent.findUnique.mockReset().mockResolvedValue(null);

    await expect(
      service.unlinkStudent(TENANT_ID, PARENT_ID, STUDENT_ID),
    ).rejects.toThrow(NotFoundException);
  });
});
