import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { buildMockPrisma, buildMockRedis } from '../../../test/mock-factories';
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
    findFirst: jest.fn(),
  },
  classStaff: {
    create: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
  },
  room: {
    findFirst: jest.fn(),
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

const createMockPrisma = () =>
  buildMockPrisma({
    academicYear: ['findFirst'],
    class: ['findFirst', 'findMany', 'count'],
    classStaff: ['findFirst'],
    staffProfile: ['findFirst'],
    subject: ['findFirst'],
    yearGroup: ['findFirst'],
  } as const);

const createMockRedis = () => buildMockRedis();

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
  year_group_id: 'yg-1',
  max_capacity: 30,
  class_type: 'floating' as const,
  status: 'active' as const,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ClassesService — create', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();

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

    await expect(service.create(TENANT_ID, baseCreateDto)).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException on duplicate class name (P2002)', async () => {
    const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
      meta: {},
    });
    mockRlsTx.class.create.mockRejectedValue(p2002Error);

    await expect(service.create(TENANT_ID, baseCreateDto)).rejects.toThrow(ConflictException);
  });
});

describe('ClassesService — findAll', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();

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

    const call = mockPrisma.class.findMany.mock.calls[0]?.[0] as
      | { where: Record<string, unknown> }
      | undefined;
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

    expect(mockPrisma.class.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20 }));
  });
});

describe('ClassesService — findOne', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();

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

    await expect(service.findOne(TENANT_ID, CLASS_ID)).rejects.toThrow(NotFoundException);
  });
});

describe('ClassesService — update', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();

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
    const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
      meta: {},
    });
    mockRlsTx.class.update.mockRejectedValue(p2002Error);

    await expect(service.update(TENANT_ID, CLASS_ID, { name: '10B' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('should invalidate preview cache after update', async () => {
    await service.update(TENANT_ID, CLASS_ID, { name: 'New Name' });

    expect(mockRedis._client.del).toHaveBeenCalledWith(`preview:class:${CLASS_ID}`);
  });

  it('should throw NotFoundException when class not found (assertExists)', async () => {
    mockPrisma.class.findFirst.mockResolvedValue(null);

    await expect(service.update(TENANT_ID, CLASS_ID, { name: 'New Name' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('ClassesService — assignStaff', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();

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
    const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
      meta: {},
    });
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
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();

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

    await expect(service.removeStaff(TENANT_ID, CLASS_ID, 'staff-1', 'teacher')).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ─── updateStatus ────────────────────────────────────────────────────────────

describe('ClassesService — updateStatus', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockRedis: ReturnType<typeof createMockRedis>;
  let mockSchedulesService: { endDateForClass: jest.Mock };

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();
    mockSchedulesService = { endDateForClass: jest.fn().mockResolvedValue(undefined) };

    mockRlsTx.class.update.mockReset().mockResolvedValue({ ...baseClass, status: 'inactive' });

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
    service.setSchedulesService(mockSchedulesService as never);
  });

  afterEach(() => jest.clearAllMocks());

  it('should update status to inactive', async () => {
    await service.updateStatus(TENANT_ID, CLASS_ID, { status: 'inactive' });

    expect(mockRlsTx.class.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CLASS_ID },
        data: { status: 'inactive' },
      }),
    );
  });

  it('should call schedulesService.endDateForClass when setting inactive', async () => {
    await service.updateStatus(TENANT_ID, CLASS_ID, { status: 'inactive' });

    expect(mockSchedulesService.endDateForClass).toHaveBeenCalledWith(TENANT_ID, CLASS_ID);
  });

  it('should NOT call schedulesService.endDateForClass when setting active', async () => {
    mockRlsTx.class.update.mockResolvedValue({ ...baseClass, status: 'active' });

    await service.updateStatus(TENANT_ID, CLASS_ID, { status: 'active' });

    expect(mockSchedulesService.endDateForClass).not.toHaveBeenCalled();
  });

  it('should invalidate preview cache after status change', async () => {
    await service.updateStatus(TENANT_ID, CLASS_ID, { status: 'inactive' });

    expect(mockRedis._client.del).toHaveBeenCalledWith(`preview:class:${CLASS_ID}`);
  });

  it('should throw NotFoundException when class not found', async () => {
    mockPrisma.class.findFirst.mockResolvedValue(null);

    await expect(service.updateStatus(TENANT_ID, CLASS_ID, { status: 'inactive' })).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ─── findStaff ───────────────────────────────────────────────────────────────

describe('ClassesService — findStaff', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();

    mockRlsTx.classStaff.findMany.mockReset().mockResolvedValue([
      {
        class_id: CLASS_ID,
        staff_profile_id: 'staff-1',
        assignment_role: 'teacher',
        staff_profile: {
          id: 'staff-1',
          user: { first_name: 'Jane', last_name: 'Doe' },
        },
      },
    ]);

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

  it('should return mapped staff list for a class', async () => {
    const result = await service.findStaff(TENANT_ID, CLASS_ID);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        role: 'teacher',
        staff_profile: expect.objectContaining({
          id: 'staff-1',
          user: expect.objectContaining({ first_name: 'Jane' }),
        }),
      }),
    );
  });

  it('should compose a synthetic id from class_id, staff_profile_id, and role', async () => {
    const result = await service.findStaff(TENANT_ID, CLASS_ID);

    expect(result.data[0]?.id).toBe(`${CLASS_ID}_staff-1_teacher`);
  });

  it('should return empty data array when class has no staff', async () => {
    mockRlsTx.classStaff.findMany.mockResolvedValue([]);

    const result = await service.findStaff(TENANT_ID, CLASS_ID);

    expect(result.data).toHaveLength(0);
  });

  it('should throw NotFoundException when class not found', async () => {
    mockPrisma.class.findFirst.mockResolvedValue(null);

    await expect(service.findStaff(TENANT_ID, CLASS_ID)).rejects.toThrow(NotFoundException);
  });
});

// ─── preview ─────────────────────────────────────────────────────────────────

describe('ClassesService — preview', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockRedis: ReturnType<typeof createMockRedis>;

  const classPreviewEntity = {
    id: CLASS_ID,
    name: '10A',
    status: 'active',
    academic_year: { name: '2025/2026' },
    year_group: { name: 'Year 10' },
    subject: null,
    homeroom_teacher: {
      user: { first_name: 'Jane', last_name: 'Doe' },
    },
    _count: { class_enrolments: 12 },
  };

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();

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

  it('should return cached preview data on cache hit', async () => {
    const cachedData = {
      id: CLASS_ID,
      entity_type: 'class',
      primary_label: '10A',
      secondary_label: '2025/2026 · Year 10',
      status: 'active',
      facts: [{ label: 'Students', value: '12' }],
    };
    mockRedis._client.get.mockResolvedValue(JSON.stringify(cachedData));

    const result = await service.preview(TENANT_ID, CLASS_ID);

    expect(result).toEqual(cachedData);
    // Should NOT query the database on cache hit
    expect(mockPrisma.class.findFirst).not.toHaveBeenCalled();
  });

  it('should build preview from DB on cache miss and cache it', async () => {
    mockRedis._client.get.mockResolvedValue(null);
    mockPrisma.class.findFirst.mockResolvedValue(classPreviewEntity);

    const result = await service.preview(TENANT_ID, CLASS_ID);

    expect(result.entity_type).toBe('class');
    expect(result.primary_label).toBe('10A');
    expect(result.secondary_label).toBe('2025/2026 · Year 10');
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Students', value: '12' }),
        expect.objectContaining({ label: 'Teacher', value: 'Jane Doe' }),
      ]),
    );
    expect(mockRedis._client.set).toHaveBeenCalledWith(
      `preview:class:${CLASS_ID}`,
      expect.any(String),
      'EX',
      30,
    );
  });

  it('should include subject fact when class has a subject', async () => {
    mockRedis._client.get.mockResolvedValue(null);
    mockPrisma.class.findFirst.mockResolvedValue({
      ...classPreviewEntity,
      subject: { name: 'Mathematics' },
    });

    const result = await service.preview(TENANT_ID, CLASS_ID);

    expect(result.facts).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: 'Subject', value: 'Mathematics' })]),
    );
  });

  it('should omit year_group from secondary_label when null', async () => {
    mockRedis._client.get.mockResolvedValue(null);
    mockPrisma.class.findFirst.mockResolvedValue({
      ...classPreviewEntity,
      year_group: null,
    });

    const result = await service.preview(TENANT_ID, CLASS_ID);

    expect(result.secondary_label).toBe('2025/2026');
  });

  it('should throw NotFoundException when class not found on cache miss', async () => {
    mockRedis._client.get.mockResolvedValue(null);
    mockPrisma.class.findFirst.mockResolvedValue(null);

    await expect(service.preview(TENANT_ID, CLASS_ID)).rejects.toThrow(NotFoundException);
  });
});

