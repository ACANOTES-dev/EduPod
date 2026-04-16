import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SequenceService } from '../sequence/sequence.service';

import { HouseholdNumberService } from './household-number.service';
import { HouseholdsCrudService } from './households-crud.service';
import { HouseholdsRelationsService } from './households-relations.service';
import { HouseholdsStructuralService } from './households-structural.service';
import { HouseholdsService } from './households.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOUSEHOLD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONTACT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const SOURCE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const NEW_HOUSEHOLD_ID = '11111111-1111-1111-1111-111111111111';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  $queryRaw: jest.fn().mockResolvedValue([]),
  household: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  householdEmergencyContact: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  householdParent: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    delete: jest.fn(),
  },
  student: {
    updateMany: jest.fn(),
  },
  parent: {
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

function buildMockPrisma() {
  return {};
}

function buildMockRedis() {
  const client = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    setex: jest.fn().mockResolvedValue('OK'),
  };
  return { getClient: jest.fn().mockReturnValue(client), _client: client };
}

function buildMockSequence() {
  return { generateHouseholdReference: jest.fn().mockResolvedValue('HH-REF-001') };
}

function buildMockHouseholdNumber() {
  return {
    generateUniqueForTenant: jest.fn().mockResolvedValue('ABC123'),
    previewForTenant: jest.fn().mockResolvedValue('ABC123'),
    incrementStudentCounter: jest.fn().mockResolvedValue(1),
    generateStudentNumber: jest.fn().mockResolvedValue('ABC123-01'),
  };
}

function resetAllMockRlsTx() {
  Object.values(mockRlsTx).forEach((model) => {
    if (typeof model === 'function') {
      (model as jest.Mock).mockReset();
    } else {
      Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset());
    }
  });
  mockRlsTx.$queryRaw.mockResolvedValue([]);
}

const baseHousehold = {
  id: HOUSEHOLD_ID,
  tenant_id: TENANT_ID,
  household_name: 'Smith Family',
  household_number: 'HH-REF-001',
  primary_billing_parent_id: null as string | null,
  address_line_1: null as string | null,
  address_line_2: null as string | null,
  city: null as string | null,
  country: null as string | null,
  postal_code: null as string | null,
  needs_completion: true,
  status: 'active',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

const baseContact = {
  id: CONTACT_ID,
  tenant_id: TENANT_ID,
  household_id: HOUSEHOLD_ID,
  contact_name: 'Alice Smith',
  phone: '+353-1-555-0001',
  relationship_label: 'Mother',
  display_order: 1,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

const baseCreateDto = {
  household_name: 'Smith Family',
  emergency_contacts: [
    {
      contact_name: 'Alice Smith',
      phone: '+353-1-555-0001',
      relationship_label: 'Mother',
      display_order: 1,
    },
  ],
};

// ─── Tests: create ────────────────────────────────────────────────────────────

describe('HouseholdsService — create', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockSequence: ReturnType<typeof buildMockSequence>;
  let mockHouseholdNum: ReturnType<typeof buildMockHouseholdNumber>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();
    mockSequence = buildMockSequence();
    mockHouseholdNum = buildMockHouseholdNumber();

    mockRlsTx.household.create.mockReset().mockResolvedValue(baseHousehold);
    mockRlsTx.householdEmergencyContact.create.mockReset().mockResolvedValue(baseContact);
    mockRlsTx.household.update.mockReset().mockResolvedValue({
      ...baseHousehold,
      needs_completion: true,
      emergency_contacts: [baseContact],
      household_parents: [],
      billing_parent: null,
    });
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue({
      ...baseHousehold,
      _count: { emergency_contacts: 1 },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsCrudService,
        HouseholdsRelationsService,
        HouseholdsStructuralService,
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: mockSequence },
        { provide: HouseholdNumberService, useValue: mockHouseholdNum },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a household with emergency contacts', async () => {
    const result = await service.create(TENANT_ID, baseCreateDto);

    expect(mockHouseholdNum.generateUniqueForTenant).toHaveBeenCalledWith(mockRlsTx, TENANT_ID);
    expect(mockRlsTx.household.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          household_name: 'Smith Family',
          household_number: 'ABC123',
          status: 'active',
        }),
      }),
    );
    expect(mockRlsTx.householdEmergencyContact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          household_id: HOUSEHOLD_ID,
          contact_name: 'Alice Smith',
          phone: '+353-1-555-0001',
        }),
      }),
    );
    expect(result).toHaveProperty('id', HOUSEHOLD_ID);
  });

  it('should recalculate needs_completion after creating contacts', async () => {
    await service.create(TENANT_ID, baseCreateDto);

    // household.update is called to recalculate needs_completion
    expect(mockRlsTx.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: HOUSEHOLD_ID },
        data: expect.objectContaining({ needs_completion: expect.any(Boolean) }),
      }),
    );
  });

  it('should set needs_completion true when no billing parent', async () => {
    const result = await service.create(TENANT_ID, baseCreateDto);

    expect(mockRlsTx.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ needs_completion: true }),
      }),
    );
    expect(result).toHaveProperty('needs_completion', true);
  });

  it('should pass optional address fields through to create', async () => {
    const dtoWithAddress = {
      ...baseCreateDto,
      address_line1: '123 Main St',
      address_line2: 'Apt 4',
      city: 'Dublin',
      country: 'Ireland',
      postal_code: 'D01 AB12',
    };

    await service.create(TENANT_ID, dtoWithAddress);

    expect(mockRlsTx.household.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          address_line_1: '123 Main St',
          address_line_2: 'Apt 4',
          city: 'Dublin',
          country: 'Ireland',
          postal_code: 'D01 AB12',
        }),
      }),
    );
  });

  it('should create household with no emergency contacts and needs_completion true', async () => {
    mockRlsTx.household.update.mockReset().mockResolvedValue({
      ...baseHousehold,
      needs_completion: true,
      emergency_contacts: [],
      household_parents: [],
      billing_parent: null,
    });

    await service.create(TENANT_ID, {
      household_name: 'Empty Family',
      emergency_contacts: [],
    });

    // needs_completion should be true (no contacts AND no billing parent)
    expect(mockRlsTx.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ needs_completion: true }),
      }),
    );
    // No emergency contacts should be created
    expect(mockRlsTx.householdEmergencyContact.create).not.toHaveBeenCalled();
  });

  it('should create multiple emergency contacts', async () => {
    const dtoMultiContacts = {
      household_name: 'Doe Family',
      emergency_contacts: [
        {
          contact_name: 'Jane Doe',
          phone: '+1-555-0001',
          relationship_label: 'Mother',
          display_order: 1,
        },
        {
          contact_name: 'John Doe',
          phone: '+1-555-0002',
          relationship_label: 'Father',
          display_order: 2,
        },
      ],
    };

    await service.create(TENANT_ID, dtoMultiContacts);

    expect(mockRlsTx.householdEmergencyContact.create).toHaveBeenCalledTimes(2);
  });
});

