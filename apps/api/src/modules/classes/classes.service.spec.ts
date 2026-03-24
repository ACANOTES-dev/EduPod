import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { ClassesService } from './classes.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'class-1';
const ACADEMIC_YEAR_ID = 'ay-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  class: {
    create: jest.fn(),
    update: jest.fn(),
  },
  classStaff: {
    create: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
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
    academicYear: { findFirst: jest.fn() },
    class: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    yearGroup: { findFirst: jest.fn() },
    subject: { findFirst: jest.fn() },
    staffProfile: { findFirst: jest.fn() },
    classStaff: { findFirst: jest.fn() },
  };
}

function buildMockRedis() {
  const client = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  return { getClient: jest.fn().mockReturnValue(client), _client: client };
}

const baseClass = {
  id: CLASS_ID,
  tenant_id: TENANT_ID,
  name: '10A',
  academic_year_id: ACADEMIC_YEAR_ID,
  year_group_id: null,
  subject_id: null,
  status: 'active',
  max_capacity: null,
};

const baseCreateDto = {
  name: '10A',
  academic_year_id: ACADEMIC_YEAR_ID,
  status: 'active' as const,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ClassesService — create', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    mockRlsTx.class.create.mockReset().mockResolvedValue({
      ...baseClass,
      academic_year: { id: ACADEMIC_YEAR_ID, name: '2025/2026' },
      year_group: null,
      subject: null,
    });

    mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ClassesService>(ClassesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a class with correct tenant_id', async () => {
    await service.create(TENANT_ID, baseCreateDto);

    expect(mockRlsTx.class.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          name: '10A',
          academic_year_id: ACADEMIC_YEAR_ID,
        }),
      }),
    );
  });

  it('should throw NotFoundException when academic year does not exist', async () => {
    mockPrisma.academicYear.findFirst.mockResolvedValue(null);

    await expect(
      service.create(TENANT_ID, baseCreateDto),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException on duplicate class name (P2002)', async () => {
    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.0.0', meta: {} },
    );
    mockRlsTx.class.create.mockRejectedValue(p2002Error);

    await expect(
      service.create(TENANT_ID, baseCreateDto),
    ).rejects.toThrow(ConflictException);
  });
});

describe('ClassesService — findAll', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    mockPrisma.class.findMany.mockResolvedValue([baseClass]);
    mockPrisma.class.count.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ClassesService>(ClassesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated list with correct meta', async () => {
    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('should filter by homeroom_only (default: subject_id IS NULL)', async () => {
    await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(mockPrisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ subject_id: null }),
      }),
    );
  });

  it('should not filter by subject_id when homeroom_only is false', async () => {
    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, homeroom_only: false });

    const call = mockPrisma.class.findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> } | undefined;
    expect(call?.where).not.toHaveProperty('subject_id');
  });

  it('should filter by academic_year_id when provided', async () => {
    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, academic_year_id: ACADEMIC_YEAR_ID });

    expect(mockPrisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ academic_year_id: ACADEMIC_YEAR_ID }),
      }),
    );
  });

  it('should filter by status when provided', async () => {
    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, status: 'active' });

    expect(mockPrisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('should apply search filter on name', async () => {
    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, search: '10A' });

    expect(mockPrisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: expect.objectContaining({ contains: '10A' }),
        }),
      }),
    );
  });

  it('should apply correct skip for page 3 with pageSize 10', async () => {
    await service.findAll(TENANT_ID, { page: 3, pageSize: 10 });

    expect(mockPrisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20 }),
    );
  });
});

