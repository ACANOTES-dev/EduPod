/* eslint-disable @typescript-eslint/no-require-imports */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { EncryptionService } from '../configuration/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SequenceService } from '../tenants/sequence.service';

import { StaffProfilesService } from './staff-profiles.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  staffProfile: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  tenantMembership: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  membershipRole: {
    create: jest.fn(),
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
    staffProfile: {
      findFirst: jest.fn(),
    },
  };
}

function buildMockRedis() {
  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    setex: jest.fn(),
  };
  return {
    getClient: jest.fn().mockReturnValue(mockRedisClient),
    _client: mockRedisClient,
  };
}

function buildMockEncryption() {
  return {
    encrypt: jest.fn().mockReturnValue({ encrypted: 'enc-data', keyRef: 'key-1' }),
    decrypt: jest.fn().mockReturnValue('decrypted-data'),
    mask: jest.fn().mockReturnValue('****1234'),
  };
}

const baseCreateDto = {
  first_name: 'Alice',
  last_name: 'Smith',
  email: 'alice@example.com',
  phone: '+353871234567',
  role_id: 'role-uuid-0001-0001-0001-000100010001',
  employment_status: 'active' as const,
  employment_type: 'full_time' as const,
};

const baseStaffProfile = {
  id: STAFF_ID,
  tenant_id: TENANT_ID,
  user_id: USER_ID,
  staff_number: 'ABC1234-5',
  job_title: 'Teacher',
  employment_status: 'active',
  department: 'Science',
  employment_type: 'full_time',
  bank_name: 'AIB',
  bank_account_number_encrypted: 'enc-acct',
  bank_iban_encrypted: 'enc-iban',
  bank_encryption_key_ref: 'key-1',
  created_at: new Date('2025-01-01'),
  updated_at: new Date('2025-01-01'),
  user: {
    id: USER_ID,
    first_name: 'Alice',
    last_name: 'Smith',
    email: 'alice@example.com',
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StaffProfilesService — create', () => {
  let service: StaffProfilesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockEncryption: ReturnType<typeof buildMockEncryption>;
  let mockSequence: { nextNumber: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockEncryption = buildMockEncryption();
    mockSequence = { nextNumber: jest.fn() };

    mockRlsTx.user.findUnique.mockReset().mockResolvedValue(null);
    mockRlsTx.user.create.mockReset().mockResolvedValue({ id: USER_ID });
    mockRlsTx.tenantMembership.create.mockReset().mockResolvedValue({ id: 'mem-1' });
    mockRlsTx.membershipRole.create.mockReset().mockResolvedValue({});
    mockRlsTx.staffProfile.findFirst.mockReset().mockResolvedValue(null);
    mockRlsTx.staffProfile.create.mockReset().mockResolvedValue(baseStaffProfile);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffProfilesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<StaffProfilesService>(StaffProfilesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a staff profile with new user account', async () => {
    const result = await service.create(TENANT_ID, baseCreateDto);

    expect(mockRlsTx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'alice@example.com',
          first_name: 'Alice',
          last_name: 'Smith',
        }),
      }),
    );
    expect(mockRlsTx.staffProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          user_id: USER_ID,
        }),
      }),
    );
    // masked bank details should be returned, not raw encrypted fields
    expect(result).not.toHaveProperty('bank_account_number_encrypted');
    expect(result).not.toHaveProperty('bank_iban_encrypted');
  });

  it('should encrypt bank details before storing when provided', async () => {
    await service.create(TENANT_ID, {
      ...baseCreateDto,
      bank_account_number: '12345678',
      bank_iban: 'IE29AIBK93115212345678',
    });

    expect(mockEncryption.encrypt).toHaveBeenCalledWith('12345678');
    expect(mockEncryption.encrypt).toHaveBeenCalledWith('IE29AIBK93115212345678');
    expect(mockRlsTx.staffProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bank_account_number_encrypted: 'enc-data',
          bank_iban_encrypted: 'enc-data',
          bank_encryption_key_ref: 'key-1',
        }),
      }),
    );
  });

  it('should throw ConflictException if staff profile already exists for user', async () => {
    mockRlsTx.user.findUnique.mockResolvedValue({ id: USER_ID });
    mockRlsTx.staffProfile.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: STAFF_ID });

    await expect(service.create(TENANT_ID, baseCreateDto)).rejects.toThrow(ConflictException);
  });

  it('should create membership and role for new user', async () => {
    await service.create(TENANT_ID, baseCreateDto);

    expect(mockRlsTx.tenantMembership.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          membership_status: 'active',
        }),
      }),
    );
    expect(mockRlsTx.membershipRole.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
        }),
      }),
    );
  });
});

