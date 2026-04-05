import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RegulatoryCalendarService } from './regulatory-calendar.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const EVENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('RegulatoryCalendarService', () => {
  let service: RegulatoryCalendarService;
  let mockPrisma: {
    regulatoryCalendarEvent: {
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
      regulatoryCalendarEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: EVENT_ID, title: 'Test Event' }),
        update: jest.fn().mockResolvedValue({ id: EVENT_ID }),
        delete: jest.fn().mockResolvedValue({ id: EVENT_ID }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RegulatoryCalendarService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<RegulatoryCalendarService>(RegulatoryCalendarService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a calendar event', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      regulatoryCalendarEvent: {
        create: jest.fn().mockResolvedValue({ id: EVENT_ID, title: 'Tusla SAR Period 1' }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.create(TENANT_ID, USER_ID, {
      domain: 'tusla_attendance',
      event_type: 'hard_deadline',
      title: 'Tusla SAR Period 1',
      due_date: '2026-02-01',
      is_recurring: false,
      reminder_days: [],
    });

    expect(result).toEqual({ id: EVENT_ID, title: 'Tusla SAR Period 1' });
  });

  it('should return paginated calendar events', async () => {
    mockPrisma.regulatoryCalendarEvent.findMany.mockResolvedValue([
      { id: EVENT_ID, title: 'Test' },
    ]);
    mockPrisma.regulatoryCalendarEvent.count.mockResolvedValue(1);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('should return a single calendar event', async () => {
    mockPrisma.regulatoryCalendarEvent.findFirst.mockResolvedValue({ id: EVENT_ID, title: 'Test' });

    const result = await service.findOne(TENANT_ID, EVENT_ID);

    expect(result.title).toBe('Test');
  });

  it('should throw NotFoundException when event does not exist', async () => {
    mockPrisma.regulatoryCalendarEvent.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, EVENT_ID)).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when updating non-existent event', async () => {
    mockPrisma.regulatoryCalendarEvent.findFirst.mockResolvedValue(null);

    await expect(
      service.update(TENANT_ID, EVENT_ID, USER_ID, { title: 'Updated' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when removing non-existent event', async () => {
    mockPrisma.regulatoryCalendarEvent.findFirst.mockResolvedValue(null);

    await expect(service.remove(TENANT_ID, EVENT_ID)).rejects.toThrow(NotFoundException);
  });

  it('should seed default calendar events', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      regulatoryCalendarEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: EVENT_ID }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = (await service.seedDefaults(TENANT_ID, '2025-2026')) as {
      created: number;
      total: number;
    };

    expect(result.total).toBeGreaterThan(0);
    expect(result.created).toBe(result.total);
  });

  it('should skip existing events during seed', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      regulatoryCalendarEvent: {
        findFirst: jest.fn().mockResolvedValue({ id: EVENT_ID }),
        create: jest.fn(),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = (await service.seedDefaults(TENANT_ID, '2025-2026')) as {
      created: number;
      total: number;
    };

    expect(result.created).toBe(0);
    expect(result.total).toBeGreaterThan(0);
    expect(mockTx.regulatoryCalendarEvent.create).not.toHaveBeenCalled();
  });

  // ─── findAll — filter branches ─────────────────────────────────────────────

  describe('RegulatoryCalendarService — findAll filters', () => {
    it('should apply domain filter', async () => {
      mockPrisma.regulatoryCalendarEvent.findMany.mockResolvedValue([]);
      mockPrisma.regulatoryCalendarEvent.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        domain: 'tusla_attendance',
      });

      expect(mockPrisma.regulatoryCalendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            domain: 'tusla_attendance',
          }),
        }),
      );
    });

    it('should apply status filter', async () => {
      mockPrisma.regulatoryCalendarEvent.findMany.mockResolvedValue([]);
      mockPrisma.regulatoryCalendarEvent.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        status: 'submitted',
      });

      expect(mockPrisma.regulatoryCalendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: expect.anything(),
          }),
        }),
      );
    });

    it('should apply academic_year filter', async () => {
      mockPrisma.regulatoryCalendarEvent.findMany.mockResolvedValue([]);
      mockPrisma.regulatoryCalendarEvent.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        academic_year: '2025-2026',
      });

      expect(mockPrisma.regulatoryCalendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            academic_year: '2025-2026',
          }),
        }),
      );
    });

    it('should apply from_date filter', async () => {
      mockPrisma.regulatoryCalendarEvent.findMany.mockResolvedValue([]);
      mockPrisma.regulatoryCalendarEvent.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        from_date: '2026-01-01',
      });

      expect(mockPrisma.regulatoryCalendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            due_date: expect.objectContaining({
              gte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should apply both from_date and to_date filters', async () => {
      mockPrisma.regulatoryCalendarEvent.findMany.mockResolvedValue([]);
      mockPrisma.regulatoryCalendarEvent.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        from_date: '2026-01-01',
        to_date: '2026-12-31',
      });

      expect(mockPrisma.regulatoryCalendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            due_date: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should apply to_date only filter', async () => {
      mockPrisma.regulatoryCalendarEvent.findMany.mockResolvedValue([]);
      mockPrisma.regulatoryCalendarEvent.count.mockResolvedValue(0);

      await service.findAll(TENANT_ID, {
        page: 1,
        pageSize: 20,
        to_date: '2026-12-31',
      });

      expect(mockPrisma.regulatoryCalendarEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            due_date: expect.objectContaining({
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });
  });

  // ─── update — field branches ───────────────────────────────────────────────

  describe('RegulatoryCalendarService — update branches', () => {
    it('should update multiple fields', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.regulatoryCalendarEvent.findFirst.mockResolvedValue({ id: EVENT_ID });
      const mockTx = {
        regulatoryCalendarEvent: {
          update: jest.fn().mockResolvedValue({ id: EVENT_ID, title: 'Updated' }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, EVENT_ID, USER_ID, {
        title: 'Updated',
        description: 'New desc',
        due_date: '2026-06-01',
        notes: 'Note',
        reminder_days: [7, 14],
      });

      expect(mockTx.regulatoryCalendarEvent.update).toHaveBeenCalledWith({
        where: { id: EVENT_ID },
        data: expect.objectContaining({
          title: 'Updated',
          description: 'New desc',
          due_date: expect.any(Date),
          notes: 'Note',
          reminder_days: [7, 14],
        }),
      });
    });

    it('should set completed_at and completed_by_id when status is accepted', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.regulatoryCalendarEvent.findFirst.mockResolvedValue({ id: EVENT_ID });
      const mockTx = {
        regulatoryCalendarEvent: {
          update: jest.fn().mockResolvedValue({ id: EVENT_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, EVENT_ID, USER_ID, { status: 'accepted' });

      expect(mockTx.regulatoryCalendarEvent.update).toHaveBeenCalledWith({
        where: { id: EVENT_ID },
        data: expect.objectContaining({
          completed_at: expect.any(Date),
          completed_by_id: USER_ID,
        }),
      });
    });

    it('should set completed_at and completed_by_id when status is submitted', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.regulatoryCalendarEvent.findFirst.mockResolvedValue({ id: EVENT_ID });
      const mockTx = {
        regulatoryCalendarEvent: {
          update: jest.fn().mockResolvedValue({ id: EVENT_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, EVENT_ID, USER_ID, { status: 'submitted' });

      expect(mockTx.regulatoryCalendarEvent.update).toHaveBeenCalledWith({
        where: { id: EVENT_ID },
        data: expect.objectContaining({
          completed_at: expect.any(Date),
          completed_by_id: USER_ID,
        }),
      });
    });

    it('should set completed_at to null when explicitly provided as null', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.regulatoryCalendarEvent.findFirst.mockResolvedValue({ id: EVENT_ID });
      const mockTx = {
        regulatoryCalendarEvent: {
          update: jest.fn().mockResolvedValue({ id: EVENT_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, EVENT_ID, USER_ID, {
        completed_at: null as unknown as string,
      });

      expect(mockTx.regulatoryCalendarEvent.update).toHaveBeenCalledWith({
        where: { id: EVENT_ID },
        data: expect.objectContaining({
          completed_at: null,
        }),
      });
    });

    it('should convert completed_at string to Date', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.regulatoryCalendarEvent.findFirst.mockResolvedValue({ id: EVENT_ID });
      const mockTx = {
        regulatoryCalendarEvent: {
          update: jest.fn().mockResolvedValue({ id: EVENT_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, EVENT_ID, USER_ID, {
        completed_at: '2026-06-01T12:00:00Z',
      });

      expect(mockTx.regulatoryCalendarEvent.update).toHaveBeenCalledWith({
        where: { id: EVENT_ID },
        data: expect.objectContaining({
          completed_at: expect.any(Date),
        }),
      });
    });
  });

  // ─── remove — successful deletion ──────────────────────────────────────────

  describe('RegulatoryCalendarService — remove success', () => {
    it('should delete an existing event', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.regulatoryCalendarEvent.findFirst.mockResolvedValue({ id: EVENT_ID });
      const mockTx = {
        regulatoryCalendarEvent: {
          delete: jest.fn().mockResolvedValue({ id: EVENT_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.remove(TENANT_ID, EVENT_ID);

      expect(mockTx.regulatoryCalendarEvent.delete).toHaveBeenCalledWith({
        where: { id: EVENT_ID },
      });
    });
  });
});