describe('ClassesService — findOne', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ClassesService>(ClassesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return class entity when found', async () => {
    mockPrisma.class.findFirst.mockResolvedValue({
      ...baseClass,
      academic_year: { id: ACADEMIC_YEAR_ID, name: '2025/2026' },
      year_group: null,
      subject: null,
      homeroom_teacher: null,
      class_staff: [],
      _count: { class_enrolments: 0, class_staff: 0 },
    });

    const result = await service.findOne(TENANT_ID, CLASS_ID);

    expect(result.id).toBe(CLASS_ID);
  });

  it('should throw NotFoundException when class not found', async () => {
    mockPrisma.class.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne(TENANT_ID, CLASS_ID),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ClassesService — update', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    mockRlsTx.class.update.mockReset().mockResolvedValue({ ...baseClass, name: 'Updated' });

    // assertExists calls findFirst
    mockPrisma.class.findFirst.mockResolvedValue(baseClass);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ClassesService>(ClassesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should update the class name', async () => {
    await service.update(TENANT_ID, CLASS_ID, { name: 'Updated Name' });

    expect(mockRlsTx.class.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CLASS_ID },
        data: expect.objectContaining({ name: 'Updated Name' }),
      }),
    );
  });

  it('should throw NotFoundException when year_group_id FK not found', async () => {
    mockPrisma.yearGroup.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, CLASS_ID, { year_group_id: 'nonexistent' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException on duplicate name (P2002)', async () => {
    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.0.0', meta: {} },
    );
    mockRlsTx.class.update.mockRejectedValue(p2002Error);

    await expect(
      service.update(TENANT_ID, CLASS_ID, { name: '10B' }),
    ).rejects.toThrow(ConflictException);
  });

  it('should invalidate preview cache after update', async () => {
    await service.update(TENANT_ID, CLASS_ID, { name: 'New Name' });

    expect(mockRedis._client.del).toHaveBeenCalledWith(`preview:class:${CLASS_ID}`);
  });

  it('should throw NotFoundException when class not found (assertExists)', async () => {
    mockPrisma.class.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, CLASS_ID, { name: 'New Name' }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('ClassesService — assignStaff', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    mockRlsTx.classStaff.create.mockReset().mockResolvedValue({
      class_id: CLASS_ID,
      staff_profile_id: 'staff-1',
      assignment_role: 'teacher',
    });

    mockPrisma.class.findFirst.mockResolvedValue(baseClass);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ClassesService>(ClassesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should assign staff to class', async () => {
    await service.assignStaff(TENANT_ID, CLASS_ID, {
      staff_profile_id: 'staff-1',
      assignment_role: 'teacher',
    });

    expect(mockRlsTx.classStaff.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          class_id: CLASS_ID,
          staff_profile_id: 'staff-1',
          assignment_role: 'teacher',
        }),
      }),
    );
  });

  it('should throw ConflictException when staff already assigned (P2002)', async () => {
    const p2002Error = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.0.0', meta: {} },
    );
    mockRlsTx.classStaff.create.mockRejectedValue(p2002Error);

    await expect(
      service.assignStaff(TENANT_ID, CLASS_ID, {
        staff_profile_id: 'staff-1',
        assignment_role: 'teacher',
      }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('ClassesService — removeStaff', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    mockRlsTx.classStaff.delete.mockReset().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ClassesService>(ClassesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should remove staff assignment', async () => {
    mockPrisma.classStaff.findFirst.mockResolvedValue({
      class_id: CLASS_ID,
      staff_profile_id: 'staff-1',
      assignment_role: 'teacher',
      tenant_id: TENANT_ID,
    });

    await service.removeStaff(TENANT_ID, CLASS_ID, 'staff-1', 'teacher');

    expect(mockRlsTx.classStaff.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          class_id_staff_profile_id_assignment_role: expect.objectContaining({
            class_id: CLASS_ID,
            staff_profile_id: 'staff-1',
            assignment_role: 'teacher',
          }),
        }),
      }),
    );
  });

  it('should throw NotFoundException when staff assignment not found', async () => {
    mockPrisma.classStaff.findFirst.mockResolvedValue(null);

    await expect(
      service.removeStaff(TENANT_ID, CLASS_ID, 'staff-1', 'teacher'),
    ).rejects.toThrow(NotFoundException);
  });
});
