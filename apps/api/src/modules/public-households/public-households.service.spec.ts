import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PublicHouseholdsRateLimitService } from './public-households-rate-limit.service';
import { PublicHouseholdsService } from './public-households.service';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const HOUSEHOLD_ID = '22222222-2222-2222-2222-222222222222';
const HOUSEHOLD_NUMBER = 'XYZ476';
const PARENT_EMAIL = 'alice@example.com';
const CLIENT_IP = '192.168.1.1';

// ─── Mocks ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  const mockTx = {
    household: {
      findFirst: jest.fn(),
    },
  };

  return {
    instance: {
      $extends: jest.fn().mockReturnValue({
        $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      }),
    } as unknown as PrismaService,
    tx: mockTx,
  };
}

function buildMockRateLimit() {
  return {
    consume: jest.fn().mockResolvedValue({ allowed: true }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PublicHouseholdsService', () => {
  let service: PublicHouseholdsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRateLimit: ReturnType<typeof buildMockRateLimit>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRateLimit = buildMockRateLimit();

    const module = await Test.createTestingModule({
      providers: [
        PublicHouseholdsService,
        { provide: PrismaService, useValue: mockPrisma.instance },
        { provide: PublicHouseholdsRateLimitService, useValue: mockRateLimit },
      ],
    }).compile();

    service = module.get(PublicHouseholdsService);
  });

  afterEach(() => jest.clearAllMocks());

  const validDto = {
    tenant_slug: 'nhqs',
    household_number: HOUSEHOLD_NUMBER,
    parent_email: PARENT_EMAIL,
  };

  it('should return household data when number + email both match', async () => {
    mockPrisma.tx.household.findFirst.mockResolvedValue({
      id: HOUSEHOLD_ID,
      household_number: HOUSEHOLD_NUMBER,
      household_name: 'Smith Family',
      _count: { students: 2 },
    });

    const result = await service.lookupByNumberAndEmail(TENANT_ID, validDto, CLIENT_IP);

    expect(result).toEqual({
      household_id: HOUSEHOLD_ID,
      household_number: HOUSEHOLD_NUMBER,
      household_name: 'Smith Family',
      active_student_count: 2,
    });
  });

  it('should return 404 when household number matches but email does not', async () => {
    mockPrisma.tx.household.findFirst.mockResolvedValue(null);

    await expect(service.lookupByNumberAndEmail(TENANT_ID, validDto, CLIENT_IP)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return 404 when email matches but number does not', async () => {
    mockPrisma.tx.household.findFirst.mockResolvedValue(null);

    await expect(
      service.lookupByNumberAndEmail(
        TENANT_ID,
        { ...validDto, household_number: 'AAA999' },
        CLIENT_IP,
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('should use the same HOUSEHOLD_NOT_FOUND code for both failure modes', async () => {
    mockPrisma.tx.household.findFirst.mockResolvedValue(null);

    try {
      await service.lookupByNumberAndEmail(TENANT_ID, validDto, CLIENT_IP);
      fail('Expected NotFoundException');
    } catch (err) {
      const response = (err as NotFoundException).getResponse();
      expect(response).toHaveProperty('code', 'HOUSEHOLD_NOT_FOUND');
    }
  });

  it('should throw 403 when rate limit is exceeded', async () => {
    mockRateLimit.consume.mockResolvedValue({ allowed: false });

    await expect(service.lookupByNumberAndEmail(TENANT_ID, validDto, CLIENT_IP)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should return 404 when household_number is null (legacy household)', async () => {
    mockPrisma.tx.household.findFirst.mockResolvedValue({
      id: HOUSEHOLD_ID,
      household_number: null,
      household_name: 'Old Family',
      _count: { students: 1 },
    });

    await expect(service.lookupByNumberAndEmail(TENANT_ID, validDto, CLIENT_IP)).rejects.toThrow(
      NotFoundException,
    );
  });
});