// ─── Tests: findAll ───────────────────────────────────────────────────────────

describe('HouseholdsService — findAll', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();

    mockRlsTx.household.findMany.mockReset().mockResolvedValue([
      {
        ...baseHousehold,
        _count: { students: 2, emergency_contacts: 1 },
        billing_parent: null,
      },
    ]);
    mockRlsTx.household.count.mockReset().mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsCrudService,
        HouseholdsRelationsService,
        HouseholdsStructuralService,
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
        { provide: HouseholdNumberService, useValue: buildMockHouseholdNumber() },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated households with completion issues', async () => {
    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(result.data[0]).toHaveProperty('completion_issues');
    expect(result.data[0]?.completion_issues).toContain('missing_billing_parent');
  });

  it('should flag missing_emergency_contact when count is 0', async () => {
    mockRlsTx.household.findMany.mockResolvedValue([
      {
        ...baseHousehold,
        needs_completion: true,
        _count: { students: 0, emergency_contacts: 0 },
        billing_parent: null,
      },
    ]);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data[0]?.completion_issues).toContain('missing_emergency_contact');
  });

  it('should return empty completion_issues when household is complete', async () => {
    mockRlsTx.household.findMany.mockResolvedValue([
      {
        ...baseHousehold,
        needs_completion: false,
        primary_billing_parent_id: PARENT_ID,
        _count: { students: 1, emergency_contacts: 1 },
        billing_parent: { id: PARENT_ID, first_name: 'Alice', last_name: 'Smith' },
      },
    ]);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data[0]?.completion_issues).toHaveLength(0);
  });

  it('should pass status filter through to where clause', async () => {
    mockRlsTx.household.findMany.mockResolvedValue([]);
    mockRlsTx.household.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, status: 'archived' });

    expect(mockRlsTx.household.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'archived' }),
      }),
    );
  });

  it('should pass search filter through to where clause as insensitive contains', async () => {
    mockRlsTx.household.findMany.mockResolvedValue([]);
    mockRlsTx.household.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, search: 'Smith' });

    expect(mockRlsTx.household.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          household_name: { contains: 'Smith', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('should calculate correct skip offset for page 2', async () => {
    mockRlsTx.household.findMany.mockResolvedValue([]);
    mockRlsTx.household.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 2, pageSize: 10 });

    expect(mockRlsTx.household.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
  });

  it('should return student_count from _count.students', async () => {
    mockRlsTx.household.findMany.mockResolvedValue([
      {
        ...baseHousehold,
        needs_completion: false,
        _count: { students: 5, emergency_contacts: 2 },
        billing_parent: null,
      },
    ]);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data[0]?.student_count).toBe(5);
  });

  it('should return empty data when no households found', async () => {
    mockRlsTx.household.findMany.mockResolvedValue([]);
    mockRlsTx.household.count.mockResolvedValue(0);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
  });
});

// ─── Tests: findOne ───────────────────────────────────────────────────────────

describe('HouseholdsService — findOne', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsCrudService,
        HouseholdsRelationsService,
        HouseholdsStructuralService,
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
        { provide: HouseholdNumberService, useValue: buildMockHouseholdNumber() },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return household detail when found', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue({
      ...baseHousehold,
      billing_parent: null,
      emergency_contacts: [baseContact],
      household_parents: [],
      students: [],
    });

    const result = await service.findOne(TENANT_ID, HOUSEHOLD_ID);

    expect(result.id).toBe(HOUSEHOLD_ID);
    expect(result).toHaveProperty('completion_issues');
  });

  it('should throw NotFoundException if household not found', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, HOUSEHOLD_ID)).rejects.toThrow(NotFoundException);
  });

  it('should include both missing_billing_parent and missing_emergency_contact in completion_issues', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue({
      ...baseHousehold,
      needs_completion: true,
      primary_billing_parent_id: null,
      billing_parent: null,
      emergency_contacts: [],
      household_parents: [],
      students: [],
    });

    const result = await service.findOne(TENANT_ID, HOUSEHOLD_ID);

    expect(result.completion_issues).toContain('missing_billing_parent');
    expect(result.completion_issues).toContain('missing_emergency_contact');
  });

  it('should return empty completion_issues when needs_completion is false', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue({
      ...baseHousehold,
      needs_completion: false,
      primary_billing_parent_id: PARENT_ID,
      billing_parent: {
        id: PARENT_ID,
        first_name: 'Alice',
        last_name: 'Smith',
        email: null,
        phone: null,
        preferred_contact_channels: null,
        is_primary_contact: true,
        is_billing_contact: true,
      },
      emergency_contacts: [baseContact],
      household_parents: [],
      students: [{ id: 'student-1', first_name: 'Tom', last_name: 'Smith', status: 'active' }],
    });

    const result = await service.findOne(TENANT_ID, HOUSEHOLD_ID);

    expect(result.completion_issues).toHaveLength(0);
    expect(result.students).toHaveLength(1);
  });
});

