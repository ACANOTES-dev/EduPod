import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';

export type VerifyChannel = 'email' | 'sms' | 'whatsapp';

export interface VerifyRateLimitResult {
  allowed: boolean;
  retry_after_seconds?: number;
  current_count?: number;
  limit?: number;
}

/**
 * Sliding-window rate limiter for the verify/test endpoints. Independent of
 * `NotificationRateLimitService` — verifying a tenant's credentials must
 * not consume any parent's allowance, and a parent who has hit their daily
 * cap must not block a tenant from running a verification.
 *
 * Implementation: fixed 1-hour bucket key keyed by UTC hour, INCR + EXPIRE.
 * Limit: 3 per channel per hour per tenant. Bucket key:
 *   `verify:{tenantId}:{channel}:{YYYYMMDDHH}`
 *
 * The 4th call within the same UTC hour is rejected with `allowed=false`
 * and `retry_after_seconds` computed against the start of the next UTC
 * hour.
 */
@Injectable()
export class VerifyRateLimitService {
  private readonly logger = new Logger(VerifyRateLimitService.name);

  /** Verifies allowed per channel per hour per tenant. */
  static readonly LIMIT = 3;

  /** TTL for the bucket key (1 hour + 60s buffer for clock skew). */
  private readonly BUCKET_TTL_SECONDS = 3660;

  constructor(private readonly redisService: RedisService) {}

  async checkAndIncrement(
    tenantId: string,
    channel: VerifyChannel,
  ): Promise<VerifyRateLimitResult> {
    const client = this.redisService.getClient();
    const bucket = this.getHourBucket();
    const key = `verify:${tenantId}:${channel}:${bucket}`;

    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, this.BUCKET_TTL_SECONDS);
    }

    if (count > VerifyRateLimitService.LIMIT) {
      const now = new Date();
      const nextHour = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          now.getUTCHours() + 1,
          0,
          0,
          0,
        ),
      );
      const retryAfter = Math.max(1, Math.ceil((nextHour.getTime() - now.getTime()) / 1000));

      this.logger.warn(
        `Verify rate limit exceeded for tenant=${tenantId} channel=${channel} count=${count}`,
      );

      return {
        allowed: false,
        retry_after_seconds: retryAfter,
        current_count: count,
        limit: VerifyRateLimitService.LIMIT,
      };
    }

    return { allowed: true, current_count: count, limit: VerifyRateLimitService.LIMIT };
  }

  private getHourBucket(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    const h = String(now.getUTCHours()).padStart(2, '0');
    return `${y}${m}${d}${h}`;
  }
}
