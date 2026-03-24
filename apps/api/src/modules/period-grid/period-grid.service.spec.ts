import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { PeriodGridService } from './period-grid.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACADEMIC_YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PERIOD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('PeriodGridService', () => {
  let service: PeriodGridService;
  let mockPrisma: {
    schedulePeriodTemplate: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      schedulePeriodTemplate: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodGridService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PeriodGridService>(PeriodGridService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ────────────────────────────────────────────────────────────────

  it('should return formatted periods for a tenant and academic year', async () => {
    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
      {
        id: PERIOD_ID,
        weekday: 1,
        period_order: 1,
        start_time: new Date('1970-01-01T08:00:00.000Z'),
        end_time: new Date('1970-01-01T08:45:00.000Z'),
      },
    ]);

    const result = await service.findAll(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!['start_time']).toBe('08:00');
    expect(result[0]!['end_time']).toBe('08:45');
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  it('should throw BadRequestException when start_time >= end_time', async () => {
    const dto = {
      academic_year_id: ACADEMIC_YEAR_ID,
      weekday: 1,
      period_name: 'Period 1',
      period_order: 1,
      start_time: '14:00',
      end_time: '08:00',
      schedule_period_type: 'teaching' as const,
    };

    await expect(service.create(TENANT_ID, dto)).rejects.toThrow(BadRequestException);
  });

  it('should create a period template and return formatted result', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      schedulePeriodTemplate: {
        create: jest.fn().mockResolvedValue({
          id: PERIOD_ID,
          weekday: 1,
          period_order: 1,
          start_time: new Date('1970-01-01T08:00:00.000Z'),
          end_time: new Date('1970-01-01T08:45:00.000Z'),
        }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const dto = {
      academic_year_id: ACADEMIC_YEAR_ID,
      weekday: 1,
      period_name: 'Period 1',
      period_order: 1,
      start_time: '08:00',
      end_time: '08:45',
      schedule_period_type: 'teaching' as const,
    };

    const result = await service.create(TENANT_ID, dto);

    expect(result['start_time']).toBe('08:00');
    expect(result['end_time']).toBe('08:45');
  });

  it('should throw ConflictException on duplicate period order', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.0.0' },
    );
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockRejectedValue(prismaError),
    });

    const dto = {
      academic_year_id: ACADEMIC_YEAR_ID,
      weekday: 1,
      period_name: 'Period 1',
      period_order: 1,
      start_time: '08:00',
      end_time: '08:45',
      schedule_period_type: 'teaching' as const,
    };

    await expect(service.create(TENANT_ID, dto)).rejects.toThrow(ConflictException);
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  it('should throw NotFoundException when updating a non-existent period', async () => {
    mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue(null);

    await expect(service.update(TENANT_ID, PERIOD_ID, {})).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when update results in invalid time range', async () => {
    mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue({
      id: PERIOD_ID,
      start_time: new Date('1970-01-01T08:00:00.000Z'),
      end_time: new Date('1970-01-01T08:45:00.000Z'),
    });

    await expect(
      service.update(TENANT_ID, PERIOD_ID, { start_time: '09:00' }),
    ).rejects.toThrow(BadRequestException);
  });

  // ─── getTeachingCount ───────────────────────────────────────────────────────

  it('should return the count of teaching periods', async () => {
    mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(25);

    const result = await service.getTeachingCount(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(result).toBe(25);
    expect(mockPrisma.schedulePeriodTemplate.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenant_id: TENANT_ID,
          academic_year_id: ACADEMIC_YEAR_ID,
          schedule_period_type: 'teaching',
        },
      }),
    );
  });

  // ─── delete ─────────────────────────────────────────────────────────────────

  it('should throw NotFoundException when deleting a non-existent period', async () => {
    mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue(null);

    await expect(service.delete(TENANT_ID, PERIOD_ID)).rejects.toThrow(NotFoundException);
  });

  it('should delete a period when it exists', async () => {
    mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue({ id: PERIOD_ID });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      schedulePeriodTemplate: {
        delete: jest.fn().mockResolvedValue({ id: PERIOD_ID }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.delete(TENANT_ID, PERIOD_ID);

    expect(result).toEqual({ id: PERIOD_ID });
  });

  // ─── copyDay ────────────────────────────────────────────────────────────────

  it('should throw NotFoundException when source day has no periods', async () => {
    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([]);

    await expect(
      service.copyDay(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
        source_weekday: 1,
        target_weekdays: [2, 3],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── getGridHash ────────────────────────────────────────────────────────────

  it('should return an md5 hash string of the grid', async () => {
    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
      {
        weekday: 1,
        period_order: 1,
        start_time: new Date('1970-01-01T08:00:00.000Z'),
        end_time: new Date('1970-01-01T08:45:00.000Z'),
        schedule_period_type: 'teaching',
      },
    ]);

    const hash = await service.getGridHash(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });
});