// ─── create room validation ──────────────────────────────────────────────────

describe('ClassesService — create (room validation)', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();

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

  it('should throw NotFoundException when homeroom_id room not found', async () => {
    mockRlsTx.room.findFirst.mockResolvedValue(null);

    const dtoWithRoom = {
      ...baseCreateDto,
      homeroom_id: 'room-nonexistent',
    } as Record<string, unknown>;

    await expect(service.create(TENANT_ID, dtoWithRoom as typeof baseCreateDto)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw BadRequestException when class size exceeds room capacity', async () => {
    mockRlsTx.room.findFirst.mockResolvedValue({ id: 'room-1', name: 'Room A', capacity: 20 });
    // No existing class occupying this room
    mockRlsTx.class.findFirst.mockResolvedValue(null);

    const dtoWithRoom = {
      ...baseCreateDto,
      homeroom_id: 'room-1',
      max_capacity: 25,
    } as Record<string, unknown>;

    await expect(service.create(TENANT_ID, dtoWithRoom as typeof baseCreateDto)).rejects.toThrow(
      BadRequestException,
    );
  });
});

// ─── update FK validation ────────────────────────────────────────────────────

describe('ClassesService — update (FK validation)', () => {
  let service: ClassesService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockRedis: ReturnType<typeof createMockRedis>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockRedis = createMockRedis();

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

  it('should throw NotFoundException when subject_id FK not found', async () => {
    mockPrisma.subject.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, CLASS_ID, { subject_id: 'nonexistent-subject' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when homeroom_teacher_staff_id FK not found', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, CLASS_ID, { homeroom_teacher_staff_id: 'nonexistent-staff' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should allow update when subject_id FK exists', async () => {
    mockPrisma.subject.findFirst.mockResolvedValue({ id: 'subject-1' });

    await service.update(TENANT_ID, CLASS_ID, { subject_id: 'subject-1' });

    expect(mockRlsTx.class.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subject: { connect: { id: 'subject-1' } },
        }),
      }),
    );
  });

  it('should allow update when homeroom_teacher_staff_id FK exists', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: 'staff-1' });

    await service.update(TENANT_ID, CLASS_ID, { homeroom_teacher_staff_id: 'staff-1' });

    expect(mockRlsTx.class.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          homeroom_teacher: { connect: { id: 'staff-1' } },
        }),
      }),
    );
  });

  it('should disconnect subject when subject_id is explicitly null', async () => {
    await service.update(TENANT_ID, CLASS_ID, { subject_id: null } as never);

    expect(mockRlsTx.class.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subject: { disconnect: true },
        }),
      }),
    );
  });
});
