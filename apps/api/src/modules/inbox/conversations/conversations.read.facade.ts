import { Injectable, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import type { ConversationKind, MessagingRole } from '@school/shared/inbox';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { RoleMappingService } from '../policy/role-mapping.service';

import type {
  InboxThreadSummary,
  Paginated,
  ThreadDetail,
  ThreadMessageView,
} from './conversations.service';

/**
 * ConversationsReadFacade — the privacy-gated read path for the regular
 * inbox UI. All writes live on `ConversationsService`; reads split off
 * into this facade so the read-state visibility branching (staff sees
 * read counts, parents/students never do) is centralised and testable
 * in isolation.
 *
 * This facade is NOT the oversight surface — that is
 * `InboxOversightService`, which bypasses participant filters. Every
 * read here enforces the `conversation_participants` join: a user
 * only sees threads they participate in.
 */

const STAFF_ROLES: readonly MessagingRole[] = [
  'owner',
  'principal',
  'vice_principal',
  'office',
  'finance',
  'nurse',
  'teacher',
];

function isStaffRole(role: MessagingRole | null): boolean {
  return role !== null && STAFF_ROLES.includes(role);
}

@Injectable()
export class ConversationsReadFacade {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roleMapping: RoleMappingService,
  ) {}

  // ─── Inbox listing ──────────────────────────────────────────────────────────

  async listInbox(input: {
    tenantId: string;
    userId: string;
    filter: { archived?: boolean; unreadOnly?: boolean; kind?: ConversationKind };
    pagination: { page: number; pageSize: number };
  }): Promise<Paginated<InboxThreadSummary>> {
    const { tenantId, userId, filter, pagination } = input;
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    // Built through Prisma to stay within the RLS middleware boundary
    // and avoid the raw-SQL exception. The preview is a nested `messages`
    // include limited to 1 — Postgres turns that into a correlated
    // subquery that the `idx_messages_thread_recent` index serves
    // efficiently at the cardinality of a single user's inbox.
    const whereParticipant: Record<string, unknown> = {
      tenant_id: tenantId,
      user_id: userId,
    };
    if (filter.archived === true) {
      whereParticipant.archived_at = { not: null };
    } else if (filter.archived === false) {
      whereParticipant.archived_at = null;
    }
    if (filter.unreadOnly) {
      whereParticipant.unread_count = { gt: 0 };
    }
    if (filter.kind) {
      whereParticipant.conversation = { kind: filter.kind };
    }

    const [rows, total] = await Promise.all([
      this.prisma.conversationParticipant.findMany({
        where: whereParticipant,
        orderBy: [{ conversation: { last_message_at: 'desc' } }, { joined_at: 'desc' }],
        skip,
        take: pageSize,
        select: {
          unread_count: true,
          muted_at: true,
          archived_at: true,
          conversation: {
            select: {
              id: true,
              kind: true,
              subject: true,
              last_message_at: true,
              frozen_at: true,
              messages: {
                orderBy: { created_at: 'desc' },
                take: 1,
                select: {
                  body: true,
                  sender_user_id: true,
                  created_at: true,
                  deleted_at: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.conversationParticipant.count({ where: whereParticipant }),
    ]);

    const data: InboxThreadSummary[] = rows.map((p) => {
      const preview = p.conversation.messages[0];
      return {
        id: p.conversation.id,
        kind: p.conversation.kind,
        subject: p.conversation.subject,
        last_message_at: p.conversation.last_message_at,
        frozen_at: p.conversation.frozen_at,
        unread_count: p.unread_count,
        muted_at: p.muted_at,
        archived_at: p.archived_at,
        preview_body: preview
          ? preview.deleted_at
            ? '[message deleted]'
            : truncate(preview.body, 240)
          : null,
        preview_sender_user_id: preview?.sender_user_id ?? null,
        preview_created_at: preview?.created_at ?? null,
      };
    });

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Thread detail ──────────────────────────────────────────────────────────

  async getThread(input: {
    tenantId: string;
    userId: string;
    conversationId: string;
    pagination: { page: number; pageSize: number };
  }): Promise<ThreadDetail> {
    const { tenantId, userId, conversationId, pagination } = input;

    // Participation gate — must be a member of the thread.
    const participation = await this.prisma.conversationParticipant.findFirst({
      where: { tenant_id: tenantId, conversation_id: conversationId, user_id: userId },
      select: { id: true, unread_count: true, last_read_at: true },
    });
    if (!participation) {
      throw new NotFoundException({
        code: 'CONVERSATION_NOT_FOUND',
        message: `Conversation "${conversationId}" not found`,
      });
    }

    const requesterRole = await this.roleMapping.resolveMessagingRole(tenantId, userId);
    const requesterIsStaff = isStaffRole(requesterRole);

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenant_id: tenantId },
      select: {
        id: true,
        kind: true,
        subject: true,
        allow_replies: true,
        frozen_at: true,
        frozen_by_user_id: true,
        freeze_reason: true,
        created_by_user_id: true,
        created_at: true,
        participants: {
          select: {
            user_id: true,
            role_at_join: true,
            joined_at: true,
            last_read_at: true,
          },
        },
      },
    });
    if (!conversation) {
      throw new NotFoundException({
        code: 'CONVERSATION_NOT_FOUND',
        message: `Conversation "${conversationId}" not found`,
      });
    }

    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where: { tenant_id: tenantId, conversation_id: conversationId },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          sender_user_id: true,
          body: true,
          created_at: true,
          edited_at: true,
          deleted_at: true,
          attachments: {
            select: {
              id: true,
              storage_key: true,
              filename: true,
              mime_type: true,
              size_bytes: true,
            },
          },
        },
      }),
      this.prisma.message.count({
        where: { tenant_id: tenantId, conversation_id: conversationId },
      }),
    ]);

    // Read state — only staff senders see read counts on their OWN
    // sent messages. Compute total_recipients once = participants - 1
    // (everyone except the sender). For deleted messages, skip the
    // count lookup.
    const totalRecipients = conversation.participants.length - 1;
    let readCounts: Map<string, number> | null = null;

    if (requesterIsStaff && messages.length > 0) {
      const myMessageIds = messages
        .filter((m) => m.sender_user_id === userId && m.deleted_at === null)
        .map((m) => m.id);
      if (myMessageIds.length > 0) {
        const groups = await this.prisma.messageRead.groupBy({
          by: ['message_id'],
          where: {
            tenant_id: tenantId,
            message_id: { in: myMessageIds },
            user_id: { not: userId },
          },
          _count: { message_id: true },
        });
        readCounts = new Map();
        for (const g of groups) readCounts.set(g.message_id, g._count.message_id);
        for (const id of myMessageIds) if (!readCounts.has(id)) readCounts.set(id, 0);
      }
    }

    const messageViews: ThreadMessageView[] = messages.map((m) => {
      const isDeleted = m.deleted_at !== null;
      const viewBody = isDeleted && !requesterIsStaff ? '[message deleted]' : m.body;

      let read_state: ThreadMessageView['read_state'] = null;
      if (
        requesterIsStaff &&
        m.sender_user_id === userId &&
        !isDeleted &&
        readCounts &&
        readCounts.has(m.id)
      ) {
        read_state = {
          read_count: readCounts.get(m.id) ?? 0,
          total_recipients: totalRecipients,
        };
      }

      return {
        id: m.id,
        sender_user_id: m.sender_user_id,
        body: viewBody,
        created_at: m.created_at,
        edited_at: m.edited_at,
        deleted_at: isDeleted ? m.deleted_at : null,
        attachments: isDeleted && !requesterIsStaff ? [] : m.attachments,
        read_state,
      };
    });

    // Mark the thread as read when it's opened (idempotent).
    if (participation.unread_count > 0) {
      const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });
      await rls.$transaction(async (txClient) => {
        const tx = txClient as unknown as PrismaClient;
        await tx.conversationParticipant.update({
          where: { id: participation.id },
          data: { unread_count: 0, last_read_at: new Date() },
        });
        // Upsert reads for the page we just returned — cheap and
        // idempotent. markRead() backfills older messages.
        const ids = messages
          .filter((m) => m.sender_user_id !== userId && !m.deleted_at)
          .map((m) => m.id);
        if (ids.length > 0) {
          await tx.messageRead.createMany({
            data: ids.map((id) => ({
              tenant_id: tenantId,
              message_id: id,
              user_id: userId,
              read_at: new Date(),
            })),
            skipDuplicates: true,
          });
        }
      });
    }

    return {
      id: conversation.id,
      kind: conversation.kind,
      subject: conversation.subject,
      allow_replies: conversation.allow_replies,
      frozen_at: conversation.frozen_at,
      frozen_by_user_id: conversation.frozen_by_user_id,
      freeze_reason: conversation.freeze_reason,
      created_by_user_id: conversation.created_by_user_id,
      created_at: conversation.created_at,
      participants: conversation.participants.map((p) => ({
        user_id: p.user_id,
        role_at_join: p.role_at_join,
        joined_at: p.joined_at,
        last_read_at: p.last_read_at,
      })),
      messages: { data: messageViews, meta: { page, pageSize, total } },
    };
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return `${s.slice(0, n - 1)}…`;
}
