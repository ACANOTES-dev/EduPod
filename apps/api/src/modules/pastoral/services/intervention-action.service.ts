import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { $Enums } from '@prisma/client';

import type {
  CreateInterventionActionDto,
  InterventionActionFilters,
  UpdateInterventionActionDto,
} from '@school/shared/pastoral';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface InterventionActionRow {
  id: string;
  tenant_id: string;
  intervention_id: string;
  description: string;
  assigned_to_user_id: string;
  frequency: string | null;
  start_date: Date;
  due_date: Date | null;
  completed_at: Date | null;
  completed_by_user_id: string | null;
  status: $Enums.PastoralActionStatus;
  created_at: Date;
  updated_at: Date;
}

// ─── State machine ──────────────────────────────────────────────────────────

const VALID_ACTION_TRANSITIONS: Record<string, string[]> = {
  pending: ['in_progress', 'completed', 'cancelled', 'overdue'],
  in_progress: ['completed', 'cancelled', 'overdue'],
  overdue: ['in_progress', 'completed', 'cancelled'],
};

const TERMINAL_ACTION_STATUSES: ReadonlySet<string> = new Set(['completed', 'cancelled']);

const STATUS_TO_PRISMA: Record<string, $Enums.PastoralActionStatus> = {
  pending: $Enums.PastoralActionStatus.pc_pending,
  in_progress: $Enums.PastoralActionStatus.pc_in_progress,
  completed: $Enums.PastoralActionStatus.pc_completed,
  overdue: $Enums.PastoralActionStatus.pc_overdue,
  cancelled: $Enums.PastoralActionStatus.pc_cancelled,
};

const PRISMA_TO_DISPLAY: Record<string, string> = {
  pc_pending: 'pending',
  pc_in_progress: 'in_progress',
  pc_completed: 'completed',
  pc_overdue: 'overdue',
  pc_cancelled: 'cancelled',
};

function toDisplayStatus(prismaStatus: $Enums.PastoralActionStatus): string {
  return PRISMA_TO_DISPLAY[prismaStatus as string] ?? (prismaStatus as string);
}

function toPrismaStatus(status: string): $Enums.PastoralActionStatus {
  const mapped = STATUS_TO_PRISMA[status];
  if (!mapped) {
    throw new BadRequestException({
      code: 'INVALID_ACTION_STATUS',
      message: `Invalid action status: "${status}"`,
    });
  }
  return mapped;
}

