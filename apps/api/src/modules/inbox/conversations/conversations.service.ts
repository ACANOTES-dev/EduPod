import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

import type {
  AttachmentInput,
  AudienceDefinition,
  ConversationKind,
  InboxChannel,
  MessagingRole,
} from '@school/shared/inbox';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { AudienceResolutionService } from '../audience/audience-resolution.service';
import { AttachmentValidator } from '../common/attachment-validator';
import { InboxOutboxService } from '../common/inbox-outbox.service';
import { MessagingPolicyService, type PolicyDecision } from '../policy/messaging-policy.service';
import { RoleMappingService } from '../policy/role-mapping.service';

/**
 * ConversationsService — the core inbox service. Owns conversation
 * creation (direct / group / broadcast), message sends, replies, read
 * receipts, and the listing/read endpoints.
 *
 * Hard rules (PLAN §3, impl 04 doc):
 *
 *   - Every write routes through `MessagingPolicyService.canStartConversation`
 *     or `canReplyToConversation` — the policy engine is the single
 *     chokepoint. No bypass paths.
 *   - Every multi-row write runs inside `createRlsClient(...).$transaction`
 *     so RLS is enforced at the DB layer.
 *   - Direct conversations dedupe — a second "hi miss" message between
 *     the same two users appends to the existing thread.
 *   - Group sends hard-fail on any per-recipient denial. Broadcasts
 *     soft-filter (teacher → class_parents becomes just that teacher's
 *     reachable class parents, without throwing).
 *   - Broadcasts always persist both the definition AND a frozen
 *     `recipient_user_ids` snapshot. Participant rows are derived from
 *     the snapshot and become the source of truth for who can read.
 *   - A broadcast recipient reply (where the sender ticked `allow_replies`)
 *     spawns a private 1↔1 `direct` conversation between that recipient
 *     and the broadcast creator — the first time. Subsequent replies
 *     append to that spawned thread.
 *   - Inbox is always on. `extra_channels` is additive — even if a
 *     caller passes `['sms']`, the inbox rows are still written and
 *     `inbox` is added to the dispatcher payload.
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export type ExtraChannel = Exclude<InboxChannel, 'inbox'>;

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface InboxThreadSummary {
  id: string;
  kind: ConversationKind;
  subject: string | null;
  last_message_at: Date | null;
  frozen_at: Date | null;
  unread_count: number;
  muted_at: Date | null;
  archived_at: Date | null;
  preview_body: string | null;
  preview_sender_user_id: string | null;
  preview_created_at: Date | null;
}

export interface ThreadMessageView {
  id: string;
  sender_user_id: string;
  body: string;
  created_at: Date;
  edited_at: Date | null;
  deleted_at: Date | null;
  attachments: Array<{
    id: string;
    storage_key: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
  }>;
  /**
   * Only populated when the requesting user is a school-staff sender
   * and this is one of THEIR messages. Omitted entirely from responses
   * to parent and student roles.
   */
  read_state?: { read_count: number; total_recipients: number } | null;
}

export interface ThreadDetail {
  id: string;
  kind: ConversationKind;
  subject: string | null;
  allow_replies: boolean;
  frozen_at: Date | null;
  frozen_by_user_id: string | null;
  freeze_reason: string | null;
  created_by_user_id: string;
  created_at: Date;
  participants: Array<{
    user_id: string;
    role_at_join: MessagingRole;
    joined_at: Date;
    /**
     * Other participants' per-message read timestamps. Only returned
     * to staff requesters; omitted for parent/student to avoid
     * leaking who-read-what.
     */
    last_read_at?: Date | null;
  }>;
  messages: Paginated<ThreadMessageView>;
}

export interface CreateDirectInput {
  tenantId: string;
  senderUserId: string;
  recipientUserId: string;
  body: string;
  attachments: AttachmentInput[];
  extraChannels: ExtraChannel[];
  disableFallback: boolean;
}

export interface CreateGroupInput {
  tenantId: string;
  senderUserId: string;
  recipientUserIds: string[];
  subject: string;
  body: string;
  attachments: AttachmentInput[];
  extraChannels: ExtraChannel[];
  disableFallback: boolean;
}