// ─── Tests: update ────────────────────────────────────────────────────────────

describe('HouseholdsService — update', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();

    mockRlsTx.household.findFirst.mockReset().mockResolvedValue(baseHousehold);
    mockRlsTx.household.update.mockReset().mockResolvedValue({
      ...baseHousehold,
      household_name: 'Updated Family',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsCrudService,
        HouseholdsRelationsService,
        HouseholdsStructuralService,
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
        { provide: HouseholdNumberService, useValue: buildMockHouseholdNumber() },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should update household name', async () => {
    const result = await service.update(TENANT_ID, HOUSEHOLD_ID, {
      household_name: 'Updated Family',
    });

    expect(mockRlsTx.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: HOUSEHOLD_ID },
        data: expect.objectContaining({ household_name: 'Updated Family' }),
      }),
    );
    expect(result).toHaveProperty('household_name', 'Updated Family');
  });

  it('should invalidate preview cache after update', async () => {
    await service.update(TENANT_ID, HOUSEHOLD_ID, { household_name: 'Updated Family' });

    expect(mockRedis._client.del).toHaveBeenCalledWith(`preview:household:${HOUSEHOLD_ID}`);
  });

  it('should throw NotFoundException when household does not exist', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, HOUSEHOLD_ID, { household_name: 'Updated Family' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should include all address fields in update data when all provided', async () => {
    mockRlsTx.household.update.mockReset().mockResolvedValue({
      ...baseHousehold,
      household_name: 'Updated Family',
      address_line_1: '10 Main St',
      address_line_2: 'Suite B',
      city: 'Cork',
      country: 'IE',
      postal_code: 'T12 AB34',
    });

    await service.update(TENANT_ID, HOUSEHOLD_ID, {
      household_name: 'Updated Family',
      address_line1: '10 Main St',
      address_line2: 'Suite B',
      city: 'Cork',
      country: 'IE',
      postal_code: 'T12 AB34',
    });

    expect(mockRlsTx.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          household_name: 'Updated Family',
          address_line_1: '10 Main St',
          address_line_2: 'Suite B',
          city: 'Cork',
          country: 'IE',
          postal_code: 'T12 AB34',
        },
      }),
    );
  });

  it('should handle update with empty dto (no fields changed)', async () => {
    mockRlsTx.household.update.mockReset().mockResolvedValue(baseHousehold);

    await service.update(TENANT_ID, HOUSEHOLD_ID, {});

    expect(mockRlsTx.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {},
      }),
    );
  });

  it('should only include provided fields in update data', async () => {
    mockRlsTx.household.update.mockReset().mockResolvedValue({
      ...baseHousehold,
      city: 'Dublin',
    });

    await service.update(TENANT_ID, HOUSEHOLD_ID, { city: 'Dublin' });

    expect(mockRlsTx.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { city: 'Dublin' },
      }),
    );
  });
});

// ─── Tests: updateStatus ──────────────────────────────────────────────────────

describe('HouseholdsService — updateStatus', () => {
  let service: HouseholdsService;

  beforeEach(async () => {
    resetAllMockRlsTx();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsCrudService,
        HouseholdsRelationsService,
        HouseholdsStructuralService,
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: buildMockRedis() },
        { provide: SequenceService, useValue: buildMockSequence() },
        { provide: HouseholdNumberService, useValue: buildMockHouseholdNumber() },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should update household status to archived', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue(baseHousehold);
    mockRlsTx.household.update.mockResolvedValue({ ...baseHousehold, status: 'archived' });

    const result = await service.updateStatus(TENANT_ID, HOUSEHOLD_ID, 'archived');

    expect(mockRlsTx.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: HOUSEHOLD_ID },
        data: { status: 'archived' },
      }),
    );
    expect(result).toHaveProperty('status', 'archived');
  });

  it('should update household status to inactive', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue(baseHousehold);
    mockRlsTx.household.update.mockResolvedValue({ ...baseHousehold, status: 'inactive' });

    const result = await service.updateStatus(TENANT_ID, HOUSEHOLD_ID, 'inactive');

    expect(result).toHaveProperty('status', 'inactive');
  });

  it('should throw NotFoundException when household does not exist', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue(null);

    await expect(service.updateStatus(TENANT_ID, HOUSEHOLD_ID, 'archived')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw BadRequestException when transitioning from archived to active', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue({ ...baseHousehold, status: 'archived' });

    await expect(service.updateStatus(TENANT_ID, HOUSEHOLD_ID, 'active')).rejects.toThrow(
      BadRequestException,
    );
  });
});

// ─── Tests: addEmergencyContact ───────────────────────────────────────────────

