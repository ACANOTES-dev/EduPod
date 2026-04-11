import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import { inboxDispatchChannelsJobPayloadSchema } from '@school/shared';
import type { InboxChannel } from '@school/shared/inbox';

import { addValidatedJob } from '../../../common/utils/validated-job.util';

/**
 * InboxOutboxService — post-message side-effect fan-out.
 *
 * Every time ConversationsService (or MessagesService on edit) persists
 * a message, this service enqueues two BullMQ hand-offs:
 *
 *   1. INBOX_DISPATCH_CHANNELS_JOB (inbox:dispatch-channels) — wired by
 *      Wave 3 impl 06. Fans out SMS / Email / WhatsApp for any
 *      sender-selected extra channels on the notifications queue. Inbox
 *      itself is already delivered (participant rows and the message
 *      row were written inside the same transaction as the
 *      conversation), so the worker MUST NOT re-write to inbox.
 *
 *   2. SAFEGUARDING_SCAN_MESSAGE_JOB (safeguarding:scan-message) —
 *      wired by Wave 3 impl 08. Runs the tenant's keyword scanner
 *      against the new (or edited) body and upserts a MessageFlag on
 *      matches. Lives on the safeguarding queue.
 *
 * Both are fire-and-forget: callers invoke after the RLS transaction
 * has committed, and a queue outage must never roll back a successful
 * inbox delivery. Enqueue failures are logged as errors so ops can
 * alert on them.
 */

/** BullMQ job name for the inbox external-channel fan-out (Wave 3 impl 06). */
export const INBOX_DISPATCH_CHANNELS_JOB = 'inbox:dispatch-channels';

/** BullMQ job name for the safeguarding keyword scan (Wave 3 impl 08). */
export const SAFEGUARDING_SCAN_MESSAGE_JOB = 'safeguarding:scan-message';

export interface DispatchChannelsPayload {
  tenant_id: string;
  conversation_id: string;
  message_id: string;
  sender_user_id: string;
  /** Channels the sender picked, plus inbox (always included). */
  extra_channels: InboxChannel[];
  disable_fallback: boolean;
  recipient_user_ids: string[];
}

export interface SafeguardingScanPayload {
  tenant_id: string;
  conversation_id: string;
  message_id: string;
}

@Injectable()
export class InboxOutboxService {
  private readonly logger = new Logger(InboxOutboxService.name);

  constructor(
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    @InjectQueue('safeguarding') private readonly safeguardingQueue: Queue,
  ) {}

  /**
   * Called on every new message. If the sender picked any external
   * channels beyond inbox, enqueue the dispatch job. Otherwise no-op —
   * the inbox row is already delivered.
   */
  notifyMessageCreated(payload: DispatchChannelsPayload): void {
    const externalChannels = payload.extra_channels.filter(
      (c): c is 'email' | 'sms' | 'whatsapp' => c !== 'inbox',
    );

    if (externalChannels.length === 0) {
      this.logger.debug(
        `[outbox] message ${payload.message_id} — inbox only, no extra-channel dispatch`,
      );
      return;
    }

    if (payload.recipient_user_ids.length === 0) {
      this.logger.debug(
        `[outbox] message ${payload.message_id} — no recipients for extra channels`,
      );
      return;
    }

    void addValidatedJob(
      this.notificationsQueue,
      INBOX_DISPATCH_CHANNELS_JOB,
      inboxDispatchChannelsJobPayloadSchema,
      {
        tenant_id: payload.tenant_id,
        conversation_id: payload.conversation_id,
        message_id: payload.message_id,
        sender_user_id: payload.sender_user_id,
        recipient_user_ids: payload.recipient_user_ids,
        extra_channels: externalChannels,
        disable_fallback: payload.disable_fallback,
      },
      { attempts: 5, backoff: { type: 'exponential', delay: 3_000 } },
    ).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `[outbox] failed to enqueue ${INBOX_DISPATCH_CHANNELS_JOB} for message ${payload.message_id}: ${message}`,
      );
    });
  }

  /**
   * Enqueue a safeguarding scan for a newly-persisted (or edited)
   * message. The worker's SafeguardingScanMessageProcessor loads the
   * message body with RLS context, runs it through the
   * SAFEGUARDING_SCANNER token, and upserts a MessageFlag row on
   * matches. Wave 3 impl 08 ships the processor on the safeguarding
   * queue.
   */
  notifyNeedsSafeguardingScan(payload: SafeguardingScanPayload): void {
    void this.safeguardingQueue
      .add(
        SAFEGUARDING_SCAN_MESSAGE_JOB,
        {
          tenant_id: payload.tenant_id,
          conversation_id: payload.conversation_id,
          message_id: payload.message_id,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2_000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      )
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(
          `[outbox] failed to enqueue ${SAFEGUARDING_SCAN_MESSAGE_JOB} for message ${payload.message_id}: ${message}`,
        );
      });
  }
}
