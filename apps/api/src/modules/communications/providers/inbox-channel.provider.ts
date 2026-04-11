import { Injectable, Logger } from '@nestjs/common';

/**
 * InboxChannelProvider — the always-on fourth channel.
 *
 * The inbox row (conversation + participant + message) is always written
 * synchronously by `ConversationsService` inside the same transaction as
 * the message itself — before any dispatcher hand-off. By the time this
 * provider's `send()` runs, the inbox is already delivered.
 *
 * The provider exists so the dispatcher's channel surface is uniform
 * (every channel has a provider object) and so future "inbox push" /
 * mobile-push delivery has a single hook point. For v1 it is a no-op
 * beyond a debug log.
 */

export interface InboxChannelSendInput {
  tenantId: string;
  conversationId: string;
  messageId: string;
  recipientUserIds: string[];
}

export interface InboxChannelSendResult {
  status: 'delivered_synchronously';
  recipientCount: number;
}

@Injectable()
export class InboxChannelProvider {
  readonly key = 'inbox' as const;

  private readonly logger = new Logger(InboxChannelProvider.name);

  send(input: InboxChannelSendInput): InboxChannelSendResult {
    this.logger.debug(
      `[inbox-channel] message=${input.messageId} recipients=${input.recipientUserIds.length} — already written`,
    );
    return {
      status: 'delivered_synchronously',
      recipientCount: input.recipientUserIds.length,
    };
  }
}
