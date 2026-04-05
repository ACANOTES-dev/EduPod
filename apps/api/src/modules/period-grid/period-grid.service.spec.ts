import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, SchedulingReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { PeriodGridService } from './period-grid.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACADEMIC_YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const YEAR_GROUP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PERIOD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('PeriodGridService', () => {
  let service: PeriodGridService;
  let mockSchedulingFacade: {
    findPeriodTemplatesFiltered: jest.Mock;
    findPeriodTemplatesForHash: jest.Mock;
    findPeriodTemplateById: jest.Mock;
    countPeriodTemplates: jest.Mock;
  };
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

    mockSchedulingFacade = {
      findPeriodTemplatesFiltered: jest.fn().mockImplementation(() => {
        return mockPrisma.schedulePeriodTemplate.findMany();
      }),
      findPeriodTemplatesForHash: jest.fn().mockImplementation(() => {
        return mockPrisma.schedulePeriodTemplate.findMany();
      }),
      findPeriodTemplateById: jest.fn().mockImplementation(() => {
        return mockPrisma.schedulePeriodTemplate.findFirst();
      }),
      countPeriodTemplates: jest.fn().mockImplementation(() => {
        return mockPrisma.schedulePeriodTemplate.count();
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        PeriodGridService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: SchedulingReadFacade,
          useValue: mockSchedulingFacade,
        },
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
        findMany: jest
          .fn()
          .mockResolvedValueOnce([]) // existing periods (none)
          .mockResolvedValueOnce([createdRecord]), // all periods after insert (for re-ordering)
        create: jest.fn().mockResolvedValue(createdRecord),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
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
        findMany: jest
          .fn()
          .mockResolvedValueOnce([existingPeriod]) // existing periods check
          .mockResolvedValueOnce([
            createdPeriod,
            {
              ...existingPeriod,
              start_time: new Date('1970-01-01T08:30:00.000Z'),
              end_time: new Date('1970-01-01T09:30:00.000Z'),
            },
          ]), // all periods for re-ordering
        create: jest.fn().mockResolvedValue(createdPeriod),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
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

    await expect(service.update(TENANT_ID, PERIOD_ID, { start_time: '09:00' })).rejects.toThrow(
      BadRequestException,
    );
  });

  // ─── getTeachingCount ───────────────────────────────────────────────────────

  it('should return the count of teaching periods', async () => {
    mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(25);

    const result = await service.getTeachingCount(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(result).toBe(25);
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
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
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
        create: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'new-1',
            weekday: 1,
            period_order: 1,
            start_time: new Date('1970-01-01T08:00:00.000Z'),
            end_time: new Date('1970-01-01T09:00:00.000Z'),
          })
          .mockResolvedValueOnce({
            id: 'new-2',
            weekday: 1,
            period_order: 2,
            start_time: new Date('1970-01-01T09:00:00.000Z'),
            end_time: new Date('1970-01-01T10:00:00.000Z'),
          }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = (await service.replaceDay(TENANT_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      weekday: 1,
      periods: [
        {
          period_name: 'Period 1',
          start_time: '08:00',
          end_time: '09:00',
          schedule_period_type: 'teaching',
        },
        {
          period_name: 'Period 2',
          start_time: '09:00',
          end_time: '10:00',
          schedule_period_type: 'teaching',
        },
      ],
    })) as { created: unknown[]; count: number };

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
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    await expect(
      service.replaceDay(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
        year_group_id: YEAR_GROUP_ID,
        weekday: 1,
        periods: [
          {
            period_name: 'Bad',
            start_time: '10:00',
            end_time: '09:00',
            schedule_period_type: 'teaching',
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ─── copyYearGroup ──────────────────────────────────────────────────────────

  it('should copy periods from one year group to others', async () => {
    const TARGET_YG = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
      {
        id: 'src-1',
        weekday: 1,
        period_order: 1,
        period_name: 'Period 1',
        period_name_ar: null,
        start_time: new Date('1970-01-01T08:00:00.000Z'),
        end_time: new Date('1970-01-01T09:00:00.000Z'),
        schedule_period_type: 'teaching',
        supervision_mode: 'none',
        break_group_id: null,
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
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = (await service.copyYearGroup(TENANT_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      source_year_group_id: YEAR_GROUP_ID,
      target_year_group_ids: [TARGET_YG],
    })) as { copied: number; target_year_groups: number };

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

  // ─── findAll with yearGroupId ────────────────────────────────────────────────

  it('should call findPeriodTemplatesFiltered with year_group_id when provided', async () => {
    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([]);

    const result = await service.findAll(TENANT_ID, ACADEMIC_YEAR_ID, YEAR_GROUP_ID);

    expect(result).toEqual([]);
    expect(mockSchedulingFacade.findPeriodTemplatesFiltered).toHaveBeenCalledWith(TENANT_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
    });
  });

  // ─── create — no overlap, no push ──────────────────────────────────────────

  it('should create without pushing when no overlap exists', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const existingPeriod = {
      id: 'existing-1',
      period_order: 1,
      start_time: new Date('1970-01-01T07:00:00.000Z'),
      end_time: new Date('1970-01-01T07:45:00.000Z'),
    };
    const createdPeriod = {
      id: 'new-1',
      period_order: 9999,
      start_time: new Date('1970-01-01T08:00:00.000Z'),
      end_time: new Date('1970-01-01T08:45:00.000Z'),
    };
    const mockTx = {
      schedulePeriodTemplate: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([existingPeriod]) // existing periods — no overlap
          .mockResolvedValueOnce([existingPeriod, createdPeriod]), // all for re-ordering
        create: jest.fn().mockResolvedValue(createdPeriod),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const dto = {
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      weekday: 1,
      period_name: 'Period 2',
      period_order: 2,
      start_time: '08:00',
      end_time: '08:45',
      schedule_period_type: 'teaching' as const,
    };

    const result = await service.create(TENANT_ID, dto);

    // The existing period should NOT have been updated (no push needed)
    // update is only called for re-ordering when period_order doesn't match index+1
    expect(result['start_time']).toBe('08:00');
    expect(result['end_time']).toBe('08:45');
  });

  // ─── create — re-ordering skips when period_order already matches ──────────

  it('should skip re-ordering when period_order already matches index', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const createdPeriod = {
      id: 'new-1',
      period_order: 1, // already matches index+1 (0+1 = 1)
      start_time: new Date('1970-01-01T08:00:00.000Z'),
      end_time: new Date('1970-01-01T08:45:00.000Z'),
    };
    const mockTx = {
      schedulePeriodTemplate: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([]) // no existing periods
          .mockResolvedValueOnce([createdPeriod]), // only the created period; order matches
        create: jest.fn().mockResolvedValue(createdPeriod),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
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

    await service.create(TENANT_ID, dto);

    // update should NOT have been called for re-ordering since period_order === 1
    expect(mockTx.schedulePeriodTemplate.update).not.toHaveBeenCalled();
  });

  // ─── create — with optional fields ─────────────────────────────────────────

  it('should create with optional fields (period_name_ar, supervision_mode, break_group_id)', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const createdPeriod = {
      id: 'new-opt',
      period_order: 1,
      start_time: new Date('1970-01-01T08:00:00.000Z'),
      end_time: new Date('1970-01-01T08:45:00.000Z'),
    };
    const mockTx = {
      schedulePeriodTemplate: {
        findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([createdPeriod]),
        create: jest.fn().mockResolvedValue(createdPeriod),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const dto = {
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      weekday: 1,
      period_name: 'Break',
      period_order: 1,
      start_time: '08:00',
      end_time: '08:45',
      schedule_period_type: 'break' as const,
      period_name_ar: 'استراحة',
      supervision_mode: 'supervised' as const,
      break_group_id: 'bg-1',
    };

    await service.create(TENANT_ID, dto);

    expect(mockTx.schedulePeriodTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          period_name_ar: 'استراحة',
          supervision_mode: 'supervised',
          break_group_id: 'bg-1',
        }),
      }),
    );
  });

  // ─── update — cascading time changes across multiple periods ───────────────

  it('should cascade time changes to subsequent periods', async () => {
    mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue({
      id: PERIOD_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      weekday: 1,
      start_time: new Date('1970-01-01T08:00:00.000Z'),
      end_time: new Date('1970-01-01T08:45:00.000Z'),
    });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      schedulePeriodTemplate: {
        update: jest.fn().mockResolvedValue({
          id: PERIOD_ID,
          start_time: new Date('1970-01-01T08:00:00.000Z'),
          end_time: new Date('1970-01-01T09:00:00.000Z'),
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: PERIOD_ID,
            period_order: 1,
            start_time: new Date('1970-01-01T08:00:00.000Z'),
            end_time: new Date('1970-01-01T09:00:00.000Z'), // updated end
          },
          {
            id: 'period-2',
            period_order: 2,
            start_time: new Date('1970-01-01T08:45:00.000Z'), // gap! should cascade to 09:00
            end_time: new Date('1970-01-01T09:30:00.000Z'),
          },
          {
            id: 'period-3',
            period_order: 3,
            start_time: new Date('1970-01-01T09:30:00.000Z'),
            end_time: new Date('1970-01-01T10:15:00.000Z'),
          },
        ]),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    await service.update(TENANT_ID, PERIOD_ID, { end_time: '09:00' });

    // period-2 should be cascaded to start at 09:00
    expect(mockTx.schedulePeriodTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'period-2' },
        data: expect.objectContaining({
          start_time: expect.any(Date),
          end_time: expect.any(Date),
        }),
      }),
    );
  });

  // ─── update — all optional DTO field branches ──────────────────────────────

  it('should update all supported optional fields', async () => {
    mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue({
      id: PERIOD_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      weekday: 1,
      start_time: new Date('1970-01-01T08:00:00.000Z'),
      end_time: new Date('1970-01-01T08:45:00.000Z'),
    });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const updatedRecord = {
      id: PERIOD_ID,
      start_time: new Date('1970-01-01T07:30:00.000Z'),
      end_time: new Date('1970-01-01T08:15:00.000Z'),
    };
    const mockTx = {
      schedulePeriodTemplate: {
        update: jest.fn().mockResolvedValue(updatedRecord),
        findMany: jest.fn().mockResolvedValue([updatedRecord]), // single period, no cascade needed
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    await service.update(TENANT_ID, PERIOD_ID, {
      period_name: 'Updated',
      period_name_ar: 'محدث',
      period_order: 2,
      start_time: '07:30',
      end_time: '08:15',
      schedule_period_type: 'break',
      supervision_mode: 'supervised',
      break_group_id: 'bg-update',
    });

    expect(mockTx.schedulePeriodTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PERIOD_ID },
        data: expect.objectContaining({
          period_name: 'Updated',
          period_name_ar: 'محدث',
          period_order: 2,
          schedule_period_type: 'break',
          supervision_mode: 'supervised',
          break_group_id: 'bg-update',
        }),
      }),
    );
  });

  // ─── update — no time change, no cascade ───────────────────────────────────

  it('should not cascade when only non-time fields are updated', async () => {
    mockPrisma.schedulePeriodTemplate.findFirst.mockResolvedValue({
      id: PERIOD_ID,
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      weekday: 1,
      start_time: new Date('1970-01-01T08:00:00.000Z'),
      end_time: new Date('1970-01-01T08:45:00.000Z'),
    });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      schedulePeriodTemplate: {
        update: jest.fn().mockResolvedValue({
          id: PERIOD_ID,
          start_time: new Date('1970-01-01T08:00:00.000Z'),
          end_time: new Date('1970-01-01T08:45:00.000Z'),
        }),
        findMany: jest.fn(),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    await service.update(TENANT_ID, PERIOD_ID, { period_name: 'Renamed' });

    // findMany should NOT have been called since no time fields changed
    expect(mockTx.schedulePeriodTemplate.findMany).not.toHaveBeenCalled();
  });

  // ─── delete — empty remaining after deletion ──────────────────────────────

  it('should handle deletion when no remaining periods exist', async () => {
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
        findMany: jest.fn().mockResolvedValue([]), // no remaining
        update: jest.fn(),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.delete(TENANT_ID, PERIOD_ID);

    expect(result).toEqual({ message: 'Period deleted and day re-chained' });
    // No updates should have been called since no remaining periods
    expect(mockTx.schedulePeriodTemplate.update).not.toHaveBeenCalled();
  });

  // ─── delete — multiple remaining periods re-chained ────────────────────────

  it('should re-chain multiple remaining periods after deletion', async () => {
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
            id: 'rem-1',
            period_order: 2,
            start_time: new Date('1970-01-01T08:45:00.000Z'),
            end_time: new Date('1970-01-01T09:30:00.000Z'),
          },
          {
            id: 'rem-2',
            period_order: 3,
            start_time: new Date('1970-01-01T10:00:00.000Z'), // gap after rem-1
            end_time: new Date('1970-01-01T10:45:00.000Z'),
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    await service.delete(TENANT_ID, PERIOD_ID);

    // Both remaining periods should be updated
    expect(mockTx.schedulePeriodTemplate.update).toHaveBeenCalledTimes(2);
    // First period: order=1, keeps its start_time
    expect(mockTx.schedulePeriodTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rem-1' },
        data: expect.objectContaining({ period_order: 1 }),
      }),
    );
    // Second period: order=2, start shifted to end of first
    expect(mockTx.schedulePeriodTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rem-2' },
        data: expect.objectContaining({ period_order: 2 }),
      }),
    );
  });

  // ─── copyDay — successful copy path ────────────────────────────────────────

  it('should copy periods from source day to target days', async () => {
    const sourcePeriods = [
      {
        id: 'src-1',
        weekday: 1,
        period_order: 1,
        period_name: 'Period 1',
        period_name_ar: 'الحصة 1',
        start_time: new Date('1970-01-01T08:00:00.000Z'),
        end_time: new Date('1970-01-01T09:00:00.000Z'),
        schedule_period_type: 'teaching',
        supervision_mode: 'none',
        break_group_id: null,
      },
    ];
    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue(sourcePeriods);

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      schedulePeriodTemplate: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
          id: 'copied-1',
          ...data,
          start_time: new Date('1970-01-01T08:00:00.000Z'),
          end_time: new Date('1970-01-01T09:00:00.000Z'),
        })),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = (await service.copyDay(TENANT_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      source_weekday: 1,
      target_weekdays: [2, 3],
    })) as { created: unknown[]; skipped: number[] };

    // Should have deleted existing and created for each target weekday
    expect(mockTx.schedulePeriodTemplate.deleteMany).toHaveBeenCalledTimes(2);
    expect(mockTx.schedulePeriodTemplate.create).toHaveBeenCalledTimes(2);
    expect(result.created).toHaveLength(2);
    expect(result.skipped).toEqual([]);
  });

  // ─── copyYearGroup — with weekdays filter ──────────────────────────────────

  it('should copy year group with weekdays filter applied', async () => {
    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
      {
        id: 'src-1',
        weekday: 1,
        period_order: 1,
        period_name: 'Period 1',
        period_name_ar: null,
        start_time: new Date('1970-01-01T08:00:00.000Z'),
        end_time: new Date('1970-01-01T09:00:00.000Z'),
        schedule_period_type: 'teaching',
        supervision_mode: null,
        break_group_id: null,
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
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = (await service.copyYearGroup(TENANT_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      source_year_group_id: YEAR_GROUP_ID,
      target_year_group_ids: ['eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'],
      weekdays: [1, 2],
    })) as { copied: number; target_year_groups: number };

    expect(result.copied).toBe(1);
    // Verify the deleteMany had weekday filter
    expect(mockTx.schedulePeriodTemplate.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          weekday: { in: [1, 2] },
        }),
      }),
    );
  });

  // ─── copyYearGroup — with empty weekdays array ─────────────────────────────

  it('edge: should not apply weekday filter when weekdays is empty array', async () => {
    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
      {
        id: 'src-1',
        weekday: 1,
        period_order: 1,
        period_name: 'P1',
        period_name_ar: null,
        start_time: new Date('1970-01-01T08:00:00.000Z'),
        end_time: new Date('1970-01-01T09:00:00.000Z'),
        schedule_period_type: 'teaching',
        supervision_mode: null,
        break_group_id: null,
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
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    await service.copyYearGroup(TENANT_ID, {
      academic_year_id: ACADEMIC_YEAR_ID,
      source_year_group_id: YEAR_GROUP_ID,
      target_year_group_ids: ['eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'],
      weekdays: [],
    });

    // Empty weekdays should NOT apply the weekday filter
    expect(mockTx.schedulePeriodTemplate.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({
          weekday: expect.anything(),
        }),
      }),
    );
  });

  // ─── getTeachingCount — with yearGroupId ───────────────────────────────────

  it('should pass year_group_id to countPeriodTemplates when provided', async () => {
    mockPrisma.schedulePeriodTemplate.count.mockResolvedValue(10);

    const result = await service.getTeachingCount(TENANT_ID, ACADEMIC_YEAR_ID, YEAR_GROUP_ID);

    expect(result).toBe(10);
    expect(mockSchedulingFacade.countPeriodTemplates).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ year_group_id: YEAR_GROUP_ID }),
    );
  });

  // ─── formatPeriod — string times pass through ──────────────────────────────

  it('edge: should pass through string times in formatPeriod', async () => {
    // When the facade returns data with string times (not Date objects),
    // formatPeriod should leave them as-is
    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
      {
        id: 'p1',
        weekday: 1,
        period_order: 1,
        start_time: '08:00', // string, not Date
        end_time: '08:45',
      },
    ]);

    const result = await service.findAll(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(result[0]!['start_time']).toBe('08:00');
    expect(result[0]!['end_time']).toBe('08:45');
  });

  // ─── create — start_time equals end_time ───────────────────────────────────

  it('edge: should throw when start_time equals end_time exactly', async () => {
    const dto = {
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
      weekday: 1,
      period_name: 'Period 1',
      period_order: 1,
      start_time: '08:00',
      end_time: '08:00',
      schedule_period_type: 'teaching' as const,
    };

    await expect(service.create(TENANT_ID, dto)).rejects.toThrow(BadRequestException);
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

  it('should return a consistent hash for the same grid data', async () => {
    const periods = [
      {
        weekday: 1,
        period_order: 1,
        start_time: new Date('1970-01-01T08:00:00.000Z'),
        end_time: new Date('1970-01-01T08:45:00.000Z'),
        schedule_period_type: 'teaching',
      },
      {
        weekday: 1,
        period_order: 2,
        start_time: new Date('1970-01-01T09:00:00.000Z'),
        end_time: new Date('1970-01-01T09:45:00.000Z'),
        schedule_period_type: 'break',
      },
    ];
    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue(periods);

    const hash1 = await service.getGridHash(TENANT_ID, ACADEMIC_YEAR_ID);

    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue(periods);
    const hash2 = await service.getGridHash(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(hash1).toBe(hash2);
  });

  it('should return different hashes for different grid data', async () => {
    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
      {
        weekday: 1,
        period_order: 1,
        start_time: new Date('1970-01-01T08:00:00.000Z'),
        end_time: new Date('1970-01-01T08:45:00.000Z'),
        schedule_period_type: 'teaching',
      },
    ]);
    const hash1 = await service.getGridHash(TENANT_ID, ACADEMIC_YEAR_ID);

    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([
      {
        weekday: 2,
        period_order: 1,
        start_time: new Date('1970-01-01T09:00:00.000Z'),
        end_time: new Date('1970-01-01T09:45:00.000Z'),
        schedule_period_type: 'break',
      },
    ]);
    const hash2 = await service.getGridHash(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(hash1).not.toBe(hash2);
  });

  it('should return a hash for an empty grid', async () => {
    mockPrisma.schedulePeriodTemplate.findMany.mockResolvedValue([]);

    const hash = await service.getGridHash(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(hash).toMatch(/^[a-f0-9]{32}$/);
  });
});
