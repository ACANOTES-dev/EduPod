import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';

import type { AudienceDefinition } from '@school/shared/inbox';

// Bridge needs the ConversationsService runtime token for DI — the
// `school/no-cross-module-internal-import` lint rule warns here, but the
// bridge is the single documented cross-module edge between the
// communications dispatcher and the inbox write path. Warning is left
// visible in line with impl 03's convention.
import { ConversationsService } from '../inbox/conversations/conversations.service';

/**
 * InboxBridgeService — the single hand-off point from legacy
 * `AnnouncementsService.executePublish` into the new inbox's
 * `ConversationsService.createBroadcast`.
 *
 * Impl 06 wires it so that every time a legacy announcement is published,
 * a matching broadcast conversation lands in all recipient inboxes. The
 * legacy SMS / Email / WhatsApp dispatch continues to run unchanged (that
 * path creates `Notification` rows and fires the existing dispatcher) —
 * the bridge passes `extraChannels: []` so there is no duplicate fan-out.
 *
 * The bridge lives in `CommunicationsModule` (not `InboxModule`) because
 * it is imported by `AnnouncementsService` there. It depends on
 * `ConversationsService` from `InboxModule` — the two modules import each
 * other via `forwardRef` to resolve the circular edge.
 */

export const LEGACY_ANNOUNCEMENT_SCOPES = [
  'school',
  'year_group',
  'class',
  'household',
  'custom',
] as const;

export type LegacyAnnouncementScope = (typeof LEGACY_ANNOUNCEMENT_SCOPES)[number];

export interface CreateBroadcastFromAnnouncementInput {
  tenantId: string;
  senderUserId: string;
  subject: string;
  body: string;
  scope: LegacyAnnouncementScope;
  targetPayload: Record<string, unknown>;
  allowReplies: boolean;
}

@Injectable()
export class InboxBridgeService {
  private readonly logger = new Logger(InboxBridgeService.name);

  constructor(
    @Inject(forwardRef(() => ConversationsService))
    private readonly conversations: ConversationsService,
  ) {}

  async createBroadcastFromAnnouncement(
    input: CreateBroadcastFromAnnouncementInput,
  ): Promise<{ conversation_id: string; message_id: string }> {
    const audienceDefinition = this.translateLegacyScopeToDefinition(
      input.scope,
      input.targetPayload,
    );

    const result = await this.conversations.createBroadcast({
      tenantId: input.tenantId,
      senderUserId: input.senderUserId,
      audienceDefinition,
      subject: input.subject,
      body: input.body,
      attachments: [],
      allowReplies: input.allowReplies,
      // Legacy path owns its own SMS / Email / WhatsApp fan-out via the
      // existing `Notification` row pipeline — the bridge must NOT ask
      // the conversations service to re-dispatch to those channels, or
      // recipients would receive two sends per channel.
      extraChannels: [],
      disableFallback: false,
    });

    this.logger.log(
      `[bridge] announcement → broadcast conversation ${result.conversation_id} ` +
        `(message ${result.message_id}) tenant=${input.tenantId} scope=${input.scope}`,
    );

    return {
      conversation_id: result.conversation_id,
      message_id: result.message_id,
    };
  }

  /**
   * Translate a legacy `AnnouncementScope` + target_payload pair into a
   * Wave-3 `AudienceDefinition` leaf for the audience engine. The
   * surface area is deliberately narrow — the five legacy scopes map to
   * five inbox providers one-to-one, no composition, no branching.
   */
  translateLegacyScopeToDefinition(
    scope: LegacyAnnouncementScope,
    targetPayload: Record<string, unknown>,
  ): AudienceDefinition {
    switch (scope) {
      case 'school':
        return { provider: 'parents_school', params: {} };
      case 'year_group':
        return {
          provider: 'year_group_parents',
          params: { year_group_ids: targetPayload.year_group_ids ?? [] },
        };
      case 'class':
        return {
          provider: 'class_parents',
          params: { class_ids: targetPayload.class_ids ?? [] },
        };
      case 'household':
        return {
          provider: 'household',
          params: { household_ids: targetPayload.household_ids ?? [] },
        };
      case 'custom':
        return {
          provider: 'handpicked',
          params: { user_ids: targetPayload.user_ids ?? [] },
        };
    }
  }
}
