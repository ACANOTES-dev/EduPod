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

export interface InterventionReviewReminderPayload extends TenantJobPayload {
  intervention_id: string;
  case_id: string;
  student_id: string;
  next_review_date: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const INTERVENTION_REVIEW_REMINDER_JOB = 'pastoral:intervention-review-reminder';

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PASTORAL)
export class InterventionReviewReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(InterventionReviewReminderProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  ) {
    super();
  }

  async process(job: Job<InterventionReviewReminderPayload>): Promise<void> {
    if (job.name !== INTERVENTION_REVIEW_REMINDER_JOB) {
      return;
    }

    const { tenant_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${INTERVENTION_REVIEW_REMINDER_JOB} — intervention ${job.data.intervention_id}`,
    );

    const tenantJob = new InterventionReviewReminderTenantJob(this.prisma);
    await tenantJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class InterventionReviewReminderTenantJob extends TenantAwareJob<InterventionReviewReminderPayload> {
  private readonly logger = new Logger(InterventionReviewReminderTenantJob.name);

  protected async processJob(
    data: InterventionReviewReminderPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, intervention_id, case_id, student_id, next_review_date } = data;

    // 1. Load intervention and verify status is active
    const intervention = await tx.pastoralIntervention.findFirst({
      where: { id: intervention_id, tenant_id },
      select: {
        id: true,
        status: true,
        intervention_type: true,
        next_review_date: true,
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    if (!intervention) {
      this.logger.warn(
        `Intervention ${intervention_id} not found for tenant ${tenant_id} — skipping`,
      );
      return;
    }

    // Status in DB is the Prisma enum value "pc_active" — compare against that
    if (intervention.status !== 'pc_active') {
      this.logger.log(
        `Intervention ${intervention_id} is in terminal status "${intervention.status}" — skipping`,
      );
      return;
    }

    // 2. Verify next_review_date matches payload (if changed, skip — new job exists for new date)
    const currentReviewDate = intervention.next_review_date
      ? intervention.next_review_date.toISOString().split('T')[0]
      : null;
    const payloadReviewDate = next_review_date.split('T')[0];

    if (currentReviewDate !== payloadReviewDate) {
      this.logger.log(
        `Intervention ${intervention_id} review date changed from ${payloadReviewDate} to ${currentReviewDate} — skipping (new job exists)`,
      );
      return;
    }

    // 3. Load the case owner
    const pastoralCase = await tx.pastoralCase.findFirst({
      where: { id: case_id, tenant_id },
      select: { owner_user_id: true },
    });

    // 4. Load active SST members
    const sstMembers = await tx.sstMember.findMany({
      where: { tenant_id, active: true },
      select: { user_id: true },
    });

    // 5. Build recipient list (case owner + active SST members, deduplicated)
    const recipientUserIds = new Set<string>();

    if (pastoralCase?.owner_user_id) {
      recipientUserIds.add(pastoralCase.owner_user_id);
    }

    for (const member of sstMembers) {
      recipientUserIds.add(member.user_id);
    }

    const studentName = `${intervention.student.first_name} ${intervention.student.last_name}`;
    const interventionType = intervention.intervention_type;
    const message = `Intervention review due in 7 days for ${studentName} - ${interventionType}`;

    // 5a. Log notification for each recipient
    // The notification infrastructure may not be fully wired yet, so log the message
    for (const userId of recipientUserIds) {
      this.logger.log(
        `[Notification] Recipient ${userId}: ${message}`,
      );
    }

    // 6. Write pastoral_events entry
    await tx.pastoralEvent.create({
      data: {
        tenant_id,
        event_type: 'intervention_review_reminder_sent',
        entity_type: 'intervention',
        entity_id: intervention_id,
        student_id,
        actor_user_id: data.user_id || SYSTEM_USER_SENTINEL,
        tier: 1,
        payload: {
          intervention_id,
          case_id,
          student_id,
          intervention_type: interventionType,
          next_review_date,
          recipients: [...recipientUserIds],
          message,
        } satisfies Prisma.InputJsonValue as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Intervention review reminder sent for ${intervention_id} — ${recipientUserIds.size} recipient(s)`,
    );
  }
}
