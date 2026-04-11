import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { NotificationChannel, Prisma, PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';

import { DISPATCH_NOTIFICATIONS_JOB } from './dispatch-notifications.processor';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface InboxDispatchChannelsPayload extends TenantJobPayload {
  conversation_id: string;
  message_id: string;
  sender_user_id: string;
  recipient_user_ids: string[];
  extra_channels: Array<'email' | 'sms' | 'whatsapp'>;
  disable_fallback: boolean;
}

// ─── Job name ────────────────────────────────────────────────────────────────

export const INBOX_DISPATCH_CHANNELS_JOB = 'inbox:dispatch-channels';

/**
 * InboxDispatchChannelsProcessor — Wave 3 impl 06.
 *
 * Fans out a newly-persisted inbox message to sender-selected external
 * channels (SMS / Email / WhatsApp). The inbox channel itself is already
 * delivered (the `conversation_participants` rows and the `messages` row
 * were written in the same RLS transaction as the conversation) — this
 * processor MUST NOT re-write the inbox.
 *
 * Implementation strategy (v1): reuse the existing `Notification` +
 * `DispatchNotificationsProcessor` pipeline rather than duplicating the
 * channel dispatchers. For each (recipient × extra_channel) pair we
 * insert a `notification` row with `source_entity_type = 'inbox_message'`
 * and `source_entity_id = <message_id>`, then enqueue a single
 * `communications:dispatch-notifications` job with the freshly created
 * notification IDs. The existing processor handles templates, contact
 * resolution, rate limits, fallback chains, and provider retries.
 */
@Processor(QUEUE_NAMES.NOTIFICATIONS, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class InboxDispatchChannelsProcessor extends WorkerHost {
  private readonly logger = new Logger(InboxDispatchChannelsProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<InboxDispatchChannelsPayload>): Promise<void> {
    if (job.name !== INBOX_DISPATCH_CHANNELS_JOB) {
      return;
    }

    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    const recipientCount = job.data.recipient_user_ids.length;
    const channelCount = job.data.extra_channels.length;

    if (recipientCount === 0 || channelCount === 0) {
      this.logger.log(
        `${INBOX_DISPATCH_CHANNELS_JOB} — nothing to dispatch (recipients=${recipientCount}, channels=${channelCount})`,
      );
      return;
    }

    this.logger.log(
      `Processing ${INBOX_DISPATCH_CHANNELS_JOB} — message=${job.data.message_id} recipients=${recipientCount} channels=${job.data.extra_channels.join(',')}`,
    );

    const dispatchJob = new InboxDispatchChannelsJob(this.prisma, this.notificationsQueue);
    await dispatchJob.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class InboxDispatchChannelsJob extends TenantAwareJob<InboxDispatchChannelsPayload> {
  private readonly logger = new Logger(InboxDispatchChannelsJob.name);

  constructor(
    prisma: PrismaClient,
    private readonly notificationsQueue: Queue,
  ) {
    super(prisma);
  }

  protected async processJob(data: InboxDispatchChannelsPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, conversation_id, message_id, recipient_user_ids, extra_channels } = data;

    // Pull the message body + sender for the notification payload so
    // downstream templates (announcement.published et al.) can render it.
    const message = await tx.message.findFirst({
      where: { id: message_id, tenant_id, conversation_id },
      select: {
        id: true,
        body: true,
        sender_user_id: true,
        created_at: true,
      },
    });

    if (!message) {
      this.logger.warn(`[inbox-dispatch] message ${message_id} not found — skipping dispatch`);
      return;
    }

    const conversation = await tx.conversation.findFirst({
      where: { id: conversation_id, tenant_id },
      select: { id: true, subject: true, kind: true },
    });

    if (!conversation) {
      this.logger.warn(
        `[inbox-dispatch] conversation ${conversation_id} not found — skipping dispatch`,
      );
      return;
    }

    // Bulk-create one notification row per (recipient × channel) pair.
    const payloadJson: Prisma.InputJsonValue = {
      conversation_id,
      message_id,
      message_preview: truncatePreview(message.body),
      subject: conversation.subject ?? null,
      conversation_kind: conversation.kind,
    };

    const rows: Prisma.NotificationCreateManyInput[] = [];
    for (const recipientId of recipient_user_ids) {
      for (const channel of extra_channels) {
        rows.push({
          tenant_id,
          recipient_user_id: recipientId,
          channel: channel as NotificationChannel,
          template_key: 'inbox.message',
          locale: 'en',
          status: 'queued',
          payload_json: payloadJson,
          source_entity_type: 'inbox_message',
          source_entity_id: message_id,
        });
      }
    }

    await tx.notification.createMany({ data: rows });

    // Fetch the freshly-created IDs so we can hand them to the existing
    // dispatch processor verbatim — filter by source/channel to stay
    // precise even under concurrency.
    const created = await tx.notification.findMany({
      where: {
        tenant_id,
        source_entity_type: 'inbox_message',
        source_entity_id: message_id,
        channel: { in: extra_channels as NotificationChannel[] },
        status: 'queued',
      },
      select: { id: true },
    });

    if (created.length === 0) {
      this.logger.warn(
        `[inbox-dispatch] message ${message_id} — no notification rows to dispatch after insert`,
      );
      return;
    }

    this.logger.log(
      `[inbox-dispatch] message ${message_id} — created ${created.length} notification rows, handing off to ${DISPATCH_NOTIFICATIONS_JOB}`,
    );

    // Hand off to the existing dispatcher. We do this OUTSIDE the Prisma
    // transaction would be ideal but BullMQ enqueue is non-transactional
    // anyway; the worst case is a delayed retry of the inner job, which
    // `DispatchNotificationsProcessor` handles idempotently via its
    // `status: { in: ['queued', 'failed'] }` guard.
    await this.notificationsQueue.add(
      DISPATCH_NOTIFICATIONS_JOB,
      {
        tenant_id,
        notification_ids: created.map((n: { id: string }) => n.id),
      },
      { attempts: 5, backoff: { type: 'exponential', delay: 3_000 } },
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PREVIEW_MAX_CHARS = 280;

function truncatePreview(body: string): string {
  if (body.length <= PREVIEW_MAX_CHARS) return body;
  return `${body.slice(0, PREVIEW_MAX_CHARS - 1)}…`;
}
