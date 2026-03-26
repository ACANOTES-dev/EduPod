import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const ENTITY_ID = 'entity-1';

describe('BehaviourHistoryService', () => {
  let service: BehaviourHistoryService;
  let mockPrisma: {
    behaviourEntityHistory: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      behaviourEntityHistory: {
        create: jest.fn().mockResolvedValue({ id: 'history-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourHistoryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BehaviourHistoryService>(BehaviourHistoryService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── recordHistory ────────────────────────────────────────────────────

  describe('recordHistory', () => {
    it('should create a history record with all fields', async () => {
      const txMock = {
        behaviourEntityHistory: {
          create: jest.fn().mockResolvedValue({ id: 'history-1' }),
        },
      } as unknown as PrismaService;

      await service.recordHistory(
        txMock,
        TENANT_ID,
        'incident',
        ENTITY_ID,
        USER_ID,
        'created',
        null,
        { status: 'active', category: 'Disruption' },
      );

      expect(txMock.behaviourEntityHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          entity_type: 'incident',
          entity_id: ENTITY_ID,
          changed_by_id: USER_ID,
          change_type: 'created',
          previous_values: Prisma.DbNull,
          new_values: { status: 'active', category: 'Disruption' },
        }),
      });
    });

    it('should store previous_values as JSON when provided', async () => {
      const txMock = {
        behaviourEntityHistory: {
          create: jest.fn().mockResolvedValue({ id: 'history-2' }),
        },
      } as unknown as PrismaService;

      const previousValues = { status: 'draft' };
      const newValues = { status: 'active' };

      await service.recordHistory(
        txMock,
        TENANT_ID,
        'incident',
        ENTITY_ID,
        USER_ID,
        'status_changed',
        previousValues,
        newValues,
      );

      expect(txMock.behaviourEntityHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          previous_values: previousValues,
          new_values: newValues,
        }),
      });
    });

    it('should include reason when provided', async () => {
      const txMock = {
        behaviourEntityHistory: {
          create: jest.fn().mockResolvedValue({ id: 'history-3' }),
        },
      } as unknown as PrismaService;

      await service.recordHistory(
        txMock,
        TENANT_ID,
        'incident',
        ENTITY_ID,
        USER_ID,
        'status_changed',
        { status: 'active' },
        { status: 'withdrawn' },
        'No longer relevant',
      );

      expect(txMock.behaviourEntityHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reason: 'No longer relevant',
        }),
      });
    });

    it('should handle task entity type', async () => {
      const txMock = {
        behaviourEntityHistory: {
          create: jest.fn().mockResolvedValue({ id: 'history-4' }),
        },
      } as unknown as PrismaService;

      await service.recordHistory(
        txMock,
        TENANT_ID,
        'task',
        'task-1',
        USER_ID,
        'completed',
        { status: 'pending' },
        { status: 'completed' },
      );

      expect(txMock.behaviourEntityHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entity_type: 'task',
          entity_id: 'task-1',
          change_type: 'completed',
        }),
      });
    });
  });

  // ─── getHistory ───────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('should return paginated history entries', async () => {
      const historyEntries = [
        {
          id: 'h-1',
          change_type: 'created',
          created_at: new Date('2026-03-01'),
          changed_by: { id: USER_ID, first_name: 'John', last_name: 'Doe' },
        },
        {
          id: 'h-2',
          change_type: 'status_changed',
          created_at: new Date('2026-03-02'),
          changed_by: { id: USER_ID, first_name: 'John', last_name: 'Doe' },
        },
      ];

      mockPrisma.behaviourEntityHistory.findMany.mockResolvedValue(historyEntries);
      mockPrisma.behaviourEntityHistory.count.mockResolvedValue(10);

      const result = await service.getHistory(TENANT_ID, 'incident', ENTITY_ID, 1, 20);

      expect(result.data).toEqual(historyEntries);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 10 });
    });

    it('should apply correct WHERE filter and ordering', async () => {
      mockPrisma.behaviourEntityHistory.findMany.mockResolvedValue([]);
      mockPrisma.behaviourEntityHistory.count.mockResolvedValue(0);

      await service.getHistory(TENANT_ID, 'incident', ENTITY_ID, 2, 10);

      expect(mockPrisma.behaviourEntityHistory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenant_id: TENANT_ID,
            entity_type: 'incident',
            entity_id: ENTITY_ID,
          },
          orderBy: { created_at: 'desc' },
          skip: 10,
          take: 10,
          include: {
            changed_by: {
              select: { id: true, first_name: true, last_name: true },
            },
          },
        }),
      );
    });

    it('should include changed_by user info in results', async () => {
      const entry = {
        id: 'h-1',
        changed_by: { id: 'user-2', first_name: 'Jane', last_name: 'Smith' },
      };
      mockPrisma.behaviourEntityHistory.findMany.mockResolvedValue([entry]);
      mockPrisma.behaviourEntityHistory.count.mockResolvedValue(1);

      const result = await service.getHistory(TENANT_ID, 'incident', ENTITY_ID, 1, 20);

      expect(result.data[0]!.changed_by).toEqual({
        id: 'user-2',
        first_name: 'Jane',
        last_name: 'Smith',
      });
    });
  });
});