describe('HouseholdsService — addEmergencyContact', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  const contactDto = {
    contact_name: 'Bob Jones',
    phone: '+353-1-555-0002',
    relationship_label: 'Uncle',
    display_order: 2 as const,
  };

  beforeEach(async () => {
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsCrudService,
        HouseholdsRelationsService,
        HouseholdsStructuralService,
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
        { provide: HouseholdNumberService, useValue: buildMockHouseholdNumber() },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw BadRequestException when adding 4th emergency contact', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue({
      ...baseHousehold,
      _count: { emergency_contacts: 3 },
    });

    await expect(service.addEmergencyContact(TENANT_ID, HOUSEHOLD_ID, contactDto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should create emergency contact when under limit', async () => {
    mockRlsTx.household.findFirst
      .mockReset()
      .mockResolvedValueOnce({
        ...baseHousehold,
        _count: { emergency_contacts: 1 },
      })
      .mockResolvedValueOnce({
        ...baseHousehold,
        primary_billing_parent_id: null,
        _count: { emergency_contacts: 2 },
      });
    mockRlsTx.householdEmergencyContact.create.mockReset().mockResolvedValue({
      ...baseContact,
      id: 'new-contact-id',
    });
    mockRlsTx.household.update.mockReset().mockResolvedValue(baseHousehold);

    const result = await service.addEmergencyContact(TENANT_ID, HOUSEHOLD_ID, contactDto);

    expect(mockRlsTx.householdEmergencyContact.create).toHaveBeenCalled();
    expect(result).toHaveProperty('id');
  });

  it('should throw NotFoundException when household not found', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue(null);

    await expect(service.addEmergencyContact(TENANT_ID, HOUSEHOLD_ID, contactDto)).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ─── Tests: updateEmergencyContact ──────────────────────────────────────────

describe('HouseholdsService — updateEmergencyContact', () => {
  let service: HouseholdsService;

  const contactDto = {
    contact_name: 'Updated Name',
    phone: '+353-1-555-9999',
    display_order: 1 as const,
  };

  beforeEach(async () => {
    resetAllMockRlsTx();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsCrudService,
        HouseholdsRelationsService,
        HouseholdsStructuralService,
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: buildMockRedis() },
        { provide: SequenceService, useValue: buildMockSequence() },
        { provide: HouseholdNumberService, useValue: buildMockHouseholdNumber() },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should update emergency contact when found', async () => {
    mockRlsTx.householdEmergencyContact.findFirst.mockResolvedValue(baseContact);
    mockRlsTx.householdEmergencyContact.update.mockResolvedValue({
      ...baseContact,
      contact_name: 'Updated Name',
      phone: '+353-1-555-9999',
    });

    const result = await service.updateEmergencyContact(
      TENANT_ID,
      HOUSEHOLD_ID,
      CONTACT_ID,
      contactDto,
    );

    expect(mockRlsTx.householdEmergencyContact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CONTACT_ID },
        data: expect.objectContaining({
          contact_name: 'Updated Name',
          phone: '+353-1-555-9999',
        }),
      }),
    );
    expect(result).toHaveProperty('contact_name', 'Updated Name');
  });

  it('should throw NotFoundException when contact not found', async () => {
    mockRlsTx.householdEmergencyContact.findFirst.mockResolvedValue(null);

    await expect(
      service.updateEmergencyContact(TENANT_ID, HOUSEHOLD_ID, CONTACT_ID, contactDto),
    ).rejects.toThrow(NotFoundException);
  });

  it('should preserve existing relationship_label when not provided in dto', async () => {
    mockRlsTx.householdEmergencyContact.findFirst.mockResolvedValue(baseContact);
    mockRlsTx.householdEmergencyContact.update.mockResolvedValue({
      ...baseContact,
      contact_name: 'Updated Name',
    });

    await service.updateEmergencyContact(TENANT_ID, HOUSEHOLD_ID, CONTACT_ID, contactDto);

    expect(mockRlsTx.householdEmergencyContact.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          relationship_label: 'Mother', // preserved from existing
        }),
      }),
    );
  });
});

// ─── Tests: removeEmergencyContact ────────────────────────────────────────────

describe('HouseholdsService — removeEmergencyContact', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsCrudService,
        HouseholdsRelationsService,
        HouseholdsStructuralService,
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
        { provide: HouseholdNumberService, useValue: buildMockHouseholdNumber() },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw BadRequestException when removing last emergency contact', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue({
      ...baseHousehold,
      _count: { emergency_contacts: 1 },
    });

    await expect(
      service.removeEmergencyContact(TENANT_ID, HOUSEHOLD_ID, CONTACT_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException when household not found on remove', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue(null);

    await expect(
      service.removeEmergencyContact(TENANT_ID, HOUSEHOLD_ID, CONTACT_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should delete contact when household has more than one', async () => {
    mockRlsTx.household.findFirst
      .mockReset()
      .mockResolvedValueOnce({
        ...baseHousehold,
        _count: { emergency_contacts: 2 },
      })
      .mockResolvedValueOnce({
        ...baseHousehold,
        primary_billing_parent_id: null,
        _count: { emergency_contacts: 1 },
      });
    mockRlsTx.householdEmergencyContact.findFirst.mockReset().mockResolvedValue(baseContact);
    mockRlsTx.householdEmergencyContact.delete.mockReset().mockResolvedValue(baseContact);
    mockRlsTx.household.update.mockReset().mockResolvedValue(baseHousehold);

    await service.removeEmergencyContact(TENANT_ID, HOUSEHOLD_ID, CONTACT_ID);

    expect(mockRlsTx.householdEmergencyContact.delete).toHaveBeenCalledWith({
      where: { id: CONTACT_ID },
    });
  });

  it('should throw NotFoundException when contact does not exist for removal', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue({
      ...baseHousehold,
      _count: { emergency_contacts: 2 },
    });
    mockRlsTx.householdEmergencyContact.findFirst.mockReset().mockResolvedValue(null);

    await expect(
      service.removeEmergencyContact(TENANT_ID, HOUSEHOLD_ID, CONTACT_ID),
    ).rejects.toThrow(NotFoundException);
  });
});

// ─── Tests: linkParent ───────────────────────────────────────────────────────