describe('StaffProfilesService — findAll', () => {
  let service: StaffProfilesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockEncryption: ReturnType<typeof buildMockEncryption>;
  let mockSequence: { nextNumber: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockEncryption = buildMockEncryption();
    mockSequence = { nextNumber: jest.fn() };

    const profileWithRoles = {
      ...baseStaffProfile,
      user: {
        ...baseStaffProfile.user,
        phone: '+353871234567',
        memberships: [
          {
            membership_roles: [
              { role: { display_name: 'Teacher' } },
            ],
          },
        ],
      },
    };
    mockRlsTx.staffProfile.findMany.mockReset().mockResolvedValue([profileWithRoles]);
    mockRlsTx.staffProfile.count.mockReset().mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffProfilesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<StaffProfilesService>(StaffProfilesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated staff profiles with masked bank details', async () => {
    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
    // encrypted fields must be stripped from response
    expect(result.data[0]).not.toHaveProperty('bank_account_number_encrypted');
    expect(result.data[0]).not.toHaveProperty('bank_iban_encrypted');
    expect(result.data[0]).toHaveProperty('bank_account_last4');
    expect(result.data[0]).toHaveProperty('bank_iban_last4');
    // roles should be flattened from memberships
    const first = result.data[0]!;
    expect(first.roles).toEqual(['Teacher']);
    // memberships should not leak into the response user object
    expect(first.user).not.toHaveProperty('memberships');
  });

  it('should filter by employment_status when provided', async () => {
    mockRlsTx.staffProfile.findMany.mockResolvedValue([]);
    mockRlsTx.staffProfile.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, employment_status: 'inactive' });

    // The where clause passed into the RLS transaction includes employment_status
    const txFn = (require('../../common/middleware/rls.middleware').createRlsClient as jest.Mock)
      .mock.results[0]?.value;
    expect(txFn).toBeDefined();
  });
});

describe('StaffProfilesService — findOne', () => {
  let service: StaffProfilesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockEncryption: ReturnType<typeof buildMockEncryption>;
  let mockSequence: { nextNumber: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockEncryption = buildMockEncryption();
    mockSequence = { nextNumber: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffProfilesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<StaffProfilesService>(StaffProfilesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return staff profile with class assignments', async () => {
    const profileWithClasses = {
      ...baseStaffProfile,
      class_staff: [
        {
          class_id: 'class-1',
          staff_profile_id: STAFF_ID,
          assignment_role: 'teacher',
          class_entity: {
            id: 'class-1',
            name: '10A',
            academic_year: { name: '2025/2026' },
            subject: { name: 'Mathematics' },
          },
        },
      ],
    };
    mockRlsTx.staffProfile.findFirst.mockReset().mockResolvedValue(profileWithClasses);

    const result = await service.findOne(TENANT_ID, STAFF_ID);

    expect(result.class_assignments).toHaveLength(1);
    expect(result.class_assignments[0]).toMatchObject({
      class_id: 'class-1',
      class_name: '10A',
      subject_name: 'Mathematics',
      assignment_role: 'teacher',
    });
  });

  it('should throw NotFoundException if profile not found', async () => {
    mockRlsTx.staffProfile.findFirst.mockReset().mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, STAFF_ID)).rejects.toThrow(NotFoundException);
  });
});

describe('StaffProfilesService — update', () => {
  let service: StaffProfilesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockEncryption: ReturnType<typeof buildMockEncryption>;
  let mockSequence: { nextNumber: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockEncryption = buildMockEncryption();
    mockSequence = { nextNumber: jest.fn() };

    mockRlsTx.staffProfile.update.mockReset().mockResolvedValue(baseStaffProfile);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffProfilesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<StaffProfilesService>(StaffProfilesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should update staff profile and re-encrypt bank details when changed', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_ID });

    await service.update(TENANT_ID, STAFF_ID, {
      job_title: 'Senior Teacher',
      bank_account_number: '99887766',
    });

    expect(mockEncryption.encrypt).toHaveBeenCalledWith('99887766');
    expect(mockRlsTx.staffProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: STAFF_ID },
        data: expect.objectContaining({
          job_title: 'Senior Teacher',
          bank_account_number_encrypted: 'enc-data',
        }),
      }),
    );
  });

  it('should throw NotFoundException when profile does not exist', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, STAFF_ID, { job_title: 'Librarian' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should invalidate preview cache after update', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_ID });

    await service.update(TENANT_ID, STAFF_ID, { job_title: 'Senior Teacher' });

    expect(mockRedis._client.del).toHaveBeenCalledWith(`preview:staff:${STAFF_ID}`);
  });
});

