import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { DEFAULT_EDIT_WINDOW_MINUTES } from '@school/shared/inbox';
import type { MessagingRole } from '@school/shared/inbox';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { InboxOutboxService } from '../common/inbox-outbox.service';
import { RoleMappingService } from '../policy/role-mapping.service';

/**
 * MessagesService — per-message operations. Mostly `editMessage` and
 * `deleteMessage`. Conversation-level operations live on
 * `ConversationsService`; listing and thread-read live on
 * `ConversationsReadFacade`.
 *
 * Rules (PLAN §6, impl 04 doc §9):
 *
 *   - Edit window: 10 minutes from `created_at`, per-tenant overridable
 *     via `tenant_settings_inbox.edit_window_minutes`. After the window
 *     closes, the endpoint returns `EDIT_WINDOW_EXPIRED`.
 *   - Edit authors only: cannot edit someone else's message.
 *   - Parents and students cannot edit at all, even their own messages.
 *   - Deleted messages cannot be edited.
 *   - Deletes are soft (`deleted_at = now()`). The body stays in the
 *     DB for safeguarding audit. Non-admin viewers see a tombstone;
 *     admin-tier oversight sees the original body with a strikethrough
 *     flag (handled in the oversight surface, not here).
 *   - Every edit stores a snapshot of the previous body in
 *     `message_edits` before the update.
 */

const STAFF_ROLES_THAT_CAN_EDIT: readonly MessagingRole[] = [
  'owner',
  'principal',
  'vice_principal',
  'office',
  'finance',
  'nurse',
  'teacher',
];

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleMapping: RoleMappingService,
    private readonly outbox: InboxOutboxService,
  ) {}

  async editMessage(input: {
    tenantId: string;
    userId: string;
    messageId: string;
    newBody: string;
  }): Promise<{ message_id: string; edited_at: Date }> {
    const { tenantId, userId, messageId, newBody } = input;
    const trimmed = newBody.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException({
        code: 'MESSAGE_BODY_EMPTY',
        message: 'Message body cannot be empty',
      });
    }

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, tenant_id: tenantId },
      select: {
        id: true,
        conversation_id: true,
        sender_user_id: true,
        body: true,
        created_at: true,
        deleted_at: true,
      },
    });
    if (!message) {
      throw new NotFoundException({
        code: 'MESSAGE_NOT_FOUND',
        message: `Message "${messageId}" not found`,
      });
    }

    if (message.sender_user_id !== userId) {
      throw new ForbiddenException({
        code: 'NOT_AUTHOR',
        message: 'Only the original author can edit a message',
      });
    }
    if (message.deleted_at !== null) {
      throw new BadRequestException({
        code: 'MESSAGE_DELETED',
        message: 'Cannot edit a deleted message',
      });
    }

    const senderRole = await this.roleMapping.resolveMessagingRole(tenantId, userId);
    if (!senderRole || !STAFF_ROLES_THAT_CAN_EDIT.includes(senderRole)) {
      throw new ForbiddenException({
        code: 'EDIT_NOT_ALLOWED_FOR_ROLE',
        message: 'Only staff may edit messages',
      });
    }

    // Edit window check. Per-tenant override lives on
    // `tenant_settings_inbox.edit_window_minutes` but the schema field
    // is optional — fall back to the shared default.
    const settings = await this.prisma.tenantSettingsInbox.findUnique({
      where: { tenant_id: tenantId },
      select: { edit_window_minutes: true },
    });
    const windowMinutes = settings?.edit_window_minutes ?? DEFAULT_EDIT_WINDOW_MINUTES;
    const windowMs = windowMinutes * 60 * 1000;
    const ageMs = Date.now() - message.created_at.getTime();
    if (ageMs > windowMs) {
      throw new BadRequestException({
        code: 'EDIT_WINDOW_EXPIRED',
        message: `Messages can only be edited within ${windowMinutes} minutes of sending`,
      });
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    const updated = await rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      const now = new Date();

      await tx.messageEdit.create({
        data: {
          tenant_id: tenantId,
          message_id: messageId,
          previous_body: message.body,
          edited_by_user_id: userId,
          edited_at: now,
        },
      });
      const u = await tx.message.update({
        where: { id: messageId },
        data: { body: trimmed, edited_at: now },
        select: { id: true, edited_at: true, conversation_id: true },
      });
      return u;
    });

    // Re-scan safeguarding — the new body needs a pass through the
    // keyword scanner (stub until impl 08).
    this.outbox.notifyNeedsSafeguardingScan({
      tenant_id: tenantId,
      conversation_id: updated.conversation_id,
      message_id: messageId,
    });

    return { message_id: updated.id, edited_at: updated.edited_at! };
  }

  async deleteMessage(input: {
    tenantId: string;
    userId: string;
    messageId: string;
  }): Promise<{ message_id: string; deleted_at: Date }> {
    const { tenantId, userId, messageId } = input;

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, tenant_id: tenantId },
      select: {
        id: true,
        sender_user_id: true,
        deleted_at: true,
      },
    });
    if (!message) {
      throw new NotFoundException({
        code: 'MESSAGE_NOT_FOUND',
        message: `Message "${messageId}" not found`,
      });
    }
    if (message.sender_user_id !== userId) {
      throw new ForbiddenException({
        code: 'NOT_AUTHOR',
        message: 'Only the original author can delete a message',
      });
    }
    if (message.deleted_at !== null) {
      return { message_id: messageId, deleted_at: message.deleted_at };
    }

    const senderRole = await this.roleMapping.resolveMessagingRole(tenantId, userId);
    if (!senderRole || !STAFF_ROLES_THAT_CAN_EDIT.includes(senderRole)) {
      throw new ForbiddenException({
        code: 'DELETE_NOT_ALLOWED_FOR_ROLE',
        message: 'Only staff may delete messages',
      });
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
    const updated = await rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      const now = new Date();
      const u = await tx.message.update({
        where: { id: messageId },
        data: { deleted_at: now },
        select: { id: true, deleted_at: true },
      });
      return u;
    });

    return { message_id: updated.id, deleted_at: updated.deleted_at! };
  }
}