describe('HouseholdsService — linkParent', () => {
  let service: HouseholdsService;

  beforeEach(async () => {
    resetAllMockRlsTx();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsCrudService,
        HouseholdsRelationsService,
        HouseholdsStructuralService,
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: buildMockRedis() },
        { provide: SequenceService, useValue: buildMockSequence() },
        { provide: HouseholdNumberService, useValue: buildMockHouseholdNumber() },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should link parent to household successfully', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue(baseHousehold);
    mockRlsTx.parent.findFirst.mockResolvedValue({ id: PARENT_ID, tenant_id: TENANT_ID });
    const linkRecord = {
      tenant_id: TENANT_ID,
      household_id: HOUSEHOLD_ID,
      parent_id: PARENT_ID,
      role_label: 'Guardian',
    };
    mockRlsTx.householdParent.create.mockResolvedValue(linkRecord);

    const result = await service.linkParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID, 'Guardian');

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
    expect(result).toEqual(linkRecord);
  });

  it('should throw NotFoundException when household not found', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue(null);

    await expect(service.linkParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw NotFoundException when parent not found', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue(baseHousehold);
    mockRlsTx.parent.findFirst.mockResolvedValue(null);

    await expect(service.linkParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return existing link silently on P2002 unique constraint violation', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue(baseHousehold);
    mockRlsTx.parent.findFirst.mockResolvedValue({ id: PARENT_ID, tenant_id: TENANT_ID });

    const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.0.0',
    });
    mockRlsTx.householdParent.create.mockRejectedValue(p2002Error);

    const existingLink = {
      household_id: HOUSEHOLD_ID,
      parent_id: PARENT_ID,
      role_label: null,
      tenant_id: TENANT_ID,
    };
    mockRlsTx.householdParent.findUnique.mockResolvedValue(existingLink);

    const result = await service.linkParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID);

    expect(result).toEqual(existingLink);
  });

  it('should rethrow non-P2002 errors in linkParent', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue(baseHousehold);
    mockRlsTx.parent.findFirst.mockResolvedValue({ id: PARENT_ID, tenant_id: TENANT_ID });

    const genericError = new Error('Connection lost');
    mockRlsTx.householdParent.create.mockRejectedValue(genericError);

    await expect(service.linkParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID)).rejects.toThrow(
      'Connection lost',
    );
  });

  it('should set role_label to null when not provided', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue(baseHousehold);
    mockRlsTx.parent.findFirst.mockResolvedValue({ id: PARENT_ID, tenant_id: TENANT_ID });
    mockRlsTx.householdParent.create.mockResolvedValue({
      tenant_id: TENANT_ID,
      household_id: HOUSEHOLD_ID,
      parent_id: PARENT_ID,
      role_label: null,
    });

    await service.linkParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID);

    expect(mockRlsTx.householdParent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role_label: null }),
      }),
    );
  });
});

// ─── Tests: unlinkParent ──────────────────────────────────────────────────────

describe('HouseholdsService — unlinkParent', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsCrudService,
        HouseholdsRelationsService,
        HouseholdsStructuralService,
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
        { provide: HouseholdNumberService, useValue: buildMockHouseholdNumber() },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw BadRequestException when unlinking billing parent', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue({
      ...baseHousehold,
      primary_billing_parent_id: PARENT_ID,
    });

    await expect(service.unlinkParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw NotFoundException when parent link does not exist', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue({
      ...baseHousehold,
      primary_billing_parent_id: null,
    });
    mockRlsTx.householdParent.findUnique.mockReset().mockResolvedValue(null);

    await expect(service.unlinkParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should unlink parent when not billing parent', async () => {
    const OTHER_PARENT = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue({
      ...baseHousehold,
      primary_billing_parent_id: OTHER_PARENT,
    });
    mockRlsTx.householdParent.findUnique.mockReset().mockResolvedValue({
      household_id: HOUSEHOLD_ID,
      parent_id: PARENT_ID,
    });
    mockRlsTx.householdParent.delete.mockReset().mockResolvedValue({});

    await service.unlinkParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID);

    expect(mockRlsTx.householdParent.delete).toHaveBeenCalledWith({
      where: {
        household_id_parent_id: {
          household_id: HOUSEHOLD_ID,
          parent_id: PARENT_ID,
        },
      },
    });
  });

  it('should throw NotFoundException when household not found', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue(null);

    await expect(service.unlinkParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ─── Tests: setBillingParent ──────────────────────────────────────────────────

describe('HouseholdsService — setBillingParent', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsCrudService,
        HouseholdsRelationsService,
        HouseholdsStructuralService,
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
        { provide: HouseholdNumberService, useValue: buildMockHouseholdNumber() },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should set billing parent successfully', async () => {
    mockRlsTx.household.findFirst
      .mockReset()
      .mockResolvedValueOnce(baseHousehold)
      .mockResolvedValueOnce({
        ...baseHousehold,
        primary_billing_parent_id: PARENT_ID,
        _count: { emergency_contacts: 1 },
      });
    mockRlsTx.householdParent.findUnique.mockReset().mockResolvedValue({
      household_id: HOUSEHOLD_ID,
      parent_id: PARENT_ID,
    });
    mockRlsTx.household.update
      .mockReset()
      .mockResolvedValueOnce({ ...baseHousehold, primary_billing_parent_id: PARENT_ID })
      .mockResolvedValueOnce({
        ...baseHousehold,
        primary_billing_parent_id: PARENT_ID,
        needs_completion: false,
      });

    const result = await service.setBillingParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID);

    expect(mockRlsTx.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: HOUSEHOLD_ID },
        data: { primary_billing_parent_id: PARENT_ID },
      }),
    );
    expect(result).toHaveProperty('primary_billing_parent_id', PARENT_ID);
  });

  it('should throw BadRequestException when parent is not linked to household', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue(baseHousehold);
    mockRlsTx.householdParent.findUnique.mockReset().mockResolvedValue(null);

    await expect(service.setBillingParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw NotFoundException when household not found', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue(null);

    await expect(service.setBillingParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should trigger checkNeedsCompletion after setting billing parent', async () => {
    mockRlsTx.household.findFirst
      .mockReset()
      .mockResolvedValueOnce(baseHousehold)
      .mockResolvedValueOnce({
        ...baseHousehold,
        primary_billing_parent_id: PARENT_ID,
        _count: { emergency_contacts: 1 },
      });
    mockRlsTx.householdParent.findUnique.mockReset().mockResolvedValue({
      household_id: HOUSEHOLD_ID,
      parent_id: PARENT_ID,
    });
    mockRlsTx.household.update
      .mockReset()
      .mockResolvedValueOnce({ ...baseHousehold, primary_billing_parent_id: PARENT_ID })
      .mockResolvedValueOnce({ ...baseHousehold, needs_completion: false });

    await service.setBillingParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID);

    // Second update call is from checkNeedsCompletion
    expect(mockRlsTx.household.update).toHaveBeenCalledTimes(2);
  });
});

