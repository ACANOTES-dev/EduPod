import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { StaffAvailabilityService } from './staff-availability.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACADEMIC_YEAR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const AVAIL_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('StaffAvailabilityService', () => {
  let service: StaffAvailabilityService;
  let mockPrisma: {
    staffAvailability: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      deleteMany: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    staffProfile: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      staffAvailability: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      staffProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaffAvailabilityService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<StaffAvailabilityService>(StaffAvailabilityService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ────────────────────────────────────────────────────────────────

  it('should return all availability entries for a tenant and academic year', async () => {
    const rawEntries = [
      {
        id: AVAIL_ID,
        weekday: 1,
        available_from: new Date('1970-01-01T08:00:00.000Z'),
        available_to: new Date('1970-01-01T14:00:00.000Z'),
        staff_profile: { id: STAFF_ID, user: { first_name: 'John', last_name: 'Doe' } },
      },
    ];
    mockPrisma.staffAvailability.findMany.mockResolvedValue(rawEntries);

    const result = await service.findAll(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!['available_from']).toBe('08:00');
    expect(result[0]!['available_to']).toBe('14:00');
    expect(mockPrisma.staffAvailability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT_ID, academic_year_id: ACADEMIC_YEAR_ID },
      }),
    );
  });

  it('should filter by staff_profile_id when provided', async () => {
    mockPrisma.staffAvailability.findMany.mockResolvedValue([]);

    await service.findAll(TENANT_ID, ACADEMIC_YEAR_ID, STAFF_ID);

    expect(mockPrisma.staffAvailability.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenant_id: TENANT_ID,
          academic_year_id: ACADEMIC_YEAR_ID,
          staff_profile_id: STAFF_ID,
        },
      }),
    );
  });

  // ─── replaceForStaff ───────────────────────────────────────────────────────

  it('should throw NotFoundException when staff profile does not exist', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

    await expect(
      service.replaceForStaff(TENANT_ID, STAFF_ID, ACADEMIC_YEAR_ID, []),
    ).rejects.toThrow(NotFoundException);
  });

  it('should replace availability entries for a staff member', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_ID });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };

    const mockTx = {
      staffAvailability: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({
          id: 'new-id',
          weekday: 1,
          available_from: new Date('1970-01-01T08:00:00.000Z'),
          available_to: new Date('1970-01-01T14:00:00.000Z'),
        }),
      },
    };

    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const entries = [{ weekday: 1, available_from: '08:00', available_to: '14:00' }];
    const result = await service.replaceForStaff(TENANT_ID, STAFF_ID, ACADEMIC_YEAR_ID, entries);

    expect(result.count).toBe(1);
    expect(mockTx.staffAvailability.deleteMany).toHaveBeenCalled();
    expect(mockTx.staffAvailability.create).toHaveBeenCalled();
  });

  it('should return empty when replacing with zero entries', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: STAFF_ID });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };

    const mockTx = {
      staffAvailability: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.replaceForStaff(TENANT_ID, STAFF_ID, ACADEMIC_YEAR_ID, []);

    expect(result.count).toBe(0);
    expect(result.data).toEqual([]);
  });

  // ─── delete ─────────────────────────────────────────────────────────────────

  it('should throw NotFoundException when deleting a non-existent availability', async () => {
    mockPrisma.staffAvailability.findFirst.mockResolvedValue(null);

    await expect(service.delete(TENANT_ID, AVAIL_ID)).rejects.toThrow(NotFoundException);
  });

  it('should delete an existing availability entry', async () => {
    mockPrisma.staffAvailability.findFirst.mockResolvedValue({ id: AVAIL_ID });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };

    const mockTx = {
      staffAvailability: {
        delete: jest.fn().mockResolvedValue({ id: AVAIL_ID }),
      },
    };

    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.delete(TENANT_ID, AVAIL_ID);

    expect(result).toEqual({ id: AVAIL_ID });
    expect(mockTx.staffAvailability.delete).toHaveBeenCalledWith({ where: { id: AVAIL_ID } });
  });
});
