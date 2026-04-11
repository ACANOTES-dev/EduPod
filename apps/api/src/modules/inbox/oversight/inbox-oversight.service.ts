import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';

import { SYSTEM_USER_SENTINEL } from '@school/shared';
import type { ConversationKind } from '@school/shared/inbox';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';

import { OversightAuditService } from './oversight-audit.service';
import { OversightPdfService } from './oversight-pdf.service';
import type { OversightPdfMessage } from './oversight-pdf.service';

/**
 * InboxOversightService — the privileged surface for Owner / Principal /
 * Vice Principal to read every conversation in their tenant, freeze
 * threads, act on safeguarding flags, and export threads for offline
 * review.
 *
 * Access pattern is deliberately different from the regular
 * `ConversationsService`: every read bypasses the participant filter and
 * is audit-logged into `oversight_access_log` in the same RLS-scoped
 * transaction that performs the read. An oversight action with a missing
 * audit row would be untraceable, so the two must succeed or fail
 * together.
 *
 * RLS scoping is still tenant-level via `createRlsClient`. The only thing
 * the oversight surface relaxes is the participant filter — cross-tenant
 * leakage remains impossible.
 *
 * Full-text search (`searchAll`) is stubbed with 503
 * `INBOX_SEARCH_NOT_READY` until Wave 3 impl 09 lands the
 * `InboxSearchService`. The frontend handles the stub gracefully.
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface OversightListFilter {
  kind?: ConversationKind;
  fromDate?: Date;
  toDate?: Date;
  participantUserId?: string;
  hasFlags?: boolean;
  frozen?: boolean;
}

export interface OversightThreadSummary {
  id: string;
  kind: ConversationKind;
  subject: string | null;
  frozen_at: Date | null;
  last_message_at: Date | null;
  created_at: Date;
  participant_count: number;
  flag_count: number;
  has_pending_flag: boolean;
}

export interface OversightThreadDetail {
  id: string;
  kind: ConversationKind;
  subject: string | null;
  frozen_at: Date | null;
  frozen_by_user_id: string | null;
  freeze_reason: string | null;
  created_at: Date;
  participants: Array<{
    id: string;
    user_id: string;
    role_at_join: string;
    display_name: string;
  }>;
  messages: Array<{
    id: string;
    sender_user_id: string;
    sender_display_name: string;
    body: string;
    created_at: Date;
    deleted_at: Date | null;
    edits: Array<{
      id: string;
      previous_body: string;
      edited_at: Date;
      edited_by_user_id: string;
    }>;
  }>;
}

export interface OversightSearchHit {
  message_id: string;
  conversation_id: string;
  excerpt: string;
  created_at: Date;
}

export interface OversightAuditEntry {
  id: string;
  actor_user_id: string;
  action: string;
  conversation_id: string | null;
  message_flag_id: string | null;
  metadata_json: unknown;
  created_at: Date;
}

export interface OversightFlagSummary {
  id: string;
  conversation_id: string;
  message_id: string;
  matched_keywords: string[];
  highest_severity: string;
  review_state: string;
  body_preview: string;
  created_at: Date;
  participants: Array<{ user_id: string; display_name: string }>;
  review_url: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class InboxOversightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: OversightAuditService,
    private readonly pdfService: OversightPdfService,
    private readonly s3Service: S3Service,
  ) {}

  // ─── Conversations listing / reading ────────────────────────────────────────

  async listAllConversations(input: {
    tenantId: string;
    actorUserId: string;
    filter: OversightListFilter;
    pagination: { page: number; pageSize: number };
  }): Promise<Paginated<OversightThreadSummary>> {
    const { tenantId, actorUserId, filter, pagination } = input;
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ConversationWhereInput = { tenant_id: tenantId };
    if (filter.kind) where.kind = filter.kind;
    if (filter.fromDate || filter.toDate) {
      where.created_at = {};
      if (filter.fromDate) (where.created_at as Prisma.DateTimeFilter).gte = filter.fromDate;
      if (filter.toDate) (where.created_at as Prisma.DateTimeFilter).lte = filter.toDate;
    }
    if (filter.frozen !== undefined) {
      where.frozen_at = filter.frozen ? { not: null } : null;
    }
    if (filter.participantUserId) {
      where.participants = { some: { user_id: filter.participantUserId } };
    }
    if (filter.hasFlags) {
      where.messages = { some: { flags: { some: {} } } };
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: actorUserId });

    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const [rows, total] = await Promise.all([
        tx.conversation.findMany({
          where,
          orderBy: [{ last_message_at: 'desc' }, { created_at: 'desc' }],
          skip,
          take: pageSize,
          select: {
            id: true,
            kind: true,
            subject: true,
            frozen_at: true,
            last_message_at: true,
            created_at: true,
            _count: { select: { participants: true } },
            messages: {
              select: {
                flags: {
                  select: { id: true, review_state: true },
                },
              },
            },
          },
        }),
        tx.conversation.count({ where }),
      ]);

      await this.auditService.log(tx, {
        tenantId,
        actorUserId,
        action: 'read_thread',
        metadata: {
          scope: 'list',
          page,
          pageSize,
          filter: filterForAudit(filter),
          result_count: rows.length,
        },
      });

      const data: OversightThreadSummary[] = rows.map((row) => {
        const flags = row.messages.flatMap((m) => m.flags);
        return {
          id: row.id,
          kind: row.kind,
          subject: row.subject,
          frozen_at: row.frozen_at,
          last_message_at: row.last_message_at,
          created_at: row.created_at,
          participant_count: row._count.participants,
          flag_count: flags.length,
          has_pending_flag: flags.some((f) => f.review_state === 'pending'),
        };
      });

      return { data, meta: { page, pageSize, total } };
    });
  }

  async getThread(input: {
    tenantId: string;
    actorUserId: string;
    conversationId: string;
  }): Promise<OversightThreadDetail> {
    const { tenantId, actorUserId, conversationId } = input;
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: actorUserId });

    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, tenant_id: tenantId },
        include: {
          participants: {
            include: {
              user: { select: { id: true, first_name: true, last_name: true, email: true } },
            },
          },
          messages: {
            orderBy: { created_at: 'asc' },
            include: {
              edits: { orderBy: { edited_at: 'asc' } },
              sender: { select: { id: true, first_name: true, last_name: true, email: true } },
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

      await this.auditService.log(tx, {
        tenantId,
        actorUserId,
        action: 'read_thread',
        conversationId,
        metadata: { scope: 'detail' },
      });

      return {
        id: conversation.id,
        kind: conversation.kind,
        subject: conversation.subject,
        frozen_at: conversation.frozen_at,
        frozen_by_user_id: conversation.frozen_by_user_id,
        freeze_reason: conversation.freeze_reason,
        created_at: conversation.created_at,
        participants: conversation.participants.map((p) => ({
          id: p.id,
          user_id: p.user_id,
          role_at_join: p.role_at_join,
          display_name: formatDisplayName(p.user),
        })),
        messages: conversation.messages.map((m) => ({
          id: m.id,
          sender_user_id: m.sender_user_id,
          sender_display_name: formatDisplayName(m.sender),
          body: m.body,
          created_at: m.created_at,
          deleted_at: m.deleted_at,
          edits: m.edits.map((e) => ({
            id: e.id,
            previous_body: e.previous_body,
            edited_at: e.edited_at,
            edited_by_user_id: e.edited_by_user_id,
          })),
        })),
      };
    });
  }

  // ─── Search (stub until impl 09) ────────────────────────────────────────────

  async searchAll(input: {
    tenantId: string;
    actorUserId: string;
    query: string;
    pagination: { page: number; pageSize: number };
  }): Promise<Paginated<OversightSearchHit>> {
    // Audit-log the attempt so misuse is traced even before search lands.
    await createRlsClient(this.prisma, {
      tenant_id: input.tenantId,
      user_id: input.actorUserId,
    }).$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      await this.auditService.log(tx, {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: 'search',
        metadata: { query: input.query, state: 'stub_not_ready' },
      });
    });

    throw new ServiceUnavailableException({
      code: 'INBOX_SEARCH_NOT_READY',
      message: 'Search will be enabled when impl 09 deploys.',
    });
  }

  // ─── Freeze / unfreeze ──────────────────────────────────────────────────────

  async freezeConversation(input: {
    tenantId: string;
    actorUserId: string;
    conversationId: string;
    reason: string;
  }): Promise<{ frozen_at: Date; freeze_reason: string; already_frozen: boolean }> {
    const { tenantId, actorUserId, conversationId, reason } = input;
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: actorUserId });

    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, tenant_id: tenantId },
        select: { id: true, frozen_at: true, freeze_reason: true },
      });
      if (!conversation) {
        throw new NotFoundException({
          code: 'CONVERSATION_NOT_FOUND',
          message: `Conversation "${conversationId}" not found`,
        });
      }

      // Idempotent: re-freezing is a no-op.
      if (conversation.frozen_at) {
        await this.auditService.log(tx, {
          tenantId,
          actorUserId,
          action: 'freeze',
          conversationId,
          metadata: { result: 'already_frozen' },
        });
        return {
          frozen_at: conversation.frozen_at,
          freeze_reason: conversation.freeze_reason ?? reason,
          already_frozen: true,
        };
      }

      const frozenAt = new Date();
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          frozen_at: frozenAt,
          frozen_by_user_id: actorUserId,
          freeze_reason: reason,
        },
      });

      await tx.message.create({
        data: {
          tenant_id: tenantId,
          conversation_id: conversationId,
          sender_user_id: SYSTEM_USER_SENTINEL,
          body:
            '🔒 This conversation has been disabled by school administration. ' +
            'Please contact the office for further communication.',
        },
      });

      await this.auditService.log(tx, {
        tenantId,
        actorUserId,
        action: 'freeze',
        conversationId,
        metadata: { reason },
      });

      return { frozen_at: frozenAt, freeze_reason: reason, already_frozen: false };
    });
  }

  async unfreezeConversation(input: {
    tenantId: string;
    actorUserId: string;
    conversationId: string;
  }): Promise<{ already_unfrozen: boolean }> {
    const { tenantId, actorUserId, conversationId } = input;
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: actorUserId });

    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, tenant_id: tenantId },
        select: { id: true, frozen_at: true },
      });
      if (!conversation) {
        throw new NotFoundException({
          code: 'CONVERSATION_NOT_FOUND',
          message: `Conversation "${conversationId}" not found`,
        });
      }

      if (!conversation.frozen_at) {
        await this.auditService.log(tx, {
          tenantId,
          actorUserId,
          action: 'unfreeze',
          conversationId,
          metadata: { result: 'already_unfrozen' },
        });
        return { already_unfrozen: true };
      }

      await tx.conversation.update({
        where: { id: conversationId },
        data: { frozen_at: null, frozen_by_user_id: null, freeze_reason: null },
      });

      await tx.message.create({
        data: {
          tenant_id: tenantId,
          conversation_id: conversationId,
          sender_user_id: SYSTEM_USER_SENTINEL,
          body: 'This conversation has been re-enabled by school administration.',
        },
      });

      await this.auditService.log(tx, {
        tenantId,
        actorUserId,
        action: 'unfreeze',
        conversationId,
      });

      return { already_unfrozen: false };
    });
  }

  // ─── Flag actions ───────────────────────────────────────────────────────────

  async listPendingFlags(input: {
    tenantId: string;
    actorUserId: string;
    pagination: { page: number; pageSize: number };
    reviewState?: 'pending' | 'dismissed' | 'escalated' | 'frozen';
  }): Promise<Paginated<OversightFlagSummary>> {
    const { tenantId, actorUserId, pagination, reviewState } = input;
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;
    const state = reviewState ?? 'pending';

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: actorUserId });

    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const where: Prisma.MessageFlagWhereInput = { tenant_id: tenantId, review_state: state };
      const [flags, total] = await Promise.all([
        tx.messageFlag.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip,
          take: pageSize,
          include: {
            message: {
              include: {
                conversation: {
                  include: {
                    participants: {
                      include: {
                        user: {
                          select: {
                            id: true,
                            first_name: true,
                            last_name: true,
                            email: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        tx.messageFlag.count({ where }),
      ]);

      const data: OversightFlagSummary[] = flags.map((f) => ({
        id: f.id,
        conversation_id: f.message.conversation_id,
        message_id: f.message_id,
        matched_keywords: f.matched_keywords,
        highest_severity: f.highest_severity,
        review_state: f.review_state,
        body_preview: f.message.body.slice(0, 200),
        created_at: f.created_at,
        participants: f.message.conversation.participants.map((p) => ({
          user_id: p.user_id,
          display_name: formatDisplayName(p.user),
        })),
        review_url: `/inbox/oversight/conversations/${f.message.conversation_id}?flag=${f.id}`,
      }));

      return { data, meta: { page, pageSize, total } };
    });
  }

  async dismissFlag(input: {
    tenantId: string;
    actorUserId: string;
    flagId: string;
    notes: string;
  }): Promise<void> {
    const { tenantId, actorUserId, flagId, notes } = input;
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: actorUserId });

    await rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const flag = await tx.messageFlag.findFirst({
        where: { id: flagId, tenant_id: tenantId },
        select: { id: true, review_state: true, message_id: true },
      });
      if (!flag) {
        throw new NotFoundException({
          code: 'MESSAGE_FLAG_NOT_FOUND',
          message: `Message flag "${flagId}" not found`,
        });
      }

      await tx.messageFlag.update({
        where: { id: flagId },
        data: {
          review_state: 'dismissed',
          reviewed_by_user_id: actorUserId,
          reviewed_at: new Date(),
          review_notes: notes,
        },
      });

      await this.auditService.log(tx, {
        tenantId,
        actorUserId,
        action: 'dismiss_flag',
        messageFlagId: flagId,
        metadata: { notes },
      });
    });
  }

  async escalateFlag(input: {
    tenantId: string;
    actorUserId: string;
    flagId: string;
    notes: string;
  }): Promise<{ export_url: string }> {
    const { tenantId, actorUserId, flagId, notes } = input;

    // 1) Mutate flag + audit (single RLS transaction so rollbacks are clean).
    const { conversationId } = await createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: actorUserId,
    }).$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const flag = await tx.messageFlag.findFirst({
        where: { id: flagId, tenant_id: tenantId },
        include: { message: { select: { conversation_id: true } } },
      });
      if (!flag) {
        throw new NotFoundException({
          code: 'MESSAGE_FLAG_NOT_FOUND',
          message: `Message flag "${flagId}" not found`,
        });
      }

      await tx.messageFlag.update({
        where: { id: flagId },
        data: {
          review_state: 'escalated',
          reviewed_by_user_id: actorUserId,
          reviewed_at: new Date(),
          review_notes: notes,
        },
      });

      await this.auditService.log(tx, {
        tenantId,
        actorUserId,
        action: 'escalate_flag',
        messageFlagId: flagId,
        conversationId: flag.message.conversation_id,
        metadata: { notes },
      });

      return { conversationId: flag.message.conversation_id };
    });

    // 2) Export the parent conversation. The export itself opens its own
    // RLS-scoped transaction and writes its own audit row (action =
    // export_thread). We intentionally do this outside the first transaction
    // because the PDF upload to S3 can be slow and we do not want to hold
    // a database connection open for it.
    return this.exportThread({ tenantId, actorUserId, conversationId });
  }

  // ─── Export ─────────────────────────────────────────────────────────────────

  async exportThread(input: {
    tenantId: string;
    actorUserId: string;
    conversationId: string;
  }): Promise<{ export_url: string }> {
    const { tenantId, actorUserId, conversationId } = input;
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: actorUserId });

    // 1) Load the thread + audit inside an RLS transaction.
    const pdfInput = await rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, tenant_id: tenantId },
        include: {
          tenant: { select: { name: true } },
          participants: {
            include: {
              user: { select: { id: true, first_name: true, last_name: true, email: true } },
            },
          },
          messages: {
            orderBy: { created_at: 'asc' },
            include: {
              sender: { select: { id: true, first_name: true, last_name: true, email: true } },
              edits: { orderBy: { edited_at: 'asc' } },
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

      await this.auditService.log(tx, {
        tenantId,
        actorUserId,
        action: 'export_thread',
        conversationId,
      });

      const messages: OversightPdfMessage[] = conversation.messages.map((m) => ({
        createdAt: m.created_at,
        senderDisplayName: formatDisplayName(m.sender),
        body: m.body,
        deletedAt: m.deleted_at,
        edits: m.edits.map((e) => ({ editedAt: e.edited_at, previousBody: e.previous_body })),
      }));

      return {
        schoolName: conversation.tenant.name,
        conversationId: conversation.id,
        subject: conversation.subject,
        kind: conversation.kind,
        createdAt: conversation.created_at,
        frozen: conversation.frozen_at !== null,
        frozenReason: conversation.freeze_reason,
        participants: conversation.participants.map((p) => ({
          displayName: formatDisplayName(p.user),
          role: p.role_at_join,
        })),
        messages,
      };
    });

    // 2) Generate PDF and upload. Slow operations outside the DB transaction.
    const pdfBytes = await this.pdfService.generateThreadExport(pdfInput);
    const storageKey = `inbox/oversight/${conversationId}-${Date.now()}.pdf`;
    const fullKey = await this.s3Service.upload(tenantId, storageKey, pdfBytes, 'application/pdf');
    const exportUrl = await this.s3Service.getPresignedUrl(fullKey, 3600, {
      downloadFilename: `conversation-${conversationId}.pdf`,
    });

    return { export_url: exportUrl };
  }

  // ─── Audit log read ─────────────────────────────────────────────────────────

  async listAuditLog(input: {
    tenantId: string;
    actorUserId: string;
    pagination: { page: number; pageSize: number };
  }): Promise<Paginated<OversightAuditEntry>> {
    const { tenantId, actorUserId, pagination } = input;
    const { page, pageSize } = pagination;
    const skip = (page - 1) * pageSize;

    if (page < 1 || pageSize < 1) {
      throw new BadRequestException({
        code: 'INVALID_PAGINATION',
        message: 'page and pageSize must be >= 1',
      });
    }

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: actorUserId });
    return rls.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      const [rows, total] = await Promise.all([
        tx.oversightAccessLog.findMany({
          where: { tenant_id: tenantId },
          orderBy: { created_at: 'desc' },
          skip,
          take: pageSize,
        }),
        tx.oversightAccessLog.count({ where: { tenant_id: tenantId } }),
      ]);

      return {
        data: rows.map((row) => ({
          id: row.id,
          actor_user_id: row.actor_user_id,
          action: row.action,
          conversation_id: row.conversation_id,
          message_flag_id: row.message_flag_id,
          metadata_json: row.metadata_json,
          created_at: row.created_at,
        })),
        meta: { page, pageSize, total },
      };
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDisplayName(
  user: { first_name: string; last_name: string; email: string } | null,
): string {
  if (!user) return 'System';
  const composed = `${user.first_name} ${user.last_name}`.trim();
  return composed.length > 0 ? composed : user.email;
}

function filterForAudit(filter: OversightListFilter): Prisma.InputJsonValue {
  const json: Record<string, unknown> = {};
  if (filter.kind) json.kind = filter.kind;
  if (filter.fromDate) json.fromDate = filter.fromDate.toISOString();
  if (filter.toDate) json.toDate = filter.toDate.toISOString();
  if (filter.participantUserId) json.participantUserId = filter.participantUserId;
  if (filter.hasFlags !== undefined) json.hasFlags = filter.hasFlags;
  if (filter.frozen !== undefined) json.frozen = filter.frozen;
  return json as Prisma.InputJsonValue;
}
