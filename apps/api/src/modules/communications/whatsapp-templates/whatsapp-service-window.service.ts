import { Injectable, Logger } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

const WINDOW_DURATION_MS = 24 * 60 * 60 * 1000; // 24h
const CACHE_TTL_SECONDS = 5 * 60; // 5 min
const CLEANUP_RETENTION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days post-expiry

/**
 * Tracks the 24-hour WhatsApp service window per `(tenant_id, recipient_phone)`.
 *
 * Twilio's WhatsApp policy: free-form (non-template) messages are only
 * allowed for 24 hours after the recipient last messaged the business.
 * Beyond that window only approved templates pass — see
 * `TwilioWhatsAppProvider.send()` for the gate.
 *
 * Reads are 5-min Redis-cached; writes are synchronous from the inbound
 * webhook so the very next outbound check sees fresh state.
 */
@Injectable()
export class WhatsAppServiceWindowService {
  private readonly logger = new Logger(WhatsAppServiceWindowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Called from the WhatsApp inbound webhook handler. Idempotent — extends
   * `expires_at` if the row already exists, creates otherwise. Bust the
   * Redis cache so the next isInsideWindow() reads fresh.
   *
   * MUST run inside the webhook request lifecycle (not a background job)
   * so the next outbound dispatch's window check sees the new state.
   */
  async recordInbound(tenantId: string, recipientPhone: string): Promise<void> {
    const normalised = normalisePhone(recipientPhone);
    if (!normalised) return; // garbage phone numbers don't open windows
    const now = new Date();
    const expiresAt = new Date(now.getTime() + WINDOW_DURATION_MS);

    const rls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rls.$transaction(async (tx) => {
      const txdb = tx as unknown as PrismaService;
      await txdb.whatsAppServiceWindow.upsert({
        where: {
          tenant_id_recipient_phone: {
            tenant_id: tenantId,
            recipient_phone: normalised,
          },
        },
        create: {
          tenant_id: tenantId,
          recipient_phone: normalised,
          last_inbound_at: now,
          expires_at: expiresAt,
        },
        update: {
          last_inbound_at: now,
          expires_at: expiresAt,
        },
      });
    });

    const redis = this.redisService.getClient();
    await redis.del(this.cacheKey(tenantId, normalised));
    this.logger.log(
      `[recordInbound] tenant=${tenantId} phone=${normalised} window expires_at=${expiresAt.toISOString()}`,
    );
  }

  /**
   * Hot path used by `TwilioWhatsAppProvider.send()`. Cached `expires_at`
   * (unix-ms) for 5 minutes. A cached `'0'` encodes "no row exists" so
   * cold recipients don't repeatedly hit the DB.
   */
  async isInsideWindow(tenantId: string, recipientPhone: string): Promise<boolean> {
    const normalised = normalisePhone(recipientPhone);
    if (!normalised) return false;
    const key = this.cacheKey(tenantId, normalised);
    const redis = this.redisService.getClient();

    const cached = await redis.get(key);
    if (cached !== null) {
      const expiresMs = Number.parseInt(cached, 10);
      if (!Number.isFinite(expiresMs)) return false;
      return expiresMs > Date.now();
    }

    const row = await this.prisma.whatsAppServiceWindow.findUnique({
      where: {
        tenant_id_recipient_phone: {
          tenant_id: tenantId,
          recipient_phone: normalised,
        },
      },
    });
    const expiresMs = row?.expires_at ? row.expires_at.getTime() : 0;
    await redis.set(key, expiresMs.toString(), 'EX', CACHE_TTL_SECONDS);
    return expiresMs > Date.now();
  }

  /**
   * Daily cron entry point. Deletes service-window rows whose `expires_at`
   * is more than 7 days in the past. Hot rows (still inside the 24h
   * window OR within the 7-day grace period for diagnostics) are kept.
   */
  async cleanupExpired(): Promise<number> {
    const cutoff = new Date(Date.now() - CLEANUP_RETENTION_MS);
    const result = await this.prisma.whatsAppServiceWindow.deleteMany({
      where: { expires_at: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(`[cleanupExpired] deleted ${result.count} stale service-window row(s)`);
    }
    return result.count;
  }

  private cacheKey(tenantId: string, normalised: string): string {
    return `whatsapp-window:${tenantId}:${normalised}`;
  }
}

// ─── Pure helpers (exported for spec coverage) ────────────────────────────────

/**
 * Strip `whatsapp:` prefix and validate E.164 format. Returns null for
 * inputs we cannot canonicalise — callers treat null as "no window opened".
 */
export function normalisePhone(raw: string): string | null {
  if (!raw) return null;
  const stripped = raw.startsWith('whatsapp:') ? raw.slice('whatsapp:'.length) : raw;
  const trimmed = stripped.trim();
  if (!trimmed) return null;
  if (!/^\+\d{8,16}$/.test(trimmed)) return null;
  return trimmed;
}
