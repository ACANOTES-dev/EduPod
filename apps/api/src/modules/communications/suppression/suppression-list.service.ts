import { Injectable, Logger } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

const CACHE_TTL_SECONDS = 5 * 60;

export type SuppressionChannel = 'email' | 'sms' | 'whatsapp';

export type SuppressionReasonValue =
  | 'hard_bounce'
  | 'soft_bounce_threshold'
  | 'complaint'
  | 'manual'
  | 'unsubscribe';

interface AddSuppressionArgs {
  tenantId: string;
  channel: SuppressionChannel;
  recipient: string;
  reason: SuppressionReasonValue;
  source: string;
  notificationId?: string | null;
  expiresAt?: Date | null;
}

interface ListSuppressionsArgs {
  tenantId: string;
  channel?: SuppressionChannel;
  reason?: SuppressionReasonValue;
  page?: number;
  pageSize?: number;
}

interface SuppressionRow {
  id: string;
  channel: SuppressionChannel;
  recipient_address: string;
  reason: SuppressionReasonValue;
  source: string | null;
  notification_id: string | null;
  expires_at: string | null;
  created_at: string;
}

/**
 * Single source of truth for the suppression list.
 *
 * Two reads on the dispatch hot path: `isSuppressed(...)` and (only on
 * skip) `getSuppressionReason(...)`. The boolean result is cached in
 * Redis (5-min TTL) keyed by `(tenant_id, channel, recipient)`. All
 * mutations explicitly invalidate the cached entry.
 *
 * RLS enforced via `createRlsClient(...)` on every transaction; the
 * `notification_suppression_list` table has FORCE ROW LEVEL SECURITY +
 * `notification_suppression_list_tenant_isolation` policy.
 */
@Injectable()
export class SuppressionListService {
  private readonly logger = new Logger(SuppressionListService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  // ─── Add ────────────────────────────────────────────────────────────────

  async addSuppression(args: AddSuppressionArgs): Promise<void> {
    const rls = createRlsClient(this.prisma, { tenant_id: args.tenantId });
    await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.notificationSuppressionList.upsert({
        where: {
          tenant_id_channel_recipient_address: {
            tenant_id: args.tenantId,
            channel: args.channel,
            recipient_address: args.recipient,
          },
        },
        create: {
          tenant_id: args.tenantId,
          channel: args.channel,
          recipient_address: args.recipient,
          reason: args.reason,
          source: args.source,
          notification_id: args.notificationId ?? null,
          expires_at: args.expiresAt ?? null,
        },
        update: {
          reason: args.reason,
          source: args.source,
          notification_id: args.notificationId ?? null,
          expires_at: args.expiresAt ?? null,
        },
      });
    });

    await this.invalidateCache(args.tenantId, args.channel, args.recipient);
    this.logger.log(
      `Suppression added: tenant=${args.tenantId} channel=${args.channel} recipient=${maskRecipient(
        args.recipient,
      )} reason=${args.reason}`,
    );
  }

  // ─── Check ──────────────────────────────────────────────────────────────

  /**
   * Returns true if the recipient is currently suppressed for this channel.
   * Uses Redis cache (5-min TTL). On cache miss, reads from DB and
   * populates cache. Cache invalidation happens on add/remove.
   *
   * The cache stores `'1'` for suppressed and `'0'` for not-suppressed so
   * we can distinguish "not in cache" from "cached negative".
   */
  async isSuppressed(
    tenantId: string,
    channel: SuppressionChannel,
    recipient: string,
  ): Promise<boolean> {
    const key = this.cacheKey(tenantId, channel, recipient);
    const redis = this.redisService.getClient();
    const cached = await redis.get(key);
    if (cached === '1') return true;
    if (cached === '0') return false;

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const row = await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.notificationSuppressionList.findFirst({
        where: {
          tenant_id: tenantId,
          channel,
          recipient_address: recipient,
          OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
        },
        select: { id: true, reason: true },
      });
    });

    const suppressed = Boolean(row);
    await redis.set(key, suppressed ? '1' : '0', 'EX', CACHE_TTL_SECONDS);
    return suppressed;
  }

  /**
   * Returns the suppression reason if the recipient is suppressed, else null.
   * Used by the dispatch service to populate
   * `failure_reason='suppressed:{reason}'`. Bypasses the boolean cache.
   */
  async getSuppressionReason(
    tenantId: string,
    channel: SuppressionChannel,
    recipient: string,
  ): Promise<SuppressionReasonValue | null> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const row = await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return txdb.notificationSuppressionList.findFirst({
        where: {
          tenant_id: tenantId,
          channel,
          recipient_address: recipient,
          OR: [{ expires_at: null }, { expires_at: { gt: new Date() } }],
        },
        select: { reason: true },
      });
    });
    return (row?.reason as SuppressionReasonValue | undefined) ?? null;
  }

  // ─── Remove (admin) ─────────────────────────────────────────────────────

  async removeSuppression(
    tenantId: string,
    channel: SuppressionChannel,
    recipient: string,
  ): Promise<void> {
    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.notificationSuppressionList.deleteMany({
        where: { tenant_id: tenantId, channel, recipient_address: recipient },
      });
    });
    await this.invalidateCache(tenantId, channel, recipient);
    this.logger.log(
      `Suppression removed: tenant=${tenantId} channel=${channel} recipient=${maskRecipient(
        recipient,
      )}`,
    );
  }

  // ─── List (diagnostics) ─────────────────────────────────────────────────

  async listSuppressions(args: ListSuppressionsArgs): Promise<{
    data: SuppressionRow[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const page = args.page ?? 1;
    const pageSize = Math.min(args.pageSize ?? 20, 100);
    const where = {
      tenant_id: args.tenantId,
      ...(args.channel ? { channel: args.channel } : {}),
      ...(args.reason ? { reason: args.reason } : {}),
    };

    const rls = createRlsClient(this.prisma, { tenant_id: args.tenantId });
    const [rows, total] = await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      return Promise.all([
        txdb.notificationSuppressionList.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        txdb.notificationSuppressionList.count({ where }),
      ]);
    });

    return {
      data: rows.map((r) => ({
        id: r.id,
        channel: r.channel as SuppressionChannel,
        recipient_address: r.recipient_address,
        reason: r.reason as SuppressionReasonValue,
        source: r.source,
        notification_id: r.notification_id,
        expires_at: r.expires_at?.toISOString() ?? null,
        created_at: r.created_at.toISOString(),
      })),
      meta: { page, pageSize, total },
    };
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private cacheKey(tenantId: string, channel: SuppressionChannel, recipient: string): string {
    return `suppression:${tenantId}:${channel}:${recipient.toLowerCase()}`;
  }

  private async invalidateCache(
    tenantId: string,
    channel: SuppressionChannel,
    recipient: string,
  ): Promise<void> {
    await this.redisService.getClient().del(this.cacheKey(tenantId, channel, recipient));
  }
}

function maskRecipient(s: string): string {
  if (s.includes('@')) {
    const [local, domain] = s.split('@');
    return `${(local ?? '').slice(0, 2)}***@${domain ?? ''}`;
  }
  return `${s.slice(0, 4)}***${s.slice(-2)}`;
}
