import { Injectable } from '@nestjs/common';

interface Bucket {
  count: number;
  windowStartMs: number;
}

/**
 * In-memory sliding-window rate limiter for behaviour NL queries.
 *
 * Scope: per (tenant, user). Default 30 queries / hour. Buckets expire
 * lazily when a new call arrives after the window closes. Process-local
 * — multi-instance deploys will allow up to `limit * instances` / hour,
 * which is acceptable for this feature's cost profile.
 */
@Injectable()
export class BehaviourAiRateLimiterService {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly limit: number = 30,
    private readonly windowMs: number = 60 * 60 * 1000,
  ) {}

  /**
   * Returns `{ allowed, remaining, retryAfterMs }`. Increments the bucket
   * on allow.
   */
  check(
    tenantId: string,
    userId: string,
    now: number = Date.now(),
  ): {
    allowed: boolean;
    remaining: number;
    retryAfterMs: number;
  } {
    const key = `${tenantId}:${userId}`;
    const existing = this.buckets.get(key);
    if (!existing || now - existing.windowStartMs >= this.windowMs) {
      this.buckets.set(key, { count: 1, windowStartMs: now });
      return { allowed: true, remaining: this.limit - 1, retryAfterMs: 0 };
    }
    if (existing.count >= this.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: this.windowMs - (now - existing.windowStartMs),
      };
    }
    existing.count += 1;
    return { allowed: true, remaining: this.limit - existing.count, retryAfterMs: 0 };
  }

  reset(tenantId: string, userId: string): void {
    this.buckets.delete(`${tenantId}:${userId}`);
  }
}
