import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import type { InitiateSealDto, RejectSealDto, SealStatusResponse } from '@school/shared/behaviour';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';

import { PRISMA_TO_STATUS } from './safeguarding-enum-maps';

@Injectable()
export class SafeguardingSealService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // ─── Initiate Seal ──────────────────────────────────────────────────────

  async initiateSeal(tenantId: string, userId: string, concernId: string, dto: InitiateSealDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const concern = await db.safeguardingConcern.findFirst({
        where: { id: concernId, tenant_id: tenantId },
      });
      if (!concern) {
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: 'Safeguarding concern not found',
        });
      }

      const status = PRISMA_TO_STATUS[concern.status] ?? concern.status;
      if (status !== 'resolved') {
        throw new BadRequestException({
          code: 'SEAL_REQUIRES_RESOLVED',
          message: 'Concern must be resolved before sealing',
        });
      }

      if (concern.sealed_by_id) {
        throw new BadRequestException({
          code: 'SEAL_ALREADY_INITIATED',
          message: 'Seal has already been initiated',
        });
      }

      await db.safeguardingConcern.update({
        where: { id: concernId },
        data: {
          sealed_by_id: userId,
          sealed_reason: dto.reason,
        },
      });

      // Create task for second seal holder (assigned to initiator — they route it to the second seal holder)
      await db.behaviourTask.create({
        data: {
          tenant_id: tenantId,
          task_type: 'safeguarding_action' as $Enums.BehaviourTaskType,
          entity_type: 'safeguarding_concern' as $Enums.BehaviourTaskEntityType,
          entity_id: concernId,
          title: `Seal approval required: ${concern.concern_number}`,
          description: `A request to seal safeguarding concern ${concern.concern_number} requires dual-control approval from a second safeguarding.seal holder.`,
          priority: 'high' as $Enums.TaskPriority,
          status: 'pending' as $Enums.BehaviourTaskStatus,
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          assigned_to_id: userId,
          created_by_id: userId,
        },
      });

      await db.safeguardingAction.create({
        data: {
          tenant_id: tenantId,
          concern_id: concernId,
          action_by_id: userId,
          action_type: 'status_changed' as $Enums.SafeguardingActionType,
          description: `Seal initiated: ${dto.reason}`,
          metadata: {
            action: 'seal_initiated',
            initiated_by: userId,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return { data: { id: concernId, seal_initiated: true } };
    }) as Promise<{ data: { id: string; seal_initiated: boolean } }>;
  }

  // ─── Approve Seal ───────────────────────────────────────────────────────

  async approveSeal(tenantId: string, userId: string, concernId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const concern = await db.safeguardingConcern.findFirst({
        where: { id: concernId, tenant_id: tenantId },
      });
      if (!concern) {
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: 'Safeguarding concern not found',
        });
      }

      if (!concern.sealed_by_id) {
        throw new BadRequestException({
          code: 'SEAL_NOT_INITIATED',
          message: 'Seal has not been initiated',
        });
      }

      if (concern.sealed_by_id === userId) {
        throw new BadRequestException({
          code: 'DUAL_CONTROL_VIOLATION',
          message: 'Seal approval requires a different user than the initiator',
        });
      }

      const status = PRISMA_TO_STATUS[concern.status] ?? concern.status;
      if (status !== 'resolved') {
        throw new BadRequestException({
          code: 'SEAL_REQUIRES_RESOLVED',
          message: 'Concern must be in resolved status to approve seal',
        });
      }

      await db.safeguardingConcern.update({
        where: { id: concernId },
        data: {
          status: 'sealed' as $Enums.SafeguardingStatus,
          sealed_at: new Date(),
          seal_approved_by_id: userId,
        },
      });

      await db.safeguardingAction.create({
        data: {
          tenant_id: tenantId,
          concern_id: concernId,
          action_by_id: userId,
          action_type: 'status_changed' as $Enums.SafeguardingActionType,
          description: 'Concern sealed (dual-control approved)',
          metadata: {
            from: 'resolved',
            to: 'sealed',
            initiated_by: concern.sealed_by_id,
            approved_by: userId,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      // Complete the seal approval task
      await db.behaviourTask.updateMany({
        where: {
          tenant_id: tenantId,
          entity_type: 'safeguarding_concern' as $Enums.BehaviourTaskEntityType,
          entity_id: concernId,
          title: { contains: 'Seal approval required' },
          status: {
            in: [
              'pending' as $Enums.BehaviourTaskStatus,
              'in_progress' as $Enums.BehaviourTaskStatus,
            ],
          },
        },
        data: { status: 'completed' as $Enums.BehaviourTaskStatus, completed_at: new Date() },
      });

      void this.auditLogService.write(
        tenantId,
        userId,
        'safeguarding_concern',
        concernId,
        'safeguarding_concern_sealed',
        { initiated_by: concern.sealed_by_id, approved_by: userId },
        null,
      );

      return { data: { id: concernId, sealed: true } };
    }) as Promise<{ data: { id: string; sealed: boolean } }>;
  }

  // ─── Reject Seal ────────────────────────────────────────────────────────

  async rejectSeal(tenantId: string, userId: string, concernId: string, dto: RejectSealDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const concern = await db.safeguardingConcern.findFirst({
        where: { id: concernId, tenant_id: tenantId },
      });
      if (!concern) {
        throw new NotFoundException({
          code: 'CONCERN_NOT_FOUND',
          message: 'Safeguarding concern not found',
        });
      }

      if (!concern.sealed_by_id) {
        throw new BadRequestException({
          code: 'SEAL_NOT_INITIATED',
          message: 'No seal request is pending for this concern',
        });
      }

      if (concern.sealed_at) {
        throw new BadRequestException({
          code: 'SEAL_ALREADY_APPLIED',
          message: 'Concern is already sealed; sealing is irreversible',
        });
      }

      if (concern.sealed_by_id === userId) {
        throw new BadRequestException({
          code: 'DUAL_CONTROL_VIOLATION',
          message: 'Rejection must come from a different user than the initiator',
        });
      }

      const initiator = concern.sealed_by_id;

      await db.safeguardingConcern.update({
        where: { id: concernId },
        data: {
          sealed_by_id: null,
          sealed_reason: null,
        },
      });

      await db.safeguardingAction.create({
        data: {
          tenant_id: tenantId,
          concern_id: concernId,
          action_by_id: userId,
          action_type: 'status_changed' as $Enums.SafeguardingActionType,
          description: `Seal request rejected: ${dto.reason}`,
          metadata: {
            action: 'seal_rejected',
            initiated_by: initiator,
            rejected_by: userId,
            reason: dto.reason,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      await db.behaviourTask.updateMany({
        where: {
          tenant_id: tenantId,
          entity_type: 'safeguarding_concern' as $Enums.BehaviourTaskEntityType,
          entity_id: concernId,
          title: { contains: 'Seal approval required' },
          status: {
            in: [
              'pending' as $Enums.BehaviourTaskStatus,
              'in_progress' as $Enums.BehaviourTaskStatus,
            ],
          },
        },
        data: {
          status: 'cancelled' as $Enums.BehaviourTaskStatus,
          completed_at: new Date(),
        },
      });

      void this.auditLogService.write(
        tenantId,
        userId,
        'safeguarding_concern',
        concernId,
        'safeguarding_seal_rejected',
        { initiated_by: initiator, rejected_by: userId, reason: dto.reason },
        null,
      );

      return { data: { id: concernId, seal_rejected: true } };
    }) as Promise<{ data: { id: string; seal_rejected: boolean } }>;
  }

  // ─── Seal Status ────────────────────────────────────────────────────────

  async getSealStatus(tenantId: string, concernId: string): Promise<SealStatusResponse> {
    const concern = await this.prisma.safeguardingConcern.findFirst({
      where: { id: concernId, tenant_id: tenantId },
      select: {
        id: true,
        sealed_at: true,
        sealed_by_id: true,
        sealed_reason: true,
        seal_approved_by_id: true,
      },
    });

    if (!concern) {
      throw new NotFoundException({
        code: 'CONCERN_NOT_FOUND',
        message: 'Safeguarding concern not found',
      });
    }

    let state: SealStatusResponse['state'] = 'not_initiated';
    if (concern.sealed_at) {
      state = 'sealed';
    } else if (concern.sealed_by_id) {
      state = 'pending_approval';
    }

    return {
      concern_id: concern.id,
      state,
      initiated_by_id: concern.sealed_by_id,
      initiated_reason: concern.sealed_reason,
      approved_by_id: concern.seal_approved_by_id,
      sealed_at: concern.sealed_at?.toISOString() ?? null,
    };
  }
}
