import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { $Enums } from '@prisma/client';

import {
  isValidTransition,
  type IncidentStatus,
  type StatusTransitionDto,
  type WithdrawIncidentDto,
} from '@school/shared/behaviour';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourHistoryService } from './behaviour-history.service';

// ─── Incident status transitions and withdrawal ───────────────────────────────

@Injectable()
export class BehaviourStatusService {
  private readonly logger = new Logger(BehaviourStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly historyService: BehaviourHistoryService,
  ) {}

  // ─── Status Transitions ─────────────────────────────────────────────────

  async transitionStatus(tenantId: string, id: string, userId: string, dto: StatusTransitionDto) {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const incident = await db.behaviourIncident.findFirst({
        where: { id, tenant_id: tenantId },
      });
      if (!incident) {
        throw new NotFoundException({
          code: 'INCIDENT_NOT_FOUND',
          message: 'Incident not found',
        });
      }

      if (!isValidTransition(incident.status as IncidentStatus, dto.status as IncidentStatus)) {
        throw new BadRequestException({
          code: 'INVALID_TRANSITION',
          message: `Cannot transition from "${incident.status}" to "${dto.status}"`,
        });
      }

      const updated = await db.behaviourIncident.update({
        where: { id },
        data: {
          status: dto.status as $Enums.IncidentStatus,
        },
      });

      await this.historyService.recordHistory(
        db,
        tenantId,
        'incident',
        id,
        userId,
        'status_changed',
        { status: incident.status },
        { status: dto.status },
        dto.reason,
      );

      return updated;
    });
  }

  // ─── Withdraw Incident ──────────────────────────────────────────────────

  async withdrawIncident(tenantId: string, id: string, userId: string, dto: WithdrawIncidentDto) {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return rlsClient.$transaction(
      async (tx) => {
        const db = tx as unknown as PrismaService;

        // 1. Load the incident, verify it exists
        const incident = await db.behaviourIncident.findFirst({
          where: { id, tenant_id: tenantId },
        });
        if (!incident) {
          throw new NotFoundException({
            code: 'INCIDENT_NOT_FOUND',
            message: 'Incident not found',
          });
        }

        // 2. Validate the status transition
        if (!isValidTransition(incident.status as IncidentStatus, 'withdrawn' as IncidentStatus)) {
          throw new BadRequestException({
            code: 'INVALID_TRANSITION',
            message: `Cannot transition from "${incident.status}" to "withdrawn"`,
          });
        }

        // 3. Update incident status to 'withdrawn'
        // 4. If parent_notification_status was 'pending', set to 'not_required'
        const parentNotifUpdate: Record<string, $Enums.ParentNotifStatus> =
          incident.parent_notification_status === 'pending'
            ? { parent_notification_status: 'not_required' }
            : {};

        await db.behaviourIncident.update({
          where: { id },
          data: {
            status: 'withdrawn' as $Enums.IncidentStatus,
            ...parentNotifUpdate,
          },
        });

        // 5. Cancel all pending/in_progress/overdue tasks linked to this incident
        await db.behaviourTask.updateMany({
          where: {
            tenant_id: tenantId,
            entity_type: 'incident',
            entity_id: id,
            status: { in: ['pending', 'in_progress', 'overdue'] },
          },
          data: { status: 'cancelled' },
        });

        // 6. Cancel pending_approval/scheduled sanctions linked to this incident
        const linkedSanctions = await db.behaviourSanction.findMany({
          where: {
            tenant_id: tenantId,
            incident_id: id,
            status: { in: ['pending_approval', 'scheduled'] },
          },
          select: { id: true },
        });

        if (linkedSanctions.length > 0) {
          const sanctionIds = linkedSanctions.map((s) => s.id);

          await db.behaviourSanction.updateMany({
            where: { id: { in: sanctionIds } },
            data: { status: 'cancelled' },
          });

          // Also cancel tasks linked to those sanctions
          await db.behaviourTask.updateMany({
            where: {
              tenant_id: tenantId,
              entity_type: 'sanction',
              entity_id: { in: sanctionIds },
              status: { in: ['pending', 'in_progress', 'overdue'] },
            },
            data: { status: 'cancelled' },
          });
        }

        // 7. Record history
        await this.historyService.recordHistory(
          db,
          tenantId,
          'incident',
          id,
          userId,
          'status_changed',
          {
            status: incident.status,
            parent_notification_status: incident.parent_notification_status,
          },
          {
            status: 'withdrawn',
            cancelled_tasks: true,
            cancelled_sanctions: linkedSanctions.length,
            ...(incident.parent_notification_status === 'pending'
              ? { parent_notification_status: 'not_required' }
              : {}),
          },
          dto.reason,
        );

        // 8. Return the updated incident with includes
        return db.behaviourIncident.findUnique({
          where: { id },
          include: {
            category: true,
            participants: true,
          },
        });
      },
      { timeout: 30000 },
    );
  }
}
