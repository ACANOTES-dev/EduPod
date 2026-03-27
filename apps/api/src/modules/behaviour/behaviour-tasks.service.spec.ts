import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourTasksService } from './behaviour-tasks.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TASK_ID = 'task-1';
const USER_ID = 'user-1';

// Mock the RLS middleware
const mockRlsTx = {
  behaviourTask: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

describe('BehaviourTasksService', () => {
  let service: BehaviourTasksService;
  let mockPrisma: {
    behaviourTask: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
  };
  let mockHistory: { recordHistory: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      behaviourTask: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
    };

    mockHistory = { recordHistory: jest.fn().mockResolvedValue(undefined) };

    // Reset RLS tx mocks
    mockRlsTx.behaviourTask!.findFirst.mockReset();
    mockRlsTx.behaviourTask!.update.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourTasksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: BehaviourHistoryService, useValue: mockHistory },
      ],
    }).compile();

    service = module.get<BehaviourTasksService>(BehaviourTasksService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── completeTask ─────────────────────────────────────────────────────

  describe('completeTask', () => {
    it('should set completed status with timestamp and notes', async () => {
      const task = { id: TASK_ID, status: 'pending', tenant_id: TENANT_ID };
      const updated = { ...task, status: 'completed', completed_at: new Date() };

      mockRlsTx.behaviourTask!.findFirst.mockResolvedValue(task);
      mockRlsTx.behaviourTask!.update.mockResolvedValue(updated);

      const result = await service.completeTask(TENANT_ID, TASK_ID, USER_ID, {
        completion_notes: 'Spoke with parents',
      }) as { status: string };

      expect(result.status).toBe('completed');
      expect(mockRlsTx.behaviourTask!.update).toHaveBeenCalledWith({
        where: { id: TASK_ID },
        data: expect.objectContaining({
          status: 'completed',
          completed_by_id: USER_ID,
          completion_notes: 'Spoke with parents',
        }),
      });
    });

    it('should record history on completion', async () => {
      const task = { id: TASK_ID, status: 'in_progress', tenant_id: TENANT_ID };
      mockRlsTx.behaviourTask!.findFirst.mockResolvedValue(task);
      mockRlsTx.behaviourTask!.update.mockResolvedValue({ ...task, status: 'completed' });

      await service.completeTask(TENANT_ID, TASK_ID, USER_ID, {});

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'task',
        TASK_ID,
        USER_ID,
        'completed',
        { status: 'in_progress' },
        { status: 'completed' },
      );
    });

    it('should throw TASK_ALREADY_CLOSED for already completed task', async () => {
      mockRlsTx.behaviourTask!.findFirst.mockResolvedValue({
        id: TASK_ID,
        status: 'completed',
        tenant_id: TENANT_ID,
      });

      await expect(
        service.completeTask(TENANT_ID, TASK_ID, USER_ID, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw TASK_ALREADY_CLOSED for already cancelled task', async () => {
      mockRlsTx.behaviourTask!.findFirst.mockResolvedValue({
        id: TASK_ID,
        status: 'cancelled',
        tenant_id: TENANT_ID,
      });

      await expect(
        service.completeTask(TENANT_ID, TASK_ID, USER_ID, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when task does not exist', async () => {
      mockRlsTx.behaviourTask!.findFirst.mockResolvedValue(null);

      await expect(
        service.completeTask(TENANT_ID, TASK_ID, USER_ID, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle null completion_notes', async () => {
      const task = { id: TASK_ID, status: 'pending', tenant_id: TENANT_ID };
      mockRlsTx.behaviourTask!.findFirst.mockResolvedValue(task);
      mockRlsTx.behaviourTask!.update.mockResolvedValue({ ...task, status: 'completed' });

      await service.completeTask(TENANT_ID, TASK_ID, USER_ID, {});

      expect(mockRlsTx.behaviourTask!.update).toHaveBeenCalledWith({
        where: { id: TASK_ID },
        data: expect.objectContaining({
          completion_notes: null,
        }),
      });
    });
  });

  // ─── cancelTask ───────────────────────────────────────────────────────

  describe('cancelTask', () => {
    it('should set cancelled status with reason', async () => {
      const task = { id: TASK_ID, status: 'pending', tenant_id: TENANT_ID };
      const updated = { ...task, status: 'cancelled' };

      mockRlsTx.behaviourTask!.findFirst.mockResolvedValue(task);
      mockRlsTx.behaviourTask!.update.mockResolvedValue(updated);

      const result = await service.cancelTask(TENANT_ID, TASK_ID, USER_ID, {
        reason: 'No longer needed',
      }) as { status: string };

      expect(result.status).toBe('cancelled');
      expect(mockRlsTx.behaviourTask!.update).toHaveBeenCalledWith({
        where: { id: TASK_ID },
        data: { status: 'cancelled' },
      });
    });

    it('should record history with reason', async () => {
      const task = { id: TASK_ID, status: 'in_progress', tenant_id: TENANT_ID };
      mockRlsTx.behaviourTask!.findFirst.mockResolvedValue(task);
      mockRlsTx.behaviourTask!.update.mockResolvedValue({ ...task, status: 'cancelled' });

      await service.cancelTask(TENANT_ID, TASK_ID, USER_ID, {
        reason: 'Student transferred',
      });

      expect(mockHistory.recordHistory).toHaveBeenCalledWith(
        mockRlsTx,
        TENANT_ID,
        'task',
        TASK_ID,
        USER_ID,
        'cancelled',
        { status: 'in_progress' },
        { status: 'cancelled' },
        'Student transferred',
      );
    });

    it('should throw NotFoundException when task does not exist', async () => {
      mockRlsTx.behaviourTask!.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelTask(TENANT_ID, TASK_ID, USER_ID, { reason: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getMyTasks ───────────────────────────────────────────────────────

  describe('getMyTasks', () => {
    it('should filter by assigned_to_id and active statuses', async () => {
      mockPrisma.behaviourTask.findMany.mockResolvedValue([]);
      mockPrisma.behaviourTask.count.mockResolvedValue(0);

      await service.getMyTasks(TENANT_ID, USER_ID, 1, 20);

      expect(mockPrisma.behaviourTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            assigned_to_id: USER_ID,
            status: { in: ['pending', 'in_progress', 'overdue'] },
          }),
        }),
      );
    });

    it('should return paginated results with correct meta', async () => {
      const tasks = [{ id: 'task-1', title: 'Follow up' }];
      mockPrisma.behaviourTask.findMany.mockResolvedValue(tasks);
      mockPrisma.behaviourTask.count.mockResolvedValue(5);

      const result = await service.getMyTasks(TENANT_ID, USER_ID, 2, 10);

      expect(result.data).toEqual(tasks);
      expect(result.meta).toEqual({ page: 2, pageSize: 10, total: 5 });
      expect(mockPrisma.behaviourTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  // ─── getOverdueTasks ─────────────────────────────────────────────────

  describe('getOverdueTasks', () => {
    it('should filter by overdue status only', async () => {
      mockPrisma.behaviourTask.findMany.mockResolvedValue([]);
      mockPrisma.behaviourTask.count.mockResolvedValue(0);

      await service.getOverdueTasks(TENANT_ID, 1, 20);

      expect(mockPrisma.behaviourTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenant_id: TENANT_ID,
            status: 'overdue',
          },
          orderBy: { due_date: 'asc' },
        }),
      );
    });

    it('should include assigned_to user info', async () => {
      mockPrisma.behaviourTask.findMany.mockResolvedValue([]);
      mockPrisma.behaviourTask.count.mockResolvedValue(0);

      await service.getOverdueTasks(TENANT_ID, 1, 10);

      expect(mockPrisma.behaviourTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            assigned_to: {
              select: { id: true, first_name: true, last_name: true },
            },
          },
        }),
      );
    });
  });

  // ─── getTaskStats ─────────────────────────────────────────────────────

  describe('getTaskStats', () => {
    it('should return counts for pending, overdue, and completed today', async () => {
      mockPrisma.behaviourTask.count
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(2) // overdue
        .mockResolvedValueOnce(3); // completedToday

      const result = await service.getTaskStats(TENANT_ID);

      expect(result).toEqual({
        pending: 5,
        overdue: 2,
        completed_today: 3,
      });
      expect(mockPrisma.behaviourTask.count).toHaveBeenCalledTimes(3);
    });

    it('should use correct status filters for each count', async () => {
      mockPrisma.behaviourTask.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      await service.getTaskStats(TENANT_ID);

      const calls = mockPrisma.behaviourTask.count.mock.calls;

      // pending: in [pending, in_progress]
      expect(calls[0]![0]).toEqual({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          status: { in: ['pending', 'in_progress'] },
        }),
      });

      // overdue
      expect(calls[1]![0]).toEqual({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          status: 'overdue',
        }),
      });

      // completed today: completed with completed_at >= today start
      expect(calls[2]![0]).toEqual({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          status: 'completed',
          completed_at: { gte: expect.any(Date) },
        }),
      });
    });
  });

  // ─── updateTask ───────────────────────────────────────────────────────

  describe('updateTask', () => {
    it('should update priority, due_date, and assigned_to', async () => {
      const task = { id: TASK_ID, tenant_id: TENANT_ID, status: 'pending' };
      mockPrisma.behaviourTask.findFirst.mockResolvedValue(task);
      mockPrisma.behaviourTask.update.mockResolvedValue({
        ...task,
        priority: 'high',
      });

      await service.updateTask(TENANT_ID, TASK_ID, USER_ID, {
        priority: 'high',
        assigned_to_id: 'user-2',
        due_date: '2026-04-01',
      });

      expect(mockPrisma.behaviourTask.update).toHaveBeenCalledWith({
        where: { id: TASK_ID },
        data: expect.objectContaining({
          priority: 'high',
          assigned_to_id: 'user-2',
        }),
      });
    });

    it('should throw NotFoundException for missing task', async () => {
      mockPrisma.behaviourTask.findFirst.mockResolvedValue(null);

      await expect(
        service.updateTask(TENANT_ID, 'nonexistent', USER_ID, {
          priority: 'high',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should only include provided fields in update data', async () => {
      const task = { id: TASK_ID, tenant_id: TENANT_ID };
      mockPrisma.behaviourTask.findFirst.mockResolvedValue(task);
      mockPrisma.behaviourTask.update.mockResolvedValue(task);

      await service.updateTask(TENANT_ID, TASK_ID, USER_ID, {
        description: 'Updated description',
      });

      const updateCall = mockPrisma.behaviourTask.update.mock.calls[0]![0]! as {
        data: Record<string, unknown>;
      };
      expect(updateCall.data).toHaveProperty('description', 'Updated description');
      expect(updateCall.data).not.toHaveProperty('priority');
      expect(updateCall.data).not.toHaveProperty('assigned_to_id');
    });
  });
});
