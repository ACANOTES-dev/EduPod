import { Injectable } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';

@Injectable()
export class AdmissionsRateLimitService {
  private readonly limit = 3;
  private readonly ttl = 3600; // 1 hour

  constructor(private readonly redisService: RedisService) {}

  /**
   * Check and increment the rate limit counter for a public admissions submission.
   * Limit: 3 submissions per IP per tenant per hour.
   */
  async checkAndIncrement(
    tenantId: string,
    ip: string,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const client = this.redisService.getClient();
    const key = `ratelimit:admissions:${tenantId}:${ip}`;

    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, this.ttl);
    }

    if (count > this.limit) {
      return { allowed: false, remaining: 0 };
    }

    return { allowed: true, remaining: this.limit - count };
  }
}
