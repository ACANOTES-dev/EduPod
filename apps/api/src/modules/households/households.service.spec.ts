import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SequenceService } from '../tenants/sequence.service';

import { HouseholdsService } from './households.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOUSEHOLD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONTACT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
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
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
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

const baseHousehold = {
  id: HOUSEHOLD_ID,
  tenant_id: TENANT_ID,
  household_name: 'Smith Family',
  household_number: 'HH-REF-001',
  primary_billing_parent_id: null,
  address_line_1: null,
  address_line_2: null,
  city: null,
  country: null,
  postal_code: null,
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

  beforeEach(async () => {
    mockRedis = buildMockRedis();
    mockSequence = buildMockSequence();

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
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a household with emergency contacts', async () => {
    const result = await service.create(TENANT_ID, baseCreateDto);

    expect(mockSequence.generateHouseholdReference).toHaveBeenCalledWith(TENANT_ID, mockRlsTx);
    expect(mockRlsTx.household.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          household_name: 'Smith Family',
          household_number: 'HH-REF-001',
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
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
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
});

// ─── Tests: findOne ───────────────────────────────────────────────────────────

describe('HouseholdsService — findOne', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
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
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
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
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
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

    await expect(
      service.addEmergencyContact(TENANT_ID, HOUSEHOLD_ID, contactDto),
    ).rejects.toThrow(BadRequestException);
  });

  it('should create emergency contact when under limit', async () => {
    mockRlsTx.household.findFirst.mockReset()
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
});

// ─── Tests: removeEmergencyContact ────────────────────────────────────────────

describe('HouseholdsService — removeEmergencyContact', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
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
    mockRlsTx.household.findFirst.mockReset()
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
});

// ─── Tests: unlinkParent ──────────────────────────────────────────────────────

describe('HouseholdsService — unlinkParent', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
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

    await expect(
      service.unlinkParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw NotFoundException when parent link does not exist', async () => {
    mockRlsTx.household.findFirst.mockReset().mockResolvedValue({
      ...baseHousehold,
      primary_billing_parent_id: null,
    });
    mockRlsTx.householdParent.findUnique.mockReset().mockResolvedValue(null);

    await expect(
      service.unlinkParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID),
    ).rejects.toThrow(NotFoundException);
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
});

// ─── Tests: setBillingParent ──────────────────────────────────────────────────

describe('HouseholdsService — setBillingParent', () => {
  let service: HouseholdsService;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HouseholdsService,
        { provide: PrismaService, useValue: buildMockPrisma() },
        { provide: RedisService, useValue: mockRedis },
        { provide: SequenceService, useValue: buildMockSequence() },
      ],
    }).compile();

    service = module.get<HouseholdsService>(HouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should set billing parent successfully', async () => {
    mockRlsTx.household.findFirst.mockReset()
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
    mockRlsTx.household.update.mockReset()
      .mockResolvedValueOnce({ ...baseHousehold, primary_billing_parent_id: PARENT_ID })
      .mockResolvedValueOnce({ ...baseHousehold, primary_billing_parent_id: PARENT_ID, needs_completion: false });

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

    await expect(
      service.setBillingParent(TENANT_ID, HOUSEHOLD_ID, PARENT_ID),
    ).rejects.toThrow(BadRequestException);
  });
});
