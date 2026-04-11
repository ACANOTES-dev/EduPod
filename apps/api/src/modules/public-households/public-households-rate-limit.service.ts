import { Injectable } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';

@Injectable()
export class PublicHouseholdsRateLimitService {
  private readonly limit = 5;
  private readonly ttl = 3600; // 1 hour

  constructor(private readonly redisService: RedisService) {}

  /**
   * Rate-limit public household lookups: 5 attempts per IP per tenant per hour.
   * Higher cost than admissions submissions because each attempt is a guess at
   * a household number + email combination.
   */
  async consume(tenantId: string, ip: string): Promise<{ allowed: boolean }> {
    const client = this.redisService.getClient();
    const key = `ratelimit:public-household-lookup:${tenantId}:${ip}`;

    const count = await client.incr(key);
    if (count === 1) {
      await client.expire(key, this.ttl);
    }

    return { allowed: count <= this.limit };
  }
}