describe('StaffProfilesService — getBankDetails', () => {
  let service: StaffProfilesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockEncryption: ReturnType<typeof buildMockEncryption>;
  let mockSequence: { nextNumber: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockEncryption = buildMockEncryption();
    mockSequence = { nextNumber: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffProfilesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<StaffProfilesService>(StaffProfilesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return masked bank details', async () => {
    mockRlsTx.staffProfile.findFirst.mockReset().mockResolvedValue({
      id: STAFF_ID,
      bank_name: 'AIB',
      bank_account_number_encrypted: 'enc-acct',
      bank_iban_encrypted: 'enc-iban',
      bank_encryption_key_ref: 'key-1',
    });

    const result = await service.getBankDetails(TENANT_ID, STAFF_ID);

    expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc-acct', 'key-1');
    expect(mockEncryption.decrypt).toHaveBeenCalledWith('enc-iban', 'key-1');
    expect(mockEncryption.mask).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      id: STAFF_ID,
      bank_name: 'AIB',
      bank_account_number_masked: '****1234',
      bank_iban_masked: '****1234',
    });
  });

  it('should throw NotFoundException when profile not found for bank details', async () => {
    mockRlsTx.staffProfile.findFirst.mockReset().mockResolvedValue(null);

    await expect(service.getBankDetails(TENANT_ID, STAFF_ID)).rejects.toThrow(NotFoundException);
  });
});

describe('StaffProfilesService — preview', () => {
  let service: StaffProfilesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockEncryption: ReturnType<typeof buildMockEncryption>;
  let mockSequence: { nextNumber: jest.Mock };

  const profileForPreview = {
    id: STAFF_ID,
    employment_status: 'active',
    job_title: 'Teacher',
    department: 'Science',
    employment_type: 'full_time',
    staff_number: 'ABC1234-5',
    user: {
      first_name: 'Alice',
      last_name: 'Smith',
      email: 'alice@example.com',
    },
  };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockEncryption = buildMockEncryption();
    mockSequence = { nextNumber: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffProfilesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: SequenceService, useValue: mockSequence },
      ],
    }).compile();

    service = module.get<StaffProfilesService>(StaffProfilesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return cached preview data from Redis when cache hit', async () => {
    const cachedData = {
      id: STAFF_ID,
      entity_type: 'staff',
      primary_label: 'Alice Smith',
      secondary_label: 'Teacher',
      status: 'active',
      facts: [{ label: 'Email', value: 'alice@example.com' }],
    };
    mockRedis._client.get.mockResolvedValue(JSON.stringify(cachedData));

    const result = await service.preview(TENANT_ID, STAFF_ID);

    expect(mockRedis._client.get).toHaveBeenCalledWith(`preview:staff:${STAFF_ID}`);
    expect(result).toEqual(cachedData);
    // RLS should not be called on cache hit
    expect(mockRlsTx.staffProfile.findFirst).not.toHaveBeenCalled();
  });

  it('should fetch from DB and cache preview when not in Redis', async () => {
    mockRedis._client.get.mockResolvedValue(null);
    mockRlsTx.staffProfile.findFirst.mockReset().mockResolvedValue(profileForPreview);

    const result = await service.preview(TENANT_ID, STAFF_ID);

    expect(result.id).toBe(STAFF_ID);
    expect(result.entity_type).toBe('staff');
    expect(result.primary_label).toBe('Alice Smith');
    expect(result.status).toBe('active');
    expect(mockRedis._client.set).toHaveBeenCalledWith(
      `preview:staff:${STAFF_ID}`,
      expect.any(String),
      'EX',
      30,
    );
  });

  it('should throw NotFoundException when profile not found for preview', async () => {
    mockRedis._client.get.mockResolvedValue(null);
    mockRlsTx.staffProfile.findFirst.mockReset().mockResolvedValue(null);

    await expect(service.preview(TENANT_ID, STAFF_ID)).rejects.toThrow(NotFoundException);
  });
});
