import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { NotificationChannel, Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { PLATFORM_ROLE_TO_MESSAGING_ROLE } from '@school/shared/inbox';
import type { MessagingRole } from '@school/shared/inbox';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const INBOX_FALLBACK_SCAN_TENANT_JOB = 'inbox:fallback-scan-tenant';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InboxFallbackScanTenantPayload {
  tenant_id: string;
}

/** Supported fallback channels — the inbox itself is the source, never a target. */
const FALLBACK_CHANNEL_SET: ReadonlySet<NotificationChannel> = new Set<NotificationChannel>([
  'email',
  'sms',
  'whatsapp',
]);

/** Admin-tier + office-tier roles are lumped into the admin bucket for fallback purposes. */
const ADMIN_BUCKET_ROLES: ReadonlySet<MessagingRole> = new Set<MessagingRole>([
  'owner',
  'principal',
  'vice_principal',
  'office',
  'finance',
  'nurse',
]);

/** Per-cycle chunk size — a tenant with >500 stale unread messages drains across cycles. */
const SCAN_CHUNK_SIZE = 500;

/** Truncation cap for the message body rendered into the notification payload. */
const SNIPPET_MAX_LEN = 280;

interface CandidateRow {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  created_at: Date;
}

interface ParticipantRow {
  conversation_id: string;
  user_id: string;
  unread_count: number;
}

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Per-tenant inbox fallback scanner.
 *
 * Run by `InboxFallbackCheckProcessor`'s fan-out. For the given tenant:
 *
 *  1. Load the tenant's inbox settings and short-circuit if messaging is
 *     disabled or neither fallback bucket is enabled.
 *  2. Run a single bounded SQL scan for candidate messages older than
 *     `min(adminThreshold, teacherThreshold)`.
 *  3. Resolve each sender's canonical `MessagingRole` in one batch query.
 *  4. Partition candidates into the admin bucket and the teacher bucket
 *     and filter each bucket by its own per-bucket age threshold.
 *  5. For each surviving message, find unread recipients (skipping the
 *     sender), materialise `notification` rows on the configured channels,
 *     and stamp `messages.fallback_dispatched_at` so the same message
 *     never fires twice.
 *
 * Guarantees:
 *
 *  - Frozen conversations are never escalated.
 *  - Soft-deleted messages are never escalated.
 *  - Messages with `disable_fallback = true` are never escalated.
 *  - The sender of a message is never notified about their own message.
 *  - Parent / student senders are never escalated — fallback only applies
 *    to staff-originated traffic.
 *  - If a recipient has no contact on a configured channel, that channel
 *    is silently skipped for that recipient (other channels still fire).
 *
 * Integration: we create `notification` rows with template_key
 * `inbox_message_fallback` and let the existing `dispatch-queued` /
 * `dispatch-notifications` pipeline handle actual provider delivery.
 * This keeps Twilio / Resend / idempotency concerns in one place.
 */
@Processor(QUEUE_NAMES.NOTIFICATIONS, {
  lockDuration: 5 * 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class InboxFallbackScanTenantProcessor extends WorkerHost {
  private readonly logger = new Logger(InboxFallbackScanTenantProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<InboxFallbackScanTenantPayload>): Promise<void> {
    if (job.name !== INBOX_FALLBACK_SCAN_TENANT_JOB) {
      return;
    }

    const { tenant_id } = job.data;
    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant_id}::text, true)`;
        await tx.$executeRaw`SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000000'::text, true)`;

        await this.scanTenant(tenant_id, tx as unknown as PrismaClient);
      },
      { maxWait: 30_000, timeout: 5 * 60_000 },
    );
  }

  // ─── Core scan ────────────────────────────────────────────────────────────

  private async scanTenant(tenantId: string, tx: PrismaClient): Promise<void> {
    const settings = await tx.tenantSettingsInbox.findUnique({
      where: { tenant_id: tenantId },
    });

    if (!settings) {
      this.logger.debug(`Tenant ${tenantId} has no inbox settings row — skipping`);
      return;
    }

    if (!settings.messaging_enabled) {
      this.logger.debug(`Tenant ${tenantId} has messaging disabled — skipping`);
      return;
    }

    const adminEnabled = settings.fallback_admin_enabled;
    const teacherEnabled = settings.fallback_teacher_enabled;

    if (!adminEnabled && !teacherEnabled) {
      this.logger.debug(`Tenant ${tenantId} has no fallback buckets enabled — skipping`);
      return;
    }

    const adminChannels = this.filterChannels(settings.fallback_admin_channels);
    const teacherChannels = this.filterChannels(settings.fallback_teacher_channels);

    if (
      adminEnabled &&
      adminChannels.length === 0 &&
      teacherEnabled &&
      teacherChannels.length === 0
    ) {
      this.logger.debug(
        `Tenant ${tenantId} has fallback enabled but no supported channels configured — skipping`,
      );
      return;
    }

    const now = new Date();
    const adminMs = settings.fallback_admin_after_hours * 3600 * 1000;
    const teacherMs = settings.fallback_teacher_after_hours * 3600 * 1000;

    // Widen the SQL pass to the smaller of the two enabled thresholds so a
    // teacher-only tenant does not drag in 24h-old admin messages and a
    // 3h-only scan does not miss 24h-old admin messages.
    const enabledThresholds: number[] = [];
    if (adminEnabled && adminChannels.length > 0) enabledThresholds.push(adminMs);
    if (teacherEnabled && teacherChannels.length > 0) enabledThresholds.push(teacherMs);
    if (enabledThresholds.length === 0) return;

    const minThresholdMs = Math.min(...enabledThresholds);
    const cutoff = new Date(now.getTime() - minThresholdMs);

    const candidates = await this.loadCandidateMessages(tenantId, cutoff, tx);
    if (candidates.length === 0) {
      this.logger.debug(`Tenant ${tenantId}: no fallback candidates`);
      return;
    }

    const senderIds = Array.from(new Set(candidates.map((c) => c.sender_user_id)));
    const rolesByUser = await this.resolveSenderRoles(tenantId, senderIds, tx);

    const adminBucket: CandidateRow[] = [];
    const teacherBucket: CandidateRow[] = [];

    for (const candidate of candidates) {
      const role = rolesByUser.get(candidate.sender_user_id);
      if (!role) continue;

      const ageMs = now.getTime() - candidate.created_at.getTime();

      if (role === 'teacher') {
        if (teacherEnabled && teacherChannels.length > 0 && ageMs >= teacherMs) {
          teacherBucket.push(candidate);
        }
      } else if (ADMIN_BUCKET_ROLES.has(role)) {
        if (adminEnabled && adminChannels.length > 0 && ageMs >= adminMs) {
          adminBucket.push(candidate);
        }
      }
      // Parent / student senders are intentionally never escalated.
    }

    if (adminBucket.length === 0 && teacherBucket.length === 0) {
      this.logger.debug(
        `Tenant ${tenantId}: ${candidates.length} candidate(s) inspected, none met a bucket threshold`,
      );
      return;
    }

    const adminResult = await this.dispatchBucket(tenantId, adminBucket, adminChannels, tx);
    const teacherResult = await this.dispatchBucket(tenantId, teacherBucket, teacherChannels, tx);

    this.logger.log(
      `Tenant ${tenantId}: fallback fired — admin: ${adminResult.messagesStamped} msg / ${adminResult.notificationsCreated} notif, teacher: ${teacherResult.messagesStamped} msg / ${teacherResult.notificationsCreated} notif`,
    );
  }

  // ─── Candidate scan ───────────────────────────────────────────────────────

  private async loadCandidateMessages(
    tenantId: string,
    cutoff: Date,
    tx: PrismaClient,
  ): Promise<CandidateRow[]> {
    // Use the Prisma client (not raw SQL) so RLS policies apply and the
    // type surface is strict. The `idx_messages_fallback_scan` index on
    // `(tenant_id, fallback_dispatched_at, created_at)` backs this query.
    const rows = await tx.message.findMany({
      where: {
        tenant_id: tenantId,
        fallback_dispatched_at: null,
        disable_fallback: false,
        deleted_at: null,
        created_at: { lt: cutoff },
        conversation: {
          frozen_at: null,
        },
      },
      select: {
        id: true,
        conversation_id: true,
        sender_user_id: true,
        body: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
      take: SCAN_CHUNK_SIZE,
    });

    return rows.map((row) => ({
      id: row.id,
      conversation_id: row.conversation_id,
      sender_user_id: row.sender_user_id,
      body: row.body,
      created_at: row.created_at,
    }));
  }

  // ─── Role resolution ──────────────────────────────────────────────────────

  private async resolveSenderRoles(
    tenantId: string,
    userIds: string[],
    tx: PrismaClient,
  ): Promise<Map<string, MessagingRole | null>> {
    const result = new Map<string, MessagingRole | null>();
    if (userIds.length === 0) return result;

    const memberships = await tx.tenantMembership.findMany({
      where: {
        tenant_id: tenantId,
        user_id: { in: userIds },
        membership_status: 'active',
      },
      select: {
        user_id: true,
        membership_roles: {
          select: { role: { select: { role_key: true } } },
        },
      },
    });

    for (const userId of userIds) {
      const membership = memberships.find((m) => m.user_id === userId);
      if (!membership) {
        result.set(userId, null);
        continue;
      }
      const roleKeys = membership.membership_roles.map((mr) => mr.role.role_key);
      result.set(userId, foldRoleKeys(roleKeys));
    }

    return result;
  }

  // ─── Dispatch a bucket ────────────────────────────────────────────────────

  private async dispatchBucket(
    tenantId: string,
    bucket: CandidateRow[],
    channels: NotificationChannel[],
    tx: PrismaClient,
  ): Promise<{ messagesStamped: number; notificationsCreated: number }> {
    if (bucket.length === 0 || channels.length === 0) {
      return { messagesStamped: 0, notificationsCreated: 0 };
    }

    const conversationIds = Array.from(new Set(bucket.map((m) => m.conversation_id)));

    // Load unread participants for every conversation in the bucket in one pass.
    const participantRows: ParticipantRow[] = await tx.conversationParticipant.findMany({
      where: {
        tenant_id: tenantId,
        conversation_id: { in: conversationIds },
        unread_count: { gt: 0 },
      },
      select: {
        conversation_id: true,
        user_id: true,
        unread_count: true,
      },
    });

    // conversation_id -> unread recipient user_ids
    const unreadByConversation = new Map<string, Set<string>>();
    for (const row of participantRows) {
      let set = unreadByConversation.get(row.conversation_id);
      if (!set) {
        set = new Set<string>();
        unreadByConversation.set(row.conversation_id, set);
      }
      set.add(row.user_id);
    }

    // Collect the union of all recipient user_ids to batch-resolve contacts.
    const allRecipientIds = new Set<string>();
    for (const msg of bucket) {
      const unread = unreadByConversation.get(msg.conversation_id);
      if (!unread) continue;
      for (const uid of unread) {
        if (uid === msg.sender_user_id) continue;
        allRecipientIds.add(uid);
      }
    }

    if (allRecipientIds.size === 0) {
      return { messagesStamped: 0, notificationsCreated: 0 };
    }

    const contactsByUser = await this.resolveContacts(tenantId, Array.from(allRecipientIds), tx);

    // Resolve sender display names for the notification body.
    const senderIds = Array.from(new Set(bucket.map((m) => m.sender_user_id)));
    const senders = await tx.user.findMany({
      where: { id: { in: senderIds } },
      select: { id: true, first_name: true, last_name: true, email: true },
    });
    const senderNameById = new Map<string, string>();
    for (const s of senders) {
      const fullName = `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
      senderNameById.set(s.id, fullName || s.email || 'A staff member');
    }

    const notificationRows: Prisma.NotificationUncheckedCreateInput[] = [];
    const messagesToStamp: string[] = [];

    for (const msg of bucket) {
      const unread = unreadByConversation.get(msg.conversation_id);
      if (!unread || unread.size === 0) {
        // All recipients have already read this message — nothing to do.
        continue;
      }

      const snippet = buildSnippet(msg.body);
      const senderName = senderNameById.get(msg.sender_user_id) ?? 'A staff member';

      let createdForMessage = 0;

      for (const recipientId of unread) {
        if (recipientId === msg.sender_user_id) continue;

        const contact = contactsByUser.get(recipientId);
        if (!contact) continue;

        for (const channel of channels) {
          if (!hasContactForChannel(contact, channel)) {
            continue;
          }

          notificationRows.push({
            tenant_id: tenantId,
            recipient_user_id: recipientId,
            channel,
            template_key: 'inbox_message_fallback',
            locale: contact.locale ?? 'en',
            status: 'queued',
            source_entity_type: 'inbox_message',
            source_entity_id: msg.id,
            payload_json: {
              conversation_id: msg.conversation_id,
              message_id: msg.id,
              sender_name: senderName,
              snippet,
            } satisfies Record<string, unknown>,
          });
          createdForMessage += 1;
        }
      }

      // Even if no recipient ultimately had a deliverable contact we still
      // stamp the message — re-scanning for the same set next cycle would
      // produce the same zero-dispatch outcome.
      messagesToStamp.push(msg.id);
      void createdForMessage;
    }

    if (notificationRows.length > 0) {
      await tx.notification.createMany({ data: notificationRows });
    }

    if (messagesToStamp.length > 0) {
      await tx.message.updateMany({
        where: { id: { in: messagesToStamp }, tenant_id: tenantId },
        data: { fallback_dispatched_at: new Date() },
      });
    }

    return {
      messagesStamped: messagesToStamp.length,
      notificationsCreated: notificationRows.length,
    };
  }

  // ─── Contact resolution ───────────────────────────────────────────────────

  private async resolveContacts(
    tenantId: string,
    userIds: string[],
    tx: PrismaClient,
  ): Promise<Map<string, ResolvedContact>> {
    const result = new Map<string, ResolvedContact>();
    if (userIds.length === 0) return result;

    const users = await tx.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, preferred_locale: true },
    });

    const parents = await tx.parent.findMany({
      where: { tenant_id: tenantId, user_id: { in: userIds } },
      select: { user_id: true, phone: true, whatsapp_phone: true },
    });
    const parentByUser = new Map<string, { phone: string | null; whatsapp_phone: string | null }>();
    for (const p of parents) {
      if (p.user_id) {
        parentByUser.set(p.user_id, {
          phone: p.phone ?? null,
          whatsapp_phone: p.whatsapp_phone ?? null,
        });
      }
    }

    for (const u of users) {
      const parentContact = parentByUser.get(u.id);
      result.set(u.id, {
        email: u.email ?? null,
        phone: parentContact?.phone ?? null,
        whatsapp: parentContact?.whatsapp_phone ?? null,
        locale: u.preferred_locale ?? null,
      });
    }

    return result;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private filterChannels(raw: string[]): NotificationChannel[] {
    const out: NotificationChannel[] = [];
    const seen = new Set<string>();
    for (const r of raw) {
      if (seen.has(r)) continue;
      seen.add(r);
      if (FALLBACK_CHANNEL_SET.has(r as NotificationChannel)) {
        out.push(r as NotificationChannel);
      }
    }
    return out;
  }
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

interface ResolvedContact {
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  locale: string | null;
}

function hasContactForChannel(contact: ResolvedContact, channel: NotificationChannel): boolean {
  switch (channel) {
    case 'email':
      return !!contact.email;
    case 'sms':
      return !!contact.phone;
    case 'whatsapp':
      return !!contact.whatsapp;
    case 'in_app':
      // The inbox is the source — we never fall back to in_app.
      return false;
  }
}

function buildSnippet(body: string): string {
  const normalised = body.replace(/\s+/g, ' ').trim();
  if (normalised.length <= SNIPPET_MAX_LEN) return normalised;
  return `${normalised.slice(0, SNIPPET_MAX_LEN - 1)}…`;
}

/**
 * Priority ordering — matches `RoleMappingService.foldRoleKeys` in the API.
 * Admin tier wins over teacher wins over office/finance/nurse wins over
 * parent / student. A user who is both staff and parent still sends as staff.
 */
const ROLE_PRIORITY: Record<MessagingRole, number> = {
  owner: 100,
  principal: 90,
  vice_principal: 80,
  teacher: 70,
  office: 60,
  finance: 50,
  nurse: 40,
  parent: 20,
  student: 10,
};

function foldRoleKeys(roleKeys: string[]): MessagingRole | null {
  let best: MessagingRole | null = null;
  for (const key of roleKeys) {
    const bucket = PLATFORM_ROLE_TO_MESSAGING_ROLE[key];
    if (!bucket) continue;
    if (best === null || ROLE_PRIORITY[bucket] > ROLE_PRIORITY[best]) {
      best = bucket;
    }
  }
  return best;
}
