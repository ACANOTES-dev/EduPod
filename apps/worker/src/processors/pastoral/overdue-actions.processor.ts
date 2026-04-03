import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import {
  SYSTEM_USER_SENTINEL,
  TenantAwareJob,
  TenantJobPayload,
} from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export type OverdueActionsPayload = TenantJobPayload;

// ─── Job name ─────────────────────────────────────────────────────────────────

export const OVERDUE_ACTIONS_JOB = 'pastoral:overdue-actions';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PASTORAL, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class OverdueActionsProcessor extends WorkerHost {
  private readonly logger = new Logger(OverdueActionsProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<OverdueActionsPayload>): Promise<void> {
    if (job.name !== OVERDUE_ACTIONS_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(`Processing ${OVERDUE_ACTIONS_JOB} — tenant ${tenant_id}`);

    const tenantJob = new OverdueActionsTenantJob(this.prisma);
    await tenantJob.execute(job.data);

    this.logger.log(
      `Completed ${OVERDUE_ACTIONS_JOB} — tenant ${tenant_id}: ` +
        `${tenantJob.meetingActionsMarked} meeting action(s) + ` +
        `${tenantJob.interventionActionsMarked} intervention action(s) marked overdue`,
    );
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class OverdueActionsTenantJob extends TenantAwareJob<OverdueActionsPayload> {
  private readonly logger = new Logger(OverdueActionsTenantJob.name);

  /** Count of SST meeting actions marked overdue (read after execute). */
  public meetingActionsMarked = 0;

  /** Count of intervention actions marked overdue (read after execute). */
  public interventionActionsMarked = 0;

  protected async processJob(data: OverdueActionsPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id } = data;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // ── 1. SST Meeting Actions ──────────────────────────────────────────────

    const overdueMeetingActions = await tx.sstMeetingAction.findMany({
      where: {
        tenant_id,
        status: { in: ['pc_pending', 'pc_in_progress'] },
        due_date: { lt: today },
      },
      select: {
        id: true,
        assigned_to_user_id: true,
        due_date: true,
        student_id: true,
      },
    });

    for (const action of overdueMeetingActions) {
      // Update status to overdue
      await tx.sstMeetingAction.update({
        where: { id: action.id },
        data: { status: 'pc_overdue' },
      });

      // Calculate days overdue
      const daysOverdue = Math.floor(
        (today.getTime() - action.due_date.getTime()) / (24 * 60 * 60 * 1000),
      );

      // Write pastoral_event: action_overdue
      await tx.pastoralEvent.create({
        data: {
          tenant_id,
          event_type: 'action_overdue',
          entity_type: 'meeting',
          entity_id: action.id,
          student_id: action.student_id,
          actor_user_id: SYSTEM_USER_SENTINEL,
          tier: 2,
          payload: {
            action_id: action.id,
            assigned_to_user_id: action.assigned_to_user_id,
            due_date: action.due_date.toISOString().slice(0, 10),
            days_overdue: daysOverdue,
          } satisfies Prisma.InputJsonValue as Prisma.InputJsonValue,
        },
      });
    }

    this.meetingActionsMarked = overdueMeetingActions.length;

    if (overdueMeetingActions.length > 0) {
      this.logger.log(
        `Marked ${overdueMeetingActions.length} SST meeting action(s) as overdue for tenant ${tenant_id}`,
      );
    }

    // ── 2. Pastoral Intervention Actions ────────────────────────────────────
    // Shared with SW-2B. If SW-2B is not yet implemented, the table exists
    // but has no data — this query safely returns zero rows.

    const overdueInterventionActions = await tx.pastoralInterventionAction.findMany({
      where: {
        tenant_id,
        status: { in: ['pc_pending', 'pc_in_progress'] },
        due_date: { lt: today },
      },
      select: {
        id: true,
        assigned_to_user_id: true,
        due_date: true,
        intervention: {
          select: { student_id: true },
        },
      },
    });

    for (const action of overdueInterventionActions) {
      // Update status to overdue
      await tx.pastoralInterventionAction.update({
        where: { id: action.id },
        data: { status: 'pc_overdue' },
      });

      // due_date is nullable on the model; skip if null (should not happen
      // given the WHERE filter, but satisfies type narrowing)
      const dueDate = action.due_date;
      if (!dueDate) continue;

      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (24 * 60 * 60 * 1000));

      // Write pastoral_event: action_overdue
      await tx.pastoralEvent.create({
        data: {
          tenant_id,
          event_type: 'action_overdue',
          entity_type: 'meeting',
          entity_id: action.id,
          student_id: action.intervention.student_id,
          actor_user_id: SYSTEM_USER_SENTINEL,
          tier: 2,
          payload: {
            action_id: action.id,
            assigned_to_user_id: action.assigned_to_user_id,
            due_date: dueDate.toISOString().slice(0, 10),
            days_overdue: daysOverdue,
          } satisfies Prisma.InputJsonValue as Prisma.InputJsonValue,
        },
      });
    }

    this.interventionActionsMarked = overdueInterventionActions.length;

    if (overdueInterventionActions.length > 0) {
      this.logger.log(
        `Marked ${overdueInterventionActions.length} intervention action(s) as overdue for tenant ${tenant_id}`,
      );
    }
  }
}
