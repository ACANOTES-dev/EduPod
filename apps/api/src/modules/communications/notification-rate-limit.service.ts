import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';

/**
 * Per-parent notification rate limiting using Redis sliding window counters.
 *
 * Rate limits:
 * - Per channel per hour: 10 notifications per parent
 * - All channels per day: 30 notifications per parent
 *
 * Exemptions:
 * - `in_app` channel: always allowed (no rate limit)
 * - Safeguarding template keys (`safeguarding_*`): bypass rate limits (safety-critical)
 */
@Injectable()
export class NotificationRateLimitService {
  private readonly logger = new Logger(NotificationRateLimitService.name);

  /** Max notifications per channel per hour per user */
  private readonly CHANNEL_HOUR_LIMIT = 10;
  /** Max total notifications (all channels) per day per user */
  private readonly ALL_CHANNELS_DAY_LIMIT = 30;

  /** TTL for hourly buckets (1 hour + 60s buffer) */
  private readonly HOUR_TTL = 3660;
  /** TTL for daily buckets (24 hours + 60s buffer) */
  private readonly DAY_TTL = 86_460;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Check whether a notification is allowed under rate limits and increment counters.
   *
   * @param tenantId  - The tenant context
   * @param userId    - The recipient user (parent) ID
   * @param channel   - Notification channel (email, sms, whatsapp, in_app)
   * @param templateKey - Optional template key; `safeguarding_*` bypasses limits
   * @returns `{ allowed: true }` or `{ allowed: false, reason: string }`
   */
  async checkAndIncrement(
    tenantId: string,
    userId: string,
    channel: string,
    templateKey?: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    // in_app notifications are always allowed — no rate limit
    if (channel === 'in_app') {
      return { allowed: true };
    }

    // Safeguarding notifications bypass rate limits (safety-critical)
    if (templateKey && templateKey.startsWith('safeguarding_')) {
      this.logger.debug(
        `Bypassing rate limit for safeguarding notification: ${templateKey}`,
      );
      return { allowed: true };
    }

    const client = this.redisService.getClient();
    const hourBucket = this.getHourBucket();
    const dayBucket = this.getDayBucket();

    // ── Check per-channel hourly limit ──────────────────────────────────────
    const channelHourKey = `ratelimit:notif:${tenantId}:${userId}:${channel}:h:${hourBucket}`;
    const channelHourCount = await client.incr(channelHourKey);

    if (channelHourCount === 1) {
      await client.expire(channelHourKey, this.HOUR_TTL);
    }

    if (channelHourCount > this.CHANNEL_HOUR_LIMIT) {
      this.logger.warn(
        `Rate limit exceeded: ${channel} hourly limit (${this.CHANNEL_HOUR_LIMIT}) for user ${userId} in tenant ${tenantId}`,
      );
      return {
        allowed: false,
        reason: `Hourly ${channel} notification limit (${this.CHANNEL_HOUR_LIMIT}) exceeded`,
      };
    }

    // ── Check all-channels daily limit ──────────────────────────────────────
    const dayKey = `ratelimit:notif:${tenantId}:${userId}:d:${dayBucket}`;
    const dayCount = await client.incr(dayKey);

    if (dayCount === 1) {
      await client.expire(dayKey, this.DAY_TTL);
    }

    if (dayCount > this.ALL_CHANNELS_DAY_LIMIT) {
      this.logger.warn(
        `Rate limit exceeded: daily all-channel limit (${this.ALL_CHANNELS_DAY_LIMIT}) for user ${userId} in tenant ${tenantId}`,
      );
      return {
        allowed: false,
        reason: `Daily notification limit (${this.ALL_CHANNELS_DAY_LIMIT}) exceeded`,
      };
    }

    return { allowed: true };
  }

  /** Returns an hour-granularity bucket string, e.g. "2026032714" */
  private getHourBucket(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const h = String(now.getUTCHours()).padStart(2, '0');
    return `${y}${m}${d}${h}`;
  }

  /** Returns a day-granularity bucket string, e.g. "20260327" */
  private getDayBucket(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }
}
