import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export type BehaviourAckRemindersPayload = TenantJobPayload;

// ─── Job name ────────────────────────────────────────────────────────────────

export const BEHAVIOUR_ACK_REMINDERS_JOB = 'behaviour:ack-reminders';

/** Reminders fire after this many days of no acknowledgement. */
const REMINDER_AGE_DAYS = 3;

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Finds parent acknowledgement rows sent more than 3 days ago without an
 * `acknowledged_at` timestamp, then writes an in-app reminder notification
 * to the parent user. Append-only: we NEVER mutate the existing
 * acknowledgement row — the reminder lives in the notifications table.
 *
 * Ack rows without a linked parent user (rare — contact-only parents)
 * are skipped.
 */
@Injectable()
export class BehaviourAckRemindersProcessor {
  private readonly logger = new Logger(BehaviourAckRemindersProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async process(job: Job<BehaviourAckRemindersPayload>): Promise<void> {
    if (job.name !== BEHAVIOUR_ACK_REMINDERS_JOB) {
      return;
    }

    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(`Processing ${BEHAVIOUR_ACK_REMINDERS_JOB} — tenant ${tenant_id}`);

    const reminderJob = new BehaviourAckRemindersJob(this.prisma);
    await reminderJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class BehaviourAckRemindersJob extends TenantAwareJob<BehaviourAckRemindersPayload> {
  private readonly logger = new Logger(BehaviourAckRemindersJob.name);

  protected async processJob(data: BehaviourAckRemindersPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id } = data;
    const now = new Date();
    const threshold = new Date(now.getTime() - REMINDER_AGE_DAYS * 24 * 60 * 60 * 1000);

    const stale = await tx.behaviourParentAcknowledgement.findMany({
      where: {
        tenant_id,
        acknowledged_at: null,
        sent_at: { lte: threshold },
      },
      include: {
        parent: { select: { user_id: true, status: true } },
      },
    });

    let remindersSent = 0;

    for (const ack of stale) {
      if (ack.parent?.status !== 'active' || !ack.parent.user_id) continue;

      // Idempotency: skip if we already sent a reminder notification for
      // this ack today.
      const startOfToday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const existingReminder = await tx.notification.findFirst({
        where: {
          tenant_id,
          recipient_user_id: ack.parent.user_id,
          template_key: 'wellbeing_ack_reminder',
          source_entity_type: 'behaviour_parent_acknowledgement',
          source_entity_id: ack.id,
          created_at: { gte: startOfToday },
        },
        select: { id: true },
      });
      if (existingReminder) continue;

      await tx.notification.create({
        data: {
          tenant_id,
          recipient_user_id: ack.parent.user_id,
          channel: 'in_app',
          template_key: 'wellbeing_ack_reminder',
          locale: 'en',
          status: 'delivered',
          payload_json: {
            event: 'reminder.acknowledgement',
            acknowledgement_id: ack.id,
            incident_id: ack.incident_id,
            sanction_id: ack.sanction_id,
            amendment_notice_id: ack.amendment_notice_id,
            sent_at: ack.sent_at.toISOString(),
            days_pending: REMINDER_AGE_DAYS,
          },
          source_entity_type: 'behaviour_parent_acknowledgement',
          source_entity_id: ack.id,
          delivered_at: now,
        },
      });

      remindersSent++;
    }

    this.logger.log(
      `Ack reminders complete for tenant ${tenant_id}: ${stale.length} stale row(s) scanned, ${remindersSent} reminder(s) sent`,
    );
  }
}