// ─── Tests: merge ─────────────────────────────────────────────────────────────

describe('HouseholdsService — merge', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  const sourceHousehold = {
    ...baseHousehold,
    id: SOURCE_ID,
    household_name: 'Source Family',
    status: 'active',
  };

  const targetHousehold = {
    ...baseHousehold,
    id: HOUSEHOLD_ID,
    household_name: 'Target Family',
    status: 'active',
  };

  beforeEach(async () => {
    resetAllMockRlsTx();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsCrudService,
        HouseholdsRelationsService,
        HouseholdsStructuralService,
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
        { provide: HouseholdNumberService, useValue: buildMockHouseholdNumber() },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw BadRequestException when source and target are the same', async () => {
    await expect(
      service.merge(TENANT_ID, {
        source_household_id: HOUSEHOLD_ID,
        target_household_id: HOUSEHOLD_ID,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException when source household not found', async () => {
    mockRlsTx.household.findFirst
      .mockResolvedValueOnce(null) // source
      .mockResolvedValueOnce(targetHousehold); // target

    await expect(
      service.merge(TENANT_ID, {
        source_household_id: SOURCE_ID,
        target_household_id: HOUSEHOLD_ID,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when target household not found', async () => {
    mockRlsTx.household.findFirst
      .mockResolvedValueOnce(sourceHousehold) // source
      .mockResolvedValueOnce(null); // target

    await expect(
      service.merge(TENANT_ID, {
        source_household_id: SOURCE_ID,
        target_household_id: HOUSEHOLD_ID,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when source household is archived', async () => {
    mockRlsTx.household.findFirst
      .mockResolvedValueOnce({ ...sourceHousehold, status: 'archived' })
      .mockResolvedValueOnce(targetHousehold);

    await expect(
      service.merge(TENANT_ID, {
        source_household_id: SOURCE_ID,
        target_household_id: HOUSEHOLD_ID,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when target household is archived', async () => {
    mockRlsTx.household.findFirst
      .mockResolvedValueOnce(sourceHousehold)
      .mockResolvedValueOnce({ ...targetHousehold, status: 'archived' });

    await expect(
      service.merge(TENANT_ID, {
        source_household_id: SOURCE_ID,
        target_household_id: HOUSEHOLD_ID,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should move students, parents, contacts, and archive source on merge', async () => {
    // findFirst: source, target, then for checkNeedsCompletion
    mockRlsTx.household.findFirst
      .mockResolvedValueOnce(sourceHousehold)
      .mockResolvedValueOnce(targetHousehold)
      .mockResolvedValueOnce({
        ...targetHousehold,
        primary_billing_parent_id: null,
        _count: { emergency_contacts: 1 },
      })
      .mockResolvedValueOnce(targetHousehold); // final return
    mockRlsTx.student.updateMany.mockResolvedValue({ count: 2 });
    mockRlsTx.householdParent.findMany
      .mockResolvedValueOnce([{ parent_id: PARENT_ID, role_label: 'Father' }]) // source parents
      .mockResolvedValueOnce([]); // target parents
    mockRlsTx.householdParent.create.mockResolvedValue({});
    mockRlsTx.householdEmergencyContact.count.mockResolvedValue(1);
    mockRlsTx.householdEmergencyContact.findMany.mockResolvedValue([
      { ...baseContact, household_id: SOURCE_ID },
    ]);
    mockRlsTx.householdEmergencyContact.create.mockResolvedValue({});
    mockRlsTx.household.update
      .mockResolvedValueOnce({ ...sourceHousehold, status: 'archived' })
      .mockResolvedValueOnce({ ...targetHousehold, needs_completion: true });

    await service.merge(TENANT_ID, {
      source_household_id: SOURCE_ID,
      target_household_id: HOUSEHOLD_ID,
    });

    // Students moved
    expect(mockRlsTx.student.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ household_id: SOURCE_ID }),
        data: { household_id: HOUSEHOLD_ID },
      }),
    );

    // Source archived
    expect(mockRlsTx.household.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: SOURCE_ID },
        data: { status: 'archived' },
      }),
    );

    // Preview cache invalidated for both
    expect(mockRedis._client.del).toHaveBeenCalledWith(`preview:household:${SOURCE_ID}`);
    expect(mockRedis._client.del).toHaveBeenCalledWith(`preview:household:${HOUSEHOLD_ID}`);
  });

  it('should skip duplicate parent links during merge', async () => {
    mockRlsTx.household.findFirst
      .mockResolvedValueOnce(sourceHousehold)
      .mockResolvedValueOnce(targetHousehold)
      .mockResolvedValueOnce({
        ...targetHousehold,
        primary_billing_parent_id: null,
        _count: { emergency_contacts: 1 },
      })
      .mockResolvedValueOnce(targetHousehold);
    mockRlsTx.student.updateMany.mockResolvedValue({ count: 0 });
    // Both source and target have the same parent
    mockRlsTx.householdParent.findMany
      .mockResolvedValueOnce([{ parent_id: PARENT_ID, role_label: 'Father' }])
      .mockResolvedValueOnce([{ parent_id: PARENT_ID }]);
    mockRlsTx.householdEmergencyContact.count.mockResolvedValue(3); // target at limit
    mockRlsTx.household.update
      .mockResolvedValueOnce({ ...sourceHousehold, status: 'archived' })
      .mockResolvedValueOnce(targetHousehold);

    await service.merge(TENANT_ID, {
      source_household_id: SOURCE_ID,
      target_household_id: HOUSEHOLD_ID,
    });

    // householdParent.create should NOT be called because parent already exists in target
    expect(mockRlsTx.householdParent.create).not.toHaveBeenCalled();
  });

  it('edge: should not move contacts when target already has 3', async () => {
    mockRlsTx.household.findFirst
      .mockResolvedValueOnce(sourceHousehold)
      .mockResolvedValueOnce(targetHousehold)
      .mockResolvedValueOnce({
        ...targetHousehold,
        primary_billing_parent_id: null,
        _count: { emergency_contacts: 3 },
      })
      .mockResolvedValueOnce(targetHousehold);
    mockRlsTx.student.updateMany.mockResolvedValue({ count: 0 });
    mockRlsTx.householdParent.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mockRlsTx.householdEmergencyContact.count.mockResolvedValue(3); // target at limit
    mockRlsTx.household.update
      .mockResolvedValueOnce({ ...sourceHousehold, status: 'archived' })
      .mockResolvedValueOnce(targetHousehold);

    await service.merge(TENANT_ID, {
      source_household_id: SOURCE_ID,
      target_household_id: HOUSEHOLD_ID,
    });

    // findMany for source contacts should NOT be called because target is at limit
    expect(mockRlsTx.householdEmergencyContact.findMany).not.toHaveBeenCalled();
  });
});

// ─── Tests: split ─────────────────────────────────────────────────────────────

describe('HouseholdsService — split', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    resetAllMockRlsTx();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsCrudService,
        HouseholdsRelationsService,
        HouseholdsStructuralService,
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
        { provide: HouseholdNumberService, useValue: buildMockHouseholdNumber() },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when source household not found', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue(null);

    await expect(
      service.split(TENANT_ID, {
        source_household_id: SOURCE_ID,
        new_household_name: 'New Family',
        student_ids: [],
        parent_ids: [],
        emergency_contacts: [{ contact_name: 'Jane', phone: '+1-555-0001', display_order: 1 }],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when source household is archived', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue({
      ...baseHousehold,
      id: SOURCE_ID,
      status: 'archived',
    });

    await expect(
      service.split(TENANT_ID, {
        source_household_id: SOURCE_ID,
        new_household_name: 'New Family',
        student_ids: [],
        parent_ids: [],
        emergency_contacts: [{ contact_name: 'Jane', phone: '+1-555-0001', display_order: 1 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should create new household, move students and parents on split', async () => {
    const sourceHH = { ...baseHousehold, id: SOURCE_ID, status: 'active' };
    const newHH = {
      ...baseHousehold,
      id: NEW_HOUSEHOLD_ID,
      household_name: 'New Family',
      status: 'active',
      needs_completion: true,
    };

    // findFirst: source (for lock check), source, then for checkNeedsCompletion, then final return
    mockRlsTx.household.findFirst
      .mockResolvedValueOnce(sourceHH)
      .mockResolvedValueOnce({
        ...newHH,
        primary_billing_parent_id: null,
        _count: { emergency_contacts: 1 },
      })
      .mockResolvedValueOnce({
        ...newHH,
        emergency_contacts: [{ ...baseContact, household_id: NEW_HOUSEHOLD_ID }],
        household_parents: [],
        students: [],
      });
    mockRlsTx.household.create.mockResolvedValue(newHH);
    mockRlsTx.householdEmergencyContact.create.mockResolvedValue({
      ...baseContact,
      household_id: NEW_HOUSEHOLD_ID,
    });
    mockRlsTx.student.updateMany.mockResolvedValue({ count: 1 });
    mockRlsTx.householdParent.findMany.mockResolvedValue([{ parent_id: PARENT_ID }]);
    mockRlsTx.householdParent.create.mockResolvedValue({});
    mockRlsTx.household.update.mockResolvedValue({ ...newHH, needs_completion: true });

    const studentId = 'student-uuid-1';
    const result = await service.split(TENANT_ID, {
      source_household_id: SOURCE_ID,
      new_household_name: 'New Family',
      student_ids: [studentId],
      parent_ids: [PARENT_ID],
      emergency_contacts: [{ contact_name: 'Jane', phone: '+1-555-0001', display_order: 1 }],
    });

    // New household created
    expect(mockRlsTx.household.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          household_name: 'New Family',
          status: 'active',
        }),
      }),
    );

    // Students moved
    expect(mockRlsTx.student.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: [studentId] },
          household_id: SOURCE_ID,
        }),
        data: { household_id: NEW_HOUSEHOLD_ID },
      }),
    );

    // Parent linked
    expect(mockRlsTx.householdParent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          household_id: NEW_HOUSEHOLD_ID,
          parent_id: PARENT_ID,
        }),
      }),
    );

    // Invalidate both caches
    expect(mockRedis._client.del).toHaveBeenCalledWith(`preview:household:${SOURCE_ID}`);

    expect(result).toBeDefined();
  });

  it('should silently skip P2002 duplicate when linking parent during split', async () => {
    const sourceHH = { ...baseHousehold, id: SOURCE_ID, status: 'active' };
    const newHH = {
      ...baseHousehold,
      id: NEW_HOUSEHOLD_ID,
      household_name: 'New Family',
      status: 'active',
      needs_completion: true,
    };

    mockRlsTx.household.findFirst
      .mockResolvedValueOnce(sourceHH)
      .mockResolvedValueOnce({
        ...newHH,
        primary_billing_parent_id: null,
        _count: { emergency_contacts: 1 },
      })
      .mockResolvedValueOnce({
        ...newHH,
        emergency_contacts: [],
        household_parents: [],
        students: [],
      });
    mockRlsTx.household.create.mockResolvedValue(newHH);
    mockRlsTx.householdEmergencyContact.create.mockResolvedValue({});
    mockRlsTx.householdParent.findMany.mockResolvedValue([{ parent_id: PARENT_ID }]);
    mockRlsTx.household.update.mockResolvedValue({ ...newHH, needs_completion: true });

    // Simulate P2002 unique constraint violation when linking parent
    const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.0.0',
    });
    mockRlsTx.householdParent.create.mockRejectedValue(p2002Error);

    // Should not throw — P2002 is silently caught during split
    const result = await service.split(TENANT_ID, {
      source_household_id: SOURCE_ID,
      new_household_name: 'New Family',
      student_ids: [],
      parent_ids: [PARENT_ID],
      emergency_contacts: [{ contact_name: 'Jane', phone: '+1-555-0001', display_order: 1 }],
    });

    expect(result).toBeDefined();
  });

  it('should rethrow non-P2002 errors when linking parent during split', async () => {
    const sourceHH = { ...baseHousehold, id: SOURCE_ID, status: 'active' };
    const newHH = {
      ...baseHousehold,
      id: NEW_HOUSEHOLD_ID,
      household_name: 'New Family',
      status: 'active',
    };

    mockRlsTx.household.findFirst.mockResolvedValueOnce(sourceHH);
    mockRlsTx.household.create.mockResolvedValue(newHH);
    mockRlsTx.householdEmergencyContact.create.mockResolvedValue({});
    mockRlsTx.householdParent.findMany.mockResolvedValue([{ parent_id: PARENT_ID }]);

    const genericError = new Error('Some other database error');
    mockRlsTx.householdParent.create.mockRejectedValue(genericError);

    await expect(
      service.split(TENANT_ID, {
        source_household_id: SOURCE_ID,
        new_household_name: 'New Family',
        student_ids: [],
        parent_ids: [PARENT_ID],
        emergency_contacts: [{ contact_name: 'Jane', phone: '+1-555-0001', display_order: 1 }],
      }),
    ).rejects.toThrow('Some other database error');
  });

  it('should not move students when student_ids is empty', async () => {
    const sourceHH = { ...baseHousehold, id: SOURCE_ID, status: 'active' };
    const newHH = {
      ...baseHousehold,
      id: NEW_HOUSEHOLD_ID,
      household_name: 'New Family',
      status: 'active',
    };

    mockRlsTx.household.findFirst
      .mockResolvedValueOnce(sourceHH)
      .mockResolvedValueOnce({
        ...newHH,
        primary_billing_parent_id: null,
        _count: { emergency_contacts: 1 },
      })
      .mockResolvedValueOnce({
        ...newHH,
        emergency_contacts: [],
        household_parents: [],
        students: [],
      });
    mockRlsTx.household.create.mockResolvedValue(newHH);
    mockRlsTx.householdEmergencyContact.create.mockResolvedValue({});
    mockRlsTx.household.update.mockResolvedValue(newHH);

    await service.split(TENANT_ID, {
      source_household_id: SOURCE_ID,
      new_household_name: 'New Family',
      student_ids: [],
      parent_ids: [],
      emergency_contacts: [{ contact_name: 'Jane', phone: '+1-555-0001', display_order: 1 }],
    });

    // student.updateMany should NOT be called when no students to move
    expect(mockRlsTx.student.updateMany).not.toHaveBeenCalled();
  });
});