export interface CreateBroadcastInput {
  tenantId: string;
  senderUserId: string;
  audienceDefinition?: AudienceDefinition;
  savedAudienceId?: string;
  subject: string | null;
  body: string;
  attachments: AttachmentInput[];
  allowReplies: boolean;
  extraChannels: ExtraChannel[];
  disableFallback: boolean;
}

export interface SendReplyInput {
  tenantId: string;
  senderUserId: string;
  conversationId: string;
  body: string;
  attachments: AttachmentInput[];
  extraChannels: ExtraChannel[];
  disableFallback: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: MessagingPolicyService,
    private readonly audience: AudienceResolutionService,
    private readonly roleMapping: RoleMappingService,
    private readonly outbox: InboxOutboxService,
    private readonly attachments: AttachmentValidator,
  ) {}

  // ─── Creation — direct ──────────────────────────────────────────────────────

  async createDirect(input: CreateDirectInput): Promise<{
    conversation_id: string;
    message_id: string;
    deduped: boolean;
  }> {
    const {
      tenantId,
      senderUserId,
      recipientUserId,
      body,
      attachments,
      extraChannels,
      disableFallback,
    } = input;

    if (senderUserId === recipientUserId) {
      throw new BadRequestException({
        code: 'CANNOT_MESSAGE_SELF',
        message: 'Cannot start a conversation with yourself',
      });
    }

    this.attachments.validateBatch(tenantId, attachments);

    const decision = await this.policy.canStartConversation({
      tenantId,
      senderUserId,
      recipientUserIds: [recipientUserId],
      conversationKind: 'direct',
    });
    denyIfNotAllowed(decision);

    const senderRole = await this.roleMapping.resolveMessagingRole(tenantId, senderUserId);
    if (!senderRole) {
      throw new ForbiddenException({
        code: 'UNKNOWN_SENDER_ROLE',
        message: 'Sender has no active messaging role in this tenant',
      });
    }
    const recipientRole = await this.roleMapping.resolveMessagingRole(tenantId, recipientUserId);
    if (!recipientRole) {
      throw new ForbiddenException({
        code: 'UNKNOWN_RECIPIENT_ROLE',
        message: 'Recipient has no active messaging role in this tenant',
      });
    }

    // Dedupe: find an existing direct between these two users where at
    // least one side is not archived. A "zombie" archived-by-both pair
    // is allowed to spawn a fresh thread.
    const existing = await this.findActiveDirectBetween(tenantId, senderUserId, recipientUserId);

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: senderUserId });

    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      let conversationId: string;
      let deduped = false;

      if (existing) {
        conversationId = existing.id;
        deduped = true;
      } else {
        const created = await tx.conversation.create({
          data: {
            tenant_id: tenantId,
            kind: 'direct',
            subject: null,
            created_by_user_id: senderUserId,
            allow_replies: true,
          },
          select: { id: true },
        });
        conversationId = created.id;

        await tx.conversationParticipant.createMany({
          data: [
            {
              tenant_id: tenantId,
              conversation_id: conversationId,
              user_id: senderUserId,
              role_at_join: senderRole,
              unread_count: 0,
            },
            {
              tenant_id: tenantId,
              conversation_id: conversationId,
              user_id: recipientUserId,
              role_at_join: recipientRole,
              unread_count: 0,
            },
          ],
        });
      }

      const { message_id } = await this.appendMessage(tx, {
        tenantId,
        conversationId,
        senderUserId,
        body,
        attachments,
        disableFallback,
      });

      // For dedupe case and fresh case alike: increment unread for the
      // other side, reset sender's cursor, update last_message_at.
      await tx.conversationParticipant.updateMany({
        where: {
          conversation_id: conversationId,
          user_id: { not: senderUserId },
        },
        data: { unread_count: { increment: 1 }, archived_at: null },
      });
      await tx.conversationParticipant.updateMany({
        where: { conversation_id: conversationId, user_id: senderUserId },
        data: { unread_count: 0, last_read_at: new Date(), archived_at: null },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { last_message_at: new Date() },
      });

      this.fanOutSideEffects({
        tenantId,
        conversationId,
        messageId: message_id,
        senderUserId,
        recipientUserIds: [recipientUserId],
        extraChannels,
        disableFallback,
      });

      return { conversation_id: conversationId, message_id, deduped };
    });
  }

  // ─── Creation — group ───────────────────────────────────────────────────────

  async createGroup(input: CreateGroupInput): Promise<{
    conversation_id: string;
    message_id: string;
  }> {
    const {
      tenantId,
      senderUserId,
      recipientUserIds,
      subject,
      body,
      attachments,
      extraChannels,
      disableFallback,
    } = input;

    if (recipientUserIds.length < 2 || recipientUserIds.length > 49) {
      throw new BadRequestException({
        code: 'GROUP_SIZE_OUT_OF_RANGE',
        message: 'group conversations require 2–49 recipients (+ the sender)',
      });
    }
    if (recipientUserIds.includes(senderUserId)) {
      throw new BadRequestException({
        code: 'SENDER_IN_RECIPIENTS',
        message: 'sender must not be listed in recipient_user_ids',
      });
    }
    const uniqueRecipients = Array.from(new Set(recipientUserIds));
    if (uniqueRecipients.length !== recipientUserIds.length) {
      throw new BadRequestException({
        code: 'DUPLICATE_RECIPIENTS',
        message: 'recipient_user_ids contains duplicates',
      });
    }
    const trimmedSubject = subject.trim();
    if (trimmedSubject.length === 0 || trimmedSubject.length > 255) {
      throw new BadRequestException({
        code: 'SUBJECT_INVALID',
        message: 'group subject is required (1–255 chars)',
      });
    }

    this.attachments.validateBatch(tenantId, attachments);

    // Hard-fail on any denial — group sends don't silently drop anyone.
    const decision = await this.policy.canStartConversation({
      tenantId,
      senderUserId,
      recipientUserIds: uniqueRecipients,
      conversationKind: 'group',
    });
    denyIfNotAllowed(decision);

    const senderRole = await this.roleMapping.resolveMessagingRole(tenantId, senderUserId);
    if (!senderRole) {
      throw new ForbiddenException({
        code: 'UNKNOWN_SENDER_ROLE',
        message: 'Sender has no active messaging role in this tenant',
      });
    }
    const recipientRoles = await this.roleMapping.resolveMessagingRolesBatch(
      tenantId,
      uniqueRecipients,
    );

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: senderUserId });

    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const created = await tx.conversation.create({
        data: {
          tenant_id: tenantId,
          kind: 'group',
          subject: trimmedSubject,
          created_by_user_id: senderUserId,
          allow_replies: true,
        },
        select: { id: true },
      });
      const conversationId = created.id;

      const participants: Prisma.ConversationParticipantCreateManyInput[] = [
        {
          tenant_id: tenantId,
          conversation_id: conversationId,
          user_id: senderUserId,
          role_at_join: senderRole,
          unread_count: 0,
        },
      ];
      for (const id of uniqueRecipients) {
        const role = recipientRoles.get(id);
        if (!role) {
          // Defensive — the policy check should already have rejected
          // this, but if it fell through due to caching, we refuse the
          // whole send rather than create a partial group.
          throw new ForbiddenException({
            code: 'UNKNOWN_RECIPIENT_ROLE',
            message: `Recipient ${id} has no active messaging role`,
          });
        }
        participants.push({
          tenant_id: tenantId,
          conversation_id: conversationId,
          user_id: id,
          role_at_join: role,
          unread_count: 1,
        });
      }
      await tx.conversationParticipant.createMany({ data: participants });

      const { message_id } = await this.appendMessage(tx, {
        tenantId,
        conversationId,
        senderUserId,
        body,
        attachments,
        disableFallback,
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { last_message_at: new Date() },
      });

      this.fanOutSideEffects({
        tenantId,
        conversationId,
        messageId: message_id,
        senderUserId,
        recipientUserIds: uniqueRecipients,
        extraChannels,
        disableFallback,
      });

      return { conversation_id: conversationId, message_id };
    });
  }

  // ─── Creation — broadcast ───────────────────────────────────────────────────

  async createBroadcast(input: CreateBroadcastInput): Promise<{
    conversation_id: string;
    message_id: string;
    resolved_recipient_count: number;
    original_recipient_count: number;
  }> {
    const {
      tenantId,
      senderUserId,
      audienceDefinition,
      savedAudienceId,
      subject,
      body,
      attachments,
      allowReplies,
      extraChannels,
      disableFallback,
    } = input;

    if (!audienceDefinition && !savedAudienceId) {
      throw new BadRequestException({
        code: 'AUDIENCE_REQUIRED',
        message: 'broadcast requires audience or saved_audience_id',
      });
    }

    const senderRole = await this.roleMapping.resolveMessagingRole(tenantId, senderUserId);
    if (!senderRole) {
      throw new ForbiddenException({
        code: 'UNKNOWN_SENDER_ROLE',
        message: 'Sender has no active messaging role in this tenant',
      });
    }
    // Parents and students cannot start broadcasts even if the matrix
    // would otherwise allow it — v1 hardcoded privacy invariant.
    if (senderRole === 'parent' || senderRole === 'student') {
      throw new ForbiddenException({
        code: 'BROADCAST_NOT_ALLOWED_FOR_ROLE',
        message: 'Parents and students cannot create broadcasts',
      });
    }

    this.attachments.validateBatch(tenantId, attachments);

    // Resolve the audience. Saved audience wins — the definition we
    // echo back is the `saved_group` wrapper so re-resolution re-enters
    // the composer through the same cycle-detected path.
    const resolved = savedAudienceId
      ? await this.audience.resolveSavedAudience(tenantId, savedAudienceId)
      : await this.audience.resolve(tenantId, audienceDefinition!);

    const originalRecipientCount = resolved.user_ids.length;
    if (originalRecipientCount === 0) {
      throw new BadRequestException({
        code: 'BROADCAST_AUDIENCE_EMPTY',
        message: 'broadcast audience resolved to zero recipients',
        details: { original_count: 0, filtered_count: 0 },
      });
    }

    // Filter: audiences returned by the engine already EXCLUDE the
    // sender (providers don't include them), but defend anyway.
    let recipients = resolved.user_ids.filter((id) => id !== senderUserId);

    // Policy filter — soft filter for broadcasts. Admin tier is
    // automatically allowed by the policy engine (no relational scope).
    // Teacher broadcasts are expected to target a pre-filtered audience
    // (class_parents, year_group_parents), so relational scope is a
    // safety net rather than the primary gate.
    const policyDecision = await this.policy.canStartConversation({
      tenantId,
      senderUserId,
      recipientUserIds: recipients,
      conversationKind: 'broadcast',
      skipRelationalCheck: true,
    });
    if (!policyDecision.allowed) {
      if (policyDecision.reason === 'ROLE_PAIR_NOT_ALLOWED' && policyDecision.deniedRecipientIds) {
        // Soft-filter: drop the denied recipients, proceed with the rest.
        const denied = new Set(policyDecision.deniedRecipientIds);
        recipients = recipients.filter((id) => !denied.has(id));
        if (recipients.length === 0) {
          throw new BadRequestException({
            code: 'BROADCAST_AUDIENCE_EMPTY',
            message: 'broadcast audience was fully filtered out by policy',
            details: {
              original_count: originalRecipientCount,
              filtered_count: 0,
            },
          });
        }
      } else {
        denyIfNotAllowed(policyDecision);
      }
    }

    // Resolve recipient roles once for the batch INSERT.
    const recipientRoles = await this.roleMapping.resolveMessagingRolesBatch(tenantId, recipients);
    // Any recipient whose role cannot be resolved is dropped (they
    // can't really be in a tenant's inbox universe).
    recipients = recipients.filter((id) => recipientRoles.get(id));
    if (recipients.length === 0) {
      throw new BadRequestException({
        code: 'BROADCAST_AUDIENCE_EMPTY',
        message: 'broadcast audience has no resolvable recipients',
        details: {
          original_count: originalRecipientCount,
          filtered_count: 0,
        },
      });
    }

    const trimmedSubject = subject?.trim() || null;
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: senderUserId });

    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const created = await tx.conversation.create({
        data: {
          tenant_id: tenantId,
          kind: 'broadcast',
          subject: trimmedSubject,
          created_by_user_id: senderUserId,
          allow_replies: allowReplies,
        },
        select: { id: true },
      });
      const conversationId = created.id;

      // Definition + snapshot. JSON-cycle through unknown because the
      // AudienceDefinition discriminated union has fixed field shapes
      // that don't match Prisma.InputJsonObject's index signature.
      await tx.broadcastAudienceDefinition.create({
        data: {
          tenant_id: tenantId,
          conversation_id: conversationId,
          definition_json: resolved.definition as unknown as Prisma.InputJsonValue,
          saved_audience_id: savedAudienceId ?? null,
        },
      });
      await tx.broadcastAudienceSnapshot.create({
        data: {
          tenant_id: tenantId,
          conversation_id: conversationId,
          recipient_user_ids: recipients,
          resolved_count: recipients.length,
        },
      });

      // Participants.
      const participants: Prisma.ConversationParticipantCreateManyInput[] = [
        {
          tenant_id: tenantId,
          conversation_id: conversationId,
          user_id: senderUserId,
          role_at_join: senderRole,
          unread_count: 0,
        },
      ];
      for (const id of recipients) {
        const role = recipientRoles.get(id) as MessagingRole;
        participants.push({
          tenant_id: tenantId,
          conversation_id: conversationId,
          user_id: id,
          role_at_join: role,
          unread_count: 1,
        });
      }
      await tx.conversationParticipant.createMany({ data: participants });

      const { message_id } = await this.appendMessage(tx, {
        tenantId,
        conversationId,
        senderUserId,
        body,
        attachments,
        disableFallback,
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: { last_message_at: new Date() },
      });

      this.fanOutSideEffects({
        tenantId,
        conversationId,
        messageId: message_id,
        senderUserId,
        recipientUserIds: recipients,
        extraChannels,
        disableFallback,
      });

      return {
        conversation_id: conversationId,
        message_id,
        resolved_recipient_count: recipients.length,
        original_recipient_count: originalRecipientCount,
      };
    });
  }

  // ─── Reply ──────────────────────────────────────────────────────────────────

  async sendReply(input: SendReplyInput): Promise<{
    message_id: string;
    spawned_conversation_id?: string;
  }> {
    const {
      tenantId,
      senderUserId,
      conversationId,
      body,
      attachments,
      extraChannels,
      disableFallback,
    } = input;

    this.attachments.validateBatch(tenantId, attachments);

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenant_id: tenantId },
      select: {
        id: true,
        kind: true,
        allow_replies: true,
        frozen_at: true,
        created_by_user_id: true,
      },
    });
    if (!conversation) {
      throw new NotFoundException({
        code: 'CONVERSATION_NOT_FOUND',
        message: `Conversation "${conversationId}" not found`,
      });
    }

    const decision = await this.policy.canReplyToConversation({
      tenantId,
      senderUserId,
      conversationId,
    });
    denyIfNotAllowed(decision);

    // Broadcast recipient reply → spawn per-recipient direct thread.
    const isBroadcast = conversation.kind === 'broadcast';
    const isOriginalSender = conversation.created_by_user_id === senderUserId;
    if (isBroadcast && !isOriginalSender) {
      return this.spawnOrAppendBroadcastReply({
        tenantId,
        senderUserId,
        broadcastConversationId: conversationId,
        broadcastCreatorUserId: conversation.created_by_user_id,
        body,
        attachments,
        extraChannels,
        disableFallback,
      });
    }

    // Normal reply — append to the existing conversation.
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: senderUserId });
    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const { message_id } = await this.appendMessage(tx, {
        tenantId,
        conversationId,
        senderUserId,
        body,
        attachments,
        disableFallback,
      });

      // Unread counter bookkeeping.
      await tx.conversationParticipant.updateMany({
        where: {
          conversation_id: conversationId,
          user_id: { not: senderUserId },
        },
        data: { unread_count: { increment: 1 }, archived_at: null },
      });
      await tx.conversationParticipant.updateMany({
        where: { conversation_id: conversationId, user_id: senderUserId },
        data: { unread_count: 0, last_read_at: new Date() },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { last_message_at: new Date() },
      });

      // Fan-out side effects: load the current recipient set from
      // participants for accurate SMS/Email dispatch targeting.
      const recipients = await tx.conversationParticipant.findMany({
        where: {
          conversation_id: conversationId,
          tenant_id: tenantId,
          user_id: { not: senderUserId },
        },
        select: { user_id: true },
      });
      this.fanOutSideEffects({
        tenantId,
        conversationId,
        messageId: message_id,
        senderUserId,
        recipientUserIds: recipients.map((r) => r.user_id),
        extraChannels,
        disableFallback,
      });

      return { message_id };
    });
  }

  // ─── Reads / mute / archive ─────────────────────────────────────────────────

  async markRead(tenantId: string, userId: string, conversationId: string): Promise<void> {
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: { tenant_id: tenantId, conversation_id: conversationId, user_id: userId },
      select: { id: true },
    });
    if (!participant) {
      throw new NotFoundException({
        code: 'NOT_PARTICIPANT',
        message: 'Not a participant in this conversation',
      });
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    await rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      const now = new Date();

      await tx.conversationParticipant.update({
        where: { id: participant.id },
        data: { unread_count: 0, last_read_at: now },
      });

      // Upsert message_reads rows for every message in the thread that
      // this user hasn't already marked read. Idempotent via the
      // `uniq_message_user_read` unique index.
      const messages = await tx.message.findMany({
        where: {
          conversation_id: conversationId,
          tenant_id: tenantId,
          sender_user_id: { not: userId },
        },
        select: { id: true },
      });
      if (messages.length > 0) {
        await tx.messageRead.createMany({
          data: messages.map((m) => ({
            tenant_id: tenantId,
            message_id: m.id,
            user_id: userId,
            read_at: now,
          })),
          skipDuplicates: true,
        });
      }
    });
  }

  async markAllRead(tenantId: string, userId: string): Promise<void> {
    // Bulk update — don't upsert message_reads here, too expensive.
    // The thread detail read facade treats `last_read_at` as the
    // implicit cutoff for unread messages when message_reads rows are
    // absent.
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    await rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      await tx.conversationParticipant.updateMany({
        where: { tenant_id: tenantId, user_id: userId, unread_count: { gt: 0 } },
        data: { unread_count: 0, last_read_at: new Date() },
      });
    });
  }

  async getInboxState(
    tenantId: string,
    userId: string,
  ): Promise<{ unread_total: number; latest_message_at: Date | null }> {
    const [agg, latest] = await Promise.all([
      this.prisma.conversationParticipant.aggregate({
        where: { tenant_id: tenantId, user_id: userId, archived_at: null },
        _sum: { unread_count: true },
      }),
      this.prisma.conversationParticipant.findFirst({
        where: { tenant_id: tenantId, user_id: userId },
        orderBy: { conversation: { last_message_at: 'desc' } },
        select: { conversation: { select: { last_message_at: true } } },
      }),
    ]);

    return {
      unread_total: agg._sum.unread_count ?? 0,
      latest_message_at: latest?.conversation.last_message_at ?? null,
    };
  }

  async setMuted(
    tenantId: string,
    userId: string,
    conversationId: string,
    muted: boolean,
  ): Promise<void> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    await rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      const result = await tx.conversationParticipant.updateMany({
        where: { tenant_id: tenantId, conversation_id: conversationId, user_id: userId },
        data: { muted_at: muted ? new Date() : null },
      });
      if (result.count === 0) {
        throw new NotFoundException({
          code: 'NOT_PARTICIPANT',
          message: 'Not a participant in this conversation',
        });
      }
    });
  }

  async setArchived(
    tenantId: string,
    userId: string,
    conversationId: string,
    archived: boolean,
  ): Promise<void> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    await rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      const result = await tx.conversationParticipant.updateMany({
        where: { tenant_id: tenantId, conversation_id: conversationId, user_id: userId },
        data: { archived_at: archived ? new Date() : null },
      });
      if (result.count === 0) {
        throw new NotFoundException({
          code: 'NOT_PARTICIPANT',
          message: 'Not a participant in this conversation',
        });
      }
    });
  }

  // ─── Internal helpers ───────────────────────────────────────────────────────

  /** Find an existing, non-archived direct conversation between two users. */
  private async findActiveDirectBetween(
    tenantId: string,
    userA: string,
    userB: string,
  ): Promise<{ id: string } | null> {
    // Use the index on conversation_participants (tenant_id, user_id, ...)
    // and filter by conversation.kind='direct' in the outer join.
    const candidates = await this.prisma.conversationParticipant.findMany({
      where: {
        tenant_id: tenantId,
        user_id: userA,
        conversation: { kind: 'direct' },
      },
      select: {
        conversation_id: true,
        archived_at: true,
        conversation: {
          select: {
            id: true,
            participants: {
              where: { user_id: userB },
              select: { id: true, archived_at: true },
            },
          },
        },
      },
    });
    for (const row of candidates) {
      const other = row.conversation.participants[0];
      if (!other) continue;
      // "Active" = at least one side isn't archived.
      if (row.archived_at === null || other.archived_at === null) {
        return { id: row.conversation.id };
      }
    }
    return null;
  }

  /** Shared message-insert helper, used by create* and sendReply paths. */
  private async appendMessage(
    tx: PrismaClient,
    params: {
      tenantId: string;
      conversationId: string;
      senderUserId: string;
      body: string;
      attachments: AttachmentInput[];
      disableFallback: boolean;
    },
  ): Promise<{ message_id: string }> {
    const trimmed = params.body.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException({
        code: 'MESSAGE_BODY_EMPTY',
        message: 'Message body cannot be empty',
      });
    }

    const message = await tx.message.create({
      data: {
        tenant_id: params.tenantId,
        conversation_id: params.conversationId,
        sender_user_id: params.senderUserId,
        body: trimmed,
        attachment_count: params.attachments.length,
        disable_fallback: params.disableFallback,
      },
      select: { id: true },
    });

    if (params.attachments.length > 0) {
      await tx.messageAttachment.createMany({
        data: params.attachments.map((att) => ({
          tenant_id: params.tenantId,
          message_id: message.id,
          storage_key: att.storage_key,
          filename: att.filename,
          mime_type: att.mime_type,
          size_bytes: att.size_bytes,
          uploaded_by_user_id: params.senderUserId,
        })),
      });
    }

    return { message_id: message.id };
  }

  /** Spawn or append the per-recipient direct thread for a broadcast reply. */
  private async spawnOrAppendBroadcastReply(params: {
    tenantId: string;
    senderUserId: string;
    broadcastConversationId: string;
    broadcastCreatorUserId: string;
    body: string;
    attachments: AttachmentInput[];
    extraChannels: ExtraChannel[];
    disableFallback: boolean;
  }): Promise<{ message_id: string; spawned_conversation_id: string }> {
    const {
      tenantId,
      senderUserId,
      broadcastConversationId,
      broadcastCreatorUserId,
      body,
      attachments,
      extraChannels,
      disableFallback,
    } = params;

    if (senderUserId === broadcastCreatorUserId) {
      // Guarded earlier, but defensive.
      throw new ConflictException({
        code: 'BROADCAST_REPLY_SELF',
        message: 'Broadcast creator replies are not spawned as new threads',
      });
    }

    const senderRole = await this.roleMapping.resolveMessagingRole(tenantId, senderUserId);
    const creatorRole = await this.roleMapping.resolveMessagingRole(
      tenantId,
      broadcastCreatorUserId,
    );
    if (!senderRole || !creatorRole) {
      throw new ForbiddenException({
        code: 'UNKNOWN_ROLE',
        message: 'Cannot resolve role for broadcast reply participants',
      });
    }

    // Look for an existing spawned direct thread. We identify it by
    // subject marker containing the broadcast conversation id — we
    // don't have a `metadata_json` column yet (see impl doc follow-up),
    // so the marker lives in the subject for now.
    const spawnMarker = `broadcast:${broadcastConversationId}`;

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: senderUserId });
    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      // Existing spawn? Look for a direct between the two users whose
      // subject marker points at this broadcast.
      const existing = await tx.conversation.findFirst({
        where: {
          tenant_id: tenantId,
          kind: 'direct',
          subject: spawnMarker,
          participants: {
            every: {
              user_id: { in: [senderUserId, broadcastCreatorUserId] },
            },
          },
        },
        select: { id: true },
      });

      let spawnedId: string;
      if (existing) {
        spawnedId = existing.id;
      } else {
        const created = await tx.conversation.create({
          data: {
            tenant_id: tenantId,
            kind: 'direct',
            subject: spawnMarker,
            created_by_user_id: senderUserId,
            allow_replies: true,
          },
          select: { id: true },
        });
        spawnedId = created.id;

        await tx.conversationParticipant.createMany({
          data: [
            {
              tenant_id: tenantId,
              conversation_id: spawnedId,
              user_id: senderUserId,
              role_at_join: senderRole,
              unread_count: 0,
            },
            {
              tenant_id: tenantId,
              conversation_id: spawnedId,
              user_id: broadcastCreatorUserId,
              role_at_join: creatorRole,
              unread_count: 0,
            },
          ],
        });
      }

      const { message_id } = await this.appendMessage(tx, {
        tenantId,
        conversationId: spawnedId,
        senderUserId,
        body,
        attachments,
        disableFallback,
      });

      // Increment unread for the broadcast creator.
      await tx.conversationParticipant.updateMany({
        where: { conversation_id: spawnedId, user_id: broadcastCreatorUserId },
        data: { unread_count: { increment: 1 }, archived_at: null },
      });
      await tx.conversationParticipant.updateMany({
        where: { conversation_id: spawnedId, user_id: senderUserId },
        data: { unread_count: 0, last_read_at: new Date() },
      });
      await tx.conversation.update({
        where: { id: spawnedId },
        data: { last_message_at: new Date() },
      });

      this.fanOutSideEffects({
        tenantId,
        conversationId: spawnedId,
        messageId: message_id,
        senderUserId,
        recipientUserIds: [broadcastCreatorUserId],
        extraChannels,
        disableFallback,
      });

      return { message_id, spawned_conversation_id: spawnedId };
    });
  }

  /** Fire post-transaction side-effect hooks to the outbox stub. */
  private fanOutSideEffects(params: {
    tenantId: string;
    conversationId: string;
    messageId: string;
    senderUserId: string;
    recipientUserIds: string[];
    extraChannels: ExtraChannel[];
    disableFallback: boolean;
  }): void {
    // Inbox is always on — we add it explicitly to the outbox payload
    // even if the caller didn't, to match the PLAN §3 invariant. The
    // outbox stub de-dupes inbox in its log output.
    const channels: InboxChannel[] = ['inbox', ...params.extraChannels];
    this.outbox.notifyMessageCreated({
      tenant_id: params.tenantId,
      conversation_id: params.conversationId,
      message_id: params.messageId,
      sender_user_id: params.senderUserId,
      extra_channels: channels,
      disable_fallback: params.disableFallback,
      recipient_user_ids: params.recipientUserIds,
    });
    this.outbox.notifyNeedsSafeguardingScan({
      tenant_id: params.tenantId,
      conversation_id: params.conversationId,
      message_id: params.messageId,
    });
  }
}

// ─── Shared error helper ──────────────────────────────────────────────────────

function denyIfNotAllowed(decision: PolicyDecision): void {
  if (decision.allowed) return;
  throw new ForbiddenException({
    code: decision.reason,
    message: `Send denied by policy: ${decision.reason}`,
    details: decision.deniedRecipientIds ? { denied: decision.deniedRecipientIds } : undefined,
  });
}
