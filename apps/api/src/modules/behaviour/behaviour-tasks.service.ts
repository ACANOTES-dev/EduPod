import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import {
  type BehaviourTaskStatus,
  type CancelTaskDto,
  type CompleteTaskDto,
  type ListTasksQuery,
  type UpdateTaskDto,
  isValidTaskTransition,
} from '@school/shared/behaviour';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';

@Injectable()
export class BehaviourTasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly historyService: BehaviourHistoryService,
  ) {}

  /**
   * List tasks with filters and pagination.
   */
  async listTasks(tenantId: string, query: ListTasksQuery) {
    const where: Prisma.BehaviourTaskWhereInput = {
      tenant_id: tenantId,
    };
    if (query.status) where.status = query.status as $Enums.BehaviourTaskStatus;
    if (query.priority) where.priority = query.priority as $Enums.TaskPriority;
    if (query.assigned_to_id) where.assigned_to_id = query.assigned_to_id;
    if (query.entity_type) where.entity_type = query.entity_type as $Enums.BehaviourTaskEntityType;
    if (query.entity_id) where.entity_id = query.entity_id;
    if (query.overdue_only) where.status = 'overdue' as $Enums.BehaviourTaskStatus;

    const [data, total] = await Promise.all([
      this.prisma.behaviourTask.findMany({
        where,
        orderBy: { due_date: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          assigned_to: {
            select: { id: true, first_name: true, last_name: true },
          },
          created_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourTask.count({ where }),
    ]);

    return {
      data,
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  /**
   * Get tasks assigned to the current user.
   */
  async getMyTasks(tenantId: string, userId: string, page: number, pageSize: number) {
    const where: Prisma.BehaviourTaskWhereInput = {
      tenant_id: tenantId,
      assigned_to_id: userId,
      status: {
        in: ['pending', 'in_progress', 'overdue'] as $Enums.BehaviourTaskStatus[],
      },
    };

    const [data, total] = await Promise.all([
      this.prisma.behaviourTask.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { due_date: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.behaviourTask.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  /**
   * Get a single task by ID.
   */
  async getTask(tenantId: string, id: string) {
    const task = await this.prisma.behaviourTask.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        assigned_to: {
          select: { id: true, first_name: true, last_name: true },
        },
        created_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });
    if (!task) {
      throw new NotFoundException({
        code: 'TASK_NOT_FOUND',
        message: 'Task not found',
      });
    }
    return task;
  }

  /**
   * Update task fields.
   */
  async updateTask(tenantId: string, id: string, _userId: string, dto: UpdateTaskDto) {
    const task = await this.prisma.behaviourTask.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!task) {
      throw new NotFoundException({
        code: 'TASK_NOT_FOUND',
        message: 'Task not found',
      });
    }

    return this.prisma.behaviourTask.update({
      where: { id },
      data: {
        ...(dto.assigned_to_id !== undefined ? { assigned_to_id: dto.assigned_to_id } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority as $Enums.TaskPriority } : {}),
        ...(dto.due_date !== undefined ? { due_date: new Date(dto.due_date) } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
      },
    });
  }

  /**
   * Mark a task as completed.
   */
  async completeTask(tenantId: string, id: string, userId: string, dto: CompleteTaskDto) {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const task = await db.behaviourTask.findFirst({
        where: { id, tenant_id: tenantId },
      });
      if (!task) {
        throw new NotFoundException({
          code: 'TASK_NOT_FOUND',
          message: 'Task not found',
        });
      }
      if (!isValidTaskTransition(task.status as BehaviourTaskStatus, 'completed')) {
        throw new BadRequestException({
          code: 'INVALID_TASK_TRANSITION',
          message: `Cannot complete a task with status "${task.status}"`,
        });
      }

      const updated = await db.behaviourTask.update({
        where: { id },
        data: {
          status: 'completed',
          completed_at: new Date(),
          completed_by_id: userId,
          completion_notes: dto.completion_notes ?? null,
        },
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'task',
        id,
        userId,
        'completed',
        { status: task.status },
        { status: 'completed' },
      );

      return updated;
    });
  }

  /**
   * Cancel a task with a reason.
   */
  async cancelTask(tenantId: string, id: string, userId: string, dto: CancelTaskDto) {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const task = await db.behaviourTask.findFirst({
        where: { id, tenant_id: tenantId },
      });
      if (!task) {
        throw new NotFoundException({
          code: 'TASK_NOT_FOUND',
          message: 'Task not found',
        });
      }
      if (!isValidTaskTransition(task.status as BehaviourTaskStatus, 'cancelled')) {
        throw new BadRequestException({
          code: 'INVALID_TASK_TRANSITION',
          message: `Cannot cancel a task with status "${task.status}"`,
        });
      }

      const updated = await db.behaviourTask.update({
        where: { id },
        data: { status: 'cancelled' },
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'task',
        id,
        userId,
        'cancelled',
        { status: task.status },
        { status: 'cancelled' },
        dto.reason,
      );

      return updated;
    });
  }

  /**
   * Get overdue tasks.
   */
  async getOverdueTasks(tenantId: string, page: number, pageSize: number) {
    const where: Prisma.BehaviourTaskWhereInput = {
      tenant_id: tenantId,
      status: 'overdue' as $Enums.BehaviourTaskStatus,
    };

    const [data, total] = await Promise.all([
      this.prisma.behaviourTask.findMany({
        where,
        orderBy: { due_date: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          assigned_to: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.behaviourTask.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  /**
   * Get task dashboard stats.
   */
  async getTaskStats(tenantId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [pending, overdue, completedToday] = await Promise.all([
      this.prisma.behaviourTask.count({
        where: {
          tenant_id: tenantId,
          status: {
            in: ['pending', 'in_progress'] as $Enums.BehaviourTaskStatus[],
          },
        },
      }),
      this.prisma.behaviourTask.count({
        where: {
          tenant_id: tenantId,
          status: 'overdue' as $Enums.BehaviourTaskStatus,
        },
      }),
      this.prisma.behaviourTask.count({
        where: {
          tenant_id: tenantId,
          status: 'completed' as $Enums.BehaviourTaskStatus,
          completed_at: { gte: todayStart },
        },
      }),
    ]);

    return { pending, overdue, completed_today: completedToday };
  }
}