// ─── Tests: preview ──────────────────────────────────────────────────────────

describe('HouseholdsService — preview', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    resetAllMockRlsTx();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsCrudService,
        HouseholdsRelationsService,
        HouseholdsStructuralService,
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
        { provide: HouseholdNumberService, useValue: buildMockHouseholdNumber() },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return cached preview when available', async () => {
    const cached = {
      id: HOUSEHOLD_ID,
      entity_type: 'household',
      primary_label: 'Smith Family',
      secondary_label: 'No billing parent',
      status: 'active',
      facts: [],
    };
    mockRedis._client.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.preview(TENANT_ID, HOUSEHOLD_ID);

    expect(result).toEqual(cached);
    // Should NOT query the database
    expect(mockRlsTx.household.findFirst).not.toHaveBeenCalled();
  });

  it('should query DB and cache result when no cache exists', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue({
      id: HOUSEHOLD_ID,
      household_name: 'Smith Family',
      status: 'active',
      billing_parent: { first_name: 'Alice', last_name: 'Smith' },
      _count: { students: 2, household_parents: 1, emergency_contacts: 1 },
    });

    const result = await service.preview(TENANT_ID, HOUSEHOLD_ID);

    expect(result).toEqual({
      id: HOUSEHOLD_ID,
      entity_type: 'household',
      primary_label: 'Smith Family',
      secondary_label: 'Alice Smith',
      status: 'active',
      facts: [
        { label: 'Students', value: '2' },
        { label: 'Parents', value: '1' },
        { label: 'Emergency contacts', value: '1/3' },
      ],
    });

    // Should cache with 30s TTL
    expect(mockRedis._client.setex).toHaveBeenCalledWith(
      `preview:household:${HOUSEHOLD_ID}`,
      30,
      expect.any(String),
    );
  });

  it('should return "No billing parent" when billing_parent is null', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue({
      id: HOUSEHOLD_ID,
      household_name: 'Jones Family',
      status: 'active',
      billing_parent: null,
      _count: { students: 0, household_parents: 0, emergency_contacts: 0 },
    });

    const result = await service.preview(TENANT_ID, HOUSEHOLD_ID);

    expect(result).toHaveProperty('secondary_label', 'No billing parent');
  });

  it('should throw NotFoundException when household not found', async () => {
    mockRlsTx.household.findFirst.mockResolvedValue(null);

    await expect(service.preview(TENANT_ID, HOUSEHOLD_ID)).rejects.toThrow(NotFoundException);
  });
});
