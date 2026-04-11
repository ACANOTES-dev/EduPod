import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import type { AudienceDefinition } from '@school/shared/inbox';

import type { ConversationsService } from '../inbox/conversations/conversations.service';

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
 * ## Why `ModuleRef` instead of constructor injection
 *
 * The bridge lives in `CommunicationsModule` and needs to call
 * `ConversationsService` in `InboxModule`. A direct constructor injection
 * would force `CommunicationsModule` to import `InboxModule`, which in
 * turn would create a runtime circular dep chain:
 *
 *   AppModule → AdmissionsModule → FinanceModule → InboxModule →
 *   CommunicationsModule → ClassesModule → AdmissionsModule
 *
 * NestJS's `forwardRef` cannot resolve that deep a cycle — boot crashes
 * with "The module at index [4] of the ClassesModule 'imports' array is
 * undefined". Using `ModuleRef` in non-strict mode walks the globally
 * assembled DI container at runtime, sidestepping the static module
 * import edge entirely.
 *
 * `ConversationsService` is exported by `InboxModule`, so by the time
 * `AppModule` is fully constructed the global container has the token.
 * We resolve it lazily on first call and cache the reference.
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
  private conversations: ConversationsService | null = null;

  constructor(private readonly moduleRef: ModuleRef) {}

  async createBroadcastFromAnnouncement(
    input: CreateBroadcastFromAnnouncementInput,
  ): Promise<{ conversation_id: string; message_id: string }> {
    const audienceDefinition = this.translateLegacyScopeToDefinition(
      input.scope,
      input.targetPayload,
    );

    const conversations = await this.resolveConversations();
    const result = await conversations.createBroadcast({
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

  /**
   * Lazily resolve `ConversationsService` via `ModuleRef`. Non-strict
   * mode walks the full app DI container rather than the local
   * `CommunicationsModule` scope — this is the only thing that keeps
   * the circular module edge out of the static import graph.
   */
  private async resolveConversations(): Promise<ConversationsService> {
    const cached = this.conversations;
    if (cached) return cached;
    // Import lazily to avoid pulling the class at module evaluation time
    // (which would also poke at the DI graph and defeat the point).
    const { ConversationsService } = await import('../inbox/conversations/conversations.service');
    const resolved = this.moduleRef.get(ConversationsService, { strict: false });
    this.conversations = resolved;
    return resolved;
  }

  /**
   * Test-only seam: injects a pre-built `ConversationsService` so unit
   * tests can bypass `ModuleRef` entirely. Never call from production
   * code — the normal path lazily resolves from the DI container.
   */
  _setConversationsServiceForTesting(conversations: ConversationsService): void {
    this.conversations = conversations;
  }
}
