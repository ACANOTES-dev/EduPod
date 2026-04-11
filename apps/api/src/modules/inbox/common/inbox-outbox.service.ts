import { Injectable, Logger } from '@nestjs/common';

import type { InboxChannel } from '@school/shared/inbox';

/**
 * InboxOutboxService — v1 stub for the post-message side-effect fan-out.
 *
 * Impl 04 (Wave 2) needs to hand off two async jobs every time a new
 * message is persisted:
 *
 *   1. `inbox:dispatch-channels` — fan out SMS / Email / WhatsApp for
 *      any extra channels the sender selected. Inbox itself is already
 *      done (the participant rows exist), so this job covers only the
 *      opt-in external channels.
 *
 *   2. `safeguarding:scan-message` — run the tenant's keyword scanner
 *      against the new body and emit flags if matches.
 *
 * Both processors live in Wave 3 (impls 06, 07, 08). At impl 04 time,
 * no worker consumes these jobs, and the deployment matrix for impl 04
 * says "API restart only" — so we deliberately avoid touching the
 * BullMQ queue registry in this impl. Instead, this service captures
 * the hand-off points with structured logs, and Wave 3's first impl
 * (06) swaps the stub for the real BullMQ producer in a single edit.
 *
 * The service is deliberately injectable so `ConversationsService` and
 * `MessagesService` both depend on it by name, not by concrete type —
 * when Wave 3 replaces the body, no call site changes.
 *
 * Until then: **messages are still delivered** via inbox because the
 * `ConversationParticipant` rows are created inline in the same
 * transaction as the message. It is ONLY the extra-channel fan-out and
 * the safeguarding scan that are deferred.
 */

export interface DispatchChannelsPayload {
  tenant_id: string;
  conversation_id: string;
  message_id: string;
  sender_user_id: string;
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

  /**
   * Register that a new message has been persisted and needs downstream
   * side-effects. v1 logs the hand-off; Wave 3 impl 06 enqueues a real
   * BullMQ job on the inbox dispatcher queue.
   */
  notifyMessageCreated(payload: DispatchChannelsPayload): void {
    const nonInbox = payload.extra_channels.filter((c) => c !== 'inbox');
    if (nonInbox.length === 0) {
      this.logger.debug(
        `[outbox:stub] message ${payload.message_id} — inbox only, no extra channel dispatch needed`,
      );
      return;
    }
    this.logger.debug(
      `[outbox:stub] message ${payload.message_id} — extra channels ${nonInbox.join(',')} deferred to Wave 3 impl 06`,
    );
  }

  /**
   * Register that a new (or edited) message needs safeguarding scanning.
   * v1 logs the hand-off; Wave 3 impl 08 enqueues a real BullMQ job.
   */
  notifyNeedsSafeguardingScan(payload: SafeguardingScanPayload): void {
    this.logger.debug(
      `[outbox:stub] message ${payload.message_id} — safeguarding scan deferred to Wave 3 impl 08`,
    );
  }
}
