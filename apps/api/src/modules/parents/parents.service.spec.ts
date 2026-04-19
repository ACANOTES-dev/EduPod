import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { MOCK_FACADE_PROVIDERS, AuthReadFacade } from '../../common/tests/mock-facades';
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
  // Parent.create now resolves user_id via the household's shared login.
  household: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
  tenantDomain: {
    findFirst: jest.fn().mockResolvedValue({ domain: 'test.edupod.app' }),
  },
  user: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
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
  let mockAuthFacade: { findUserByEmail: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockAuthFacade = { findUserByEmail: jest.fn().mockResolvedValue(null) };

    mockRlsTx.parent.create.mockReset().mockResolvedValue(baseParent);
    mockRlsTx.householdParent.create.mockReset().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ParentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthReadFacade, useValue: mockAuthFacade },
      ],
    }).compile();

    service = module.get<ParentsService>(ParentsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('links the parent to the household shared user when household_id is set', async () => {
    const SHARED_USER_ID = 'user-uuid-0001';
    mockRlsTx.household.findFirst.mockResolvedValueOnce({ household_number: 'ABC123' });
    mockRlsTx.user.findUnique.mockResolvedValueOnce({ id: SHARED_USER_ID });

    const result = await service.create(TENANT_ID, {
      ...baseCreateDto,
      household_id: 'household-uuid-0001',
    });
    expect(mockRlsTx.parent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          user_id: SHARED_USER_ID,
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

    await service.create(TENANT_ID, {
      ...baseCreateDto,
      household_id: HOUSEHOLD_ID,
      role_label: 'Guardian',
    });

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

  it('edge: should rethrow non-P2002 errors from parent.create', async () => {
    const genericError = new Error('Connection failed');
    mockRlsTx.parent.create.mockReset().mockRejectedValue(genericError);

    await expect(service.create(TENANT_ID, baseCreateDto)).rejects.toThrow('Connection failed');
  });

  it('edge: should rethrow non-P2002 PrismaClientKnownRequestError from parent.create', async () => {
    const p2003 = new Prisma.PrismaClientKnownRequestError('FK violation', {
      code: 'P2003',
      clientVersion: '5.0.0',
    });
    mockRlsTx.parent.create.mockReset().mockRejectedValue(p2003);

    await expect(service.create(TENANT_ID, baseCreateDto)).rejects.toThrow(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  it('should skip silently when household link has P2002 (already linked)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    mockRlsTx.householdParent.create.mockReset().mockRejectedValue(p2002);

    const result = await service.create(TENANT_ID, {
      ...baseCreateDto,
      household_id: HOUSEHOLD_ID,
    });

    expect(result).toHaveProperty('id', PARENT_ID);
  });

  it('edge: should rethrow non-P2002 errors from householdParent.create', async () => {
    const genericError = new Error('Constraint error');
    mockRlsTx.householdParent.create.mockReset().mockRejectedValue(genericError);

    await expect(
      service.create(TENANT_ID, { ...baseCreateDto, household_id: HOUSEHOLD_ID }),
    ).rejects.toThrow('Constraint error');
  });

  it('should set defaults for optional fields when not provided', async () => {
    const minimalDto = {
      first_name: 'Bob',
      last_name: 'Jones',
      preferred_contact_channels: ['email' as const],
    };

    await service.create(TENANT_ID, minimalDto);

    expect(mockRlsTx.parent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: null,
          phone: null,
          whatsapp_phone: null,
          relationship_label: null,
          is_primary_contact: false,
          is_billing_contact: false,
        }),
      }),
    );
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
        ...MOCK_FACADE_PROVIDERS,
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

    expect(mockRlsTx.parent.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20 }));
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
        ...MOCK_FACADE_PROVIDERS,
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
        {
          household_id: HOUSEHOLD_ID,
          parent_id: PARENT_ID,
          household: { id: HOUSEHOLD_ID, household_name: 'Smith Family' },
        },
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
        ...MOCK_FACADE_PROVIDERS,
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

    await expect(service.update(TENANT_ID, PARENT_ID, { first_name: 'Alicia' })).rejects.toThrow(
      NotFoundException,
    );
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

  it('edge: should rethrow non-P2002 errors from parent.update', async () => {
    const genericError = new Error('DB connection lost');
    mockRlsTx.parent.update.mockReset().mockRejectedValue(genericError);

    await expect(service.update(TENANT_ID, PARENT_ID, { first_name: 'Test' })).rejects.toThrow(
      'DB connection lost',
    );
  });

  it('should only include provided fields in update data (last_name)', async () => {
    await service.update(TENANT_ID, PARENT_ID, { last_name: 'Jones' });

    const callData = (
      mockRlsTx.parent.update.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined
    )?.data;
    expect(callData).toHaveProperty('last_name', 'Jones');
    expect(callData).not.toHaveProperty('first_name');
  });

  it('should include phone in update data when provided', async () => {
    await service.update(TENANT_ID, PARENT_ID, { phone: '+1-555-1234' });

    expect(mockRlsTx.parent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ phone: '+1-555-1234' }),
      }),
    );
  });

  it('should include whatsapp_phone in update data when provided', async () => {
    await service.update(TENANT_ID, PARENT_ID, { whatsapp_phone: '+1-555-9876' });

    expect(mockRlsTx.parent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ whatsapp_phone: '+1-555-9876' }),
      }),
    );
  });

  it('should include preferred_contact_channels in update data when provided', async () => {
    await service.update(TENANT_ID, PARENT_ID, {
      preferred_contact_channels: ['whatsapp', 'email'],
    });

    expect(mockRlsTx.parent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ preferred_contact_channels: ['whatsapp', 'email'] }),
      }),
    );
  });

  it('should include relationship_label in update data when provided', async () => {
    await service.update(TENANT_ID, PARENT_ID, { relationship_label: 'Father' });

    expect(mockRlsTx.parent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ relationship_label: 'Father' }),
      }),
    );
  });

  it('should include is_primary_contact in update data when provided', async () => {
    await service.update(TENANT_ID, PARENT_ID, { is_primary_contact: false });

    expect(mockRlsTx.parent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ is_primary_contact: false }),
      }),
    );
  });

  it('should include is_billing_contact in update data when provided', async () => {
    await service.update(TENANT_ID, PARENT_ID, { is_billing_contact: true });

    expect(mockRlsTx.parent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ is_billing_contact: true }),
      }),
    );
  });

  it('should include email in update data when provided', async () => {
    await service.update(TENANT_ID, PARENT_ID, { email: 'newemail@example.com' });

    expect(mockRlsTx.parent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'newemail@example.com' }),
      }),
    );
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
        ...MOCK_FACADE_PROVIDERS,
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

    await expect(service.linkStudent(TENANT_ID, PARENT_ID, STUDENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw NotFoundException when student not found', async () => {
    mockRlsTx.student.findFirst.mockReset().mockResolvedValue(null);

    await expect(service.linkStudent(TENANT_ID, PARENT_ID, STUDENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw ConflictException when student already linked (P2002)', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    mockRlsTx.studentParent.create.mockReset().mockRejectedValue(p2002);

    await expect(service.linkStudent(TENANT_ID, PARENT_ID, STUDENT_ID)).rejects.toThrow(
      ConflictException,
    );
  });

  it('should set relationship_label to null when not provided', async () => {
    await service.linkStudent(TENANT_ID, PARENT_ID, STUDENT_ID);

    expect(mockRlsTx.studentParent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          relationship_label: null,
        }),
      }),
    );
  });

  it('edge: should rethrow non-P2002 errors from studentParent.create', async () => {
    const genericError = new Error('Unknown DB error');
    mockRlsTx.studentParent.create.mockReset().mockRejectedValue(genericError);

    await expect(service.linkStudent(TENANT_ID, PARENT_ID, STUDENT_ID)).rejects.toThrow(
      'Unknown DB error',
    );
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
        ...MOCK_FACADE_PROVIDERS,
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

    await expect(service.unlinkStudent(TENANT_ID, PARENT_ID, STUDENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});