function isValidActionTransition(from: string, to: string): boolean {
  const allowed = VALID_ACTION_TRANSITIONS[from];
  return !!allowed && allowed.includes(to);
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class InterventionActionService {
  private readonly logger = new Logger(InterventionActionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── CREATE ACTION ──────────────────────────────────────────────────────────

  async createAction(
    tenantId: string,
    interventionId: string,
    data: CreateInterventionActionDto,
    actorUserId: string,
  ): Promise<InterventionActionRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const action = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 1. Validate parent intervention exists and is active
      const intervention = await db.pastoralIntervention.findFirst({
        where: { id: interventionId, tenant_id: tenantId },
        select: { id: true, status: true, student_id: true },
      });

      if (!intervention) {
        throw new NotFoundException({
          code: 'INTERVENTION_NOT_FOUND',
          message: `Intervention "${interventionId}" not found`,
        });
      }

      if (intervention.status !== $Enums.PastoralInterventionStatus.pc_active) {
        throw new ConflictException({
          code: 'INTERVENTION_NOT_ACTIVE',
          message: `Cannot add actions to intervention in status "${intervention.status as string}"`,
        });
      }

      // 2. Validate frequency/due_date combination
      if (data.frequency === 'once' && !data.due_date) {
        throw new BadRequestException({
          code: 'DUE_DATE_REQUIRED',
          message: 'due_date is required when frequency is "once"',
        });
      }

      // 3. Create action
      return db.pastoralInterventionAction.create({
        data: {
          tenant_id: tenantId,
          intervention_id: interventionId,
          description: data.description,
          assigned_to_user_id: data.assigned_to_user_id,
          frequency: data.frequency ?? 'once',
          start_date: new Date(data.start_date),
          due_date: data.due_date ? new Date(data.due_date) : null,
          status: $Enums.PastoralActionStatus.pc_pending,
        },
      });
    })) as InterventionActionRow;

    // Fire-and-forget: emit action_assigned event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'action_assigned',
      entity_type: 'intervention',
      entity_id: action.id,
      student_id: null,
      actor_user_id: actorUserId,
      tier: 1,
      payload: {
        action_id: action.id,
        source: 'intervention',
        intervention_id: interventionId,
        assigned_to_user_id: data.assigned_to_user_id,
        description: data.description,
        frequency: data.frequency ?? 'once',
        due_date: data.due_date ?? null,
      },
      ip_address: null,
    });

    return action;
  }

  // ─── UPDATE ACTION ──────────────────────────────────────────────────────────

  async updateAction(
    tenantId: string,
    actionId: string,
    data: UpdateInterventionActionDto,
    actorUserId: string,
  ): Promise<InterventionActionRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralInterventionAction.findFirst({
        where: { id: actionId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'ACTION_NOT_FOUND',
          message: `Action "${actionId}" not found`,
        });
      }

      const currentDisplayStatus = toDisplayStatus(existing.status);

      // If status transition is requested, validate the state machine
      if (data.status) {
        if (TERMINAL_ACTION_STATUSES.has(currentDisplayStatus)) {
          throw new ConflictException({
            code: 'INVALID_ACTION_STATUS_TRANSITION',
            message: `Cannot transition from terminal status "${currentDisplayStatus}"`,
          });
        }

        if (!isValidActionTransition(currentDisplayStatus, data.status)) {
          throw new ConflictException({
            code: 'INVALID_ACTION_STATUS_TRANSITION',
            message: `Cannot transition from "${currentDisplayStatus}" to "${data.status}"`,
          });
        }
      }

      const updateData: Record<string, unknown> = {};

      if (data.description !== undefined) {
        updateData.description = data.description;
      }
      if (data.due_date !== undefined) {
        updateData.due_date = data.due_date !== null ? new Date(data.due_date) : null;
      }
      if (data.status) {
        const newPrismaStatus = toPrismaStatus(data.status);
        updateData.status = newPrismaStatus;

        // If completing, set completed_at and completed_by
        if (data.status === 'completed') {
          updateData.completed_at = new Date();
          updateData.completed_by_user_id = actorUserId;
        }
      }

      const result = await db.pastoralInterventionAction.update({
        where: { id: actionId },
        data: updateData,
      });

      return result;
    })) as InterventionActionRow;

    // Fire-and-forget: emit event based on the action taken
    if (data.status === 'completed') {
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'action_completed',
        entity_type: 'intervention',
        entity_id: actionId,
        student_id: null,
        actor_user_id: actorUserId,
        tier: 1,
        payload: {
          action_id: actionId,
          completed_by_user_id: actorUserId,
        },
        ip_address: null,
      });
    }

    return updated;
  }

  // ─── COMPLETE ACTION (shortcut) ─────────────────────────────────────────────

  async completeAction(
    tenantId: string,
    actionId: string,
    actorUserId: string,
  ): Promise<InterventionActionRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const completed = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralInterventionAction.findFirst({
        where: { id: actionId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'ACTION_NOT_FOUND',
          message: `Action "${actionId}" not found`,
        });
      }

      const currentDisplayStatus = toDisplayStatus(existing.status);

      // Already completed
      if (currentDisplayStatus === 'completed') {
        throw new ConflictException({
          code: 'ACTION_ALREADY_COMPLETED',
          message: 'Action is already completed',
        });
      }

      // Validate transition is valid
      if (TERMINAL_ACTION_STATUSES.has(currentDisplayStatus)) {
        throw new ConflictException({
          code: 'INVALID_ACTION_STATUS_TRANSITION',
          message: `Cannot complete action in terminal status "${currentDisplayStatus}"`,
        });
      }

      if (!isValidActionTransition(currentDisplayStatus, 'completed')) {
        throw new ConflictException({
          code: 'INVALID_ACTION_STATUS_TRANSITION',
          message: `Cannot transition from "${currentDisplayStatus}" to "completed"`,
        });
      }

      return db.pastoralInterventionAction.update({
        where: { id: actionId },
        data: {
          status: $Enums.PastoralActionStatus.pc_completed,
          completed_at: new Date(),
          completed_by_user_id: actorUserId,
        },
      });
    })) as InterventionActionRow;

    // Fire-and-forget: emit action_completed event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'action_completed',
      entity_type: 'intervention',
      entity_id: actionId,
      student_id: null,
      actor_user_id: actorUserId,
      tier: 1,
      payload: {
        action_id: actionId,
        completed_by_user_id: actorUserId,
      },
      ip_address: null,
    });

    return completed;
  }

  // ─── LIST ACTIONS FOR INTERVENTION ──────────────────────────────────────────

  async listActionsForIntervention(
    tenantId: string,
    interventionId: string,
  ): Promise<InterventionActionRow[]> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralInterventionAction.findMany({
        where: { tenant_id: tenantId, intervention_id: interventionId },
        orderBy: { created_at: 'desc' },
      });
    })) as InterventionActionRow[];
  }

  // ─── LIST ALL ACTIONS (paginated) ───────────────────────────────────────────

  async listAllActions(
    tenantId: string,
    filter: InterventionActionFilters,
  ): Promise<{ data: InterventionActionRow[]; meta: PaginationMeta }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };

    if (filter.status) {
      where.status = toPrismaStatus(filter.status);
    }
    if (filter.assigned_to_user_id) {
      where.assigned_to_user_id = filter.assigned_to_user_id;
    }

    const [data, total] = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const items = await db.pastoralInterventionAction.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      });

      const count = await db.pastoralInterventionAction.count({ where });

      return [items, count];
    })) as [InterventionActionRow[], number];

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── LIST MY ACTIONS ────────────────────────────────────────────────────────

  async listMyActions(
    tenantId: string,
    userId: string,
    filter?: InterventionActionFilters,
  ): Promise<{ data: InterventionActionRow[]; meta: PaginationMeta }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const page = filter?.page ?? 1;
    const pageSize = filter?.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      assigned_to_user_id: userId,
    };

    if (filter?.status) {
      where.status = toPrismaStatus(filter.status);
    }

    const [data, total] = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const items = await db.pastoralInterventionAction.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      });

      const count = await db.pastoralInterventionAction.count({ where });

      return [items, count];
    })) as [InterventionActionRow[], number];

    return {
      data,
      meta: { page, pageSize, total },
    };
  }
}
