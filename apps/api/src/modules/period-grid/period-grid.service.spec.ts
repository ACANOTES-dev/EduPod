import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { PeriodGridService } from './period-grid.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACADEMIC_YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const YEAR_GROUP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
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
      deleteMany: jest.Mock;
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
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
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
      year_group_id: YEAR_GROUP_ID,
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
    const createdRecord = {
      id: PERIOD_ID,
      weekday: 1,
      period_order: 1,
      start_time: new Date('1970-01-01T08:00:00.000Z'),
      end_time: new Date('1970-01-01T08:45:00.000Z'),
    };
    const mockTx = {
      schedulePeriodTemplate: {
        findMany: jest.fn()
          .mockResolvedValueOnce([]) // existing periods (none)
          .mockResolvedValueOnce([createdRecord]), // all periods after insert (for re-ordering)
        create: jest.fn().mockResolvedValue(createdRecord),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const dto = {
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
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

  it('should push overlapping periods forward when creating', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const existingPeriod = {
      id: 'existing-1',
      period_order: 1,
      start_time: new Date('1970-01-01T08:00:00.000Z'),
      end_time: new Date('1970-01-01T09:00:00.000Z'),
    };
    const createdPeriod = {
      id: 'new-1',
      period_order: 9999,
      start_time: new Date('1970-01-01T08:00:00.000Z'),
      end_time: new Date('1970-01-01T08:30:00.000Z'),
    };
    const mockTx = {
      schedulePeriodTemplate: {
        findMany: jest.fn()
          .mockResolvedValueOnce([existingPeriod]) // existing periods check
          .mockResolvedValueOnce([createdPeriod, { ...existingPeriod, start_time: new Date('1970-01-01T08:30:00.000Z'), end_time: new Date('1970-01-01T09:30:00.000Z') }]), // all periods for re-ordering
        create: jest.fn().mockResolvedValue(createdPeriod),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const dto = {
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      weekday: 1,
      period_name: 'New Period',
      period_order: 1,
      start_time: '08:00',
      end_time: '08:30',
      schedule_period_type: 'teaching' as const,
    };

    await service.create(TENANT_ID, dto);

    // Should have pushed the overlapping period forward
    expect(mockTx.schedulePeriodTemplate.update).toHaveBeenCalled();
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

  it('should delete a period and re-chain remaining periods', async () => {
    mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue({
      id: PERIOD_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      weekday: 1,
    });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      schedulePeriodTemplate: {
        delete: jest.fn().mockResolvedValue({ id: PERIOD_ID }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'remaining-1',
            period_order: 2,
            start_time: new Date('1970-01-01T09:00:00.000Z'),
            end_time: new Date('1970-01-01T10:00:00.000Z'),
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.delete(TENANT_ID, PERIOD_ID);

    expect(mockTx.schedulePeriodTemplate.delete).toHaveBeenCalled();
    expect(result).toEqual({ message: 'Period deleted and day re-chained' });
  });

  // ─── copyDay ────────────────────────────────────────────────────────────────

  it('should throw NotFoundException when source day has no periods', async () => {
    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([]);

    await expect(
      service.copyDay(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
        year_group_id: YEAR_GROUP_ID,
        source_weekday: 1,
        target_weekdays: [2, 3],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── replaceDay ─────────────────────────────────────────────────────────────

  it('should delete existing periods and create new ones for a day', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      schedulePeriodTemplate: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        create: jest.fn()
          .mockResolvedValueOnce({
            id: 'new-1', weekday: 1, period_order: 1,
            start_time: new Date('1970-01-01T08:00:00.000Z'),
            end_time: new Date('1970-01-01T09:00:00.000Z'),
          })
          .mockResolvedValueOnce({
            id: 'new-2', weekday: 1, period_order: 2,
            start_time: new Date('1970-01-01T09:00:00.000Z'),
            end_time: new Date('1970-01-01T10:00:00.000Z'),
          }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.replaceDay(TENANT_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      weekday: 1,
      periods: [
        { period_name: 'Period 1', start_time: '08:00', end_time: '09:00', schedule_period_type: 'teaching' },
        { period_name: 'Period 2', start_time: '09:00', end_time: '10:00', schedule_period_type: 'teaching' },
      ],
    }) as { created: unknown[]; count: number };

    expect(mockTx.schedulePeriodTemplate.deleteMany).toHaveBeenCalled();
    expect(result.count).toBe(2);
  });

  it('should throw BadRequestException when replace-day period has invalid time range', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      schedulePeriodTemplate: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    await expect(
      service.replaceDay(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
        year_group_id: YEAR_GROUP_ID,
        weekday: 1,
        periods: [
          { period_name: 'Bad', start_time: '10:00', end_time: '09:00', schedule_period_type: 'teaching' },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ─── copyYearGroup ──────────────────────────────────────────────────────────

  it('should copy periods from one year group to others', async () => {
    const TARGET_YG = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
      {
        id: 'src-1', weekday: 1, period_order: 1, period_name: 'Period 1',
        period_name_ar: null,
        start_time: new Date('1970-01-01T08:00:00.000Z'),
        end_time: new Date('1970-01-01T09:00:00.000Z'),
        schedule_period_type: 'teaching', supervision_mode: 'none', break_group_id: null,
      },
    ]);

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      schedulePeriodTemplate: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'new-1' }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.copyYearGroup(TENANT_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      source_year_group_id: YEAR_GROUP_ID,
      target_year_group_ids: [TARGET_YG],
    }) as { copied: number; target_year_groups: number };

    expect(result.copied).toBe(1);
    expect(result.target_year_groups).toBe(1);
  });

  it('should throw NotFoundException when source year group has no periods', async () => {
    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([]);

    await expect(
      service.copyYearGroup(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
        source_year_group_id: YEAR_GROUP_ID,
        target_year_group_ids: ['eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'],
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
