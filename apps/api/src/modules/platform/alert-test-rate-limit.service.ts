import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { RedisService } from '../redis/redis.service';

const TEST_ALL_LIMIT = 5;
const DAY_SECONDS = 24 * 60 * 60;

@Injectable()
export class AlertTestRateLimitService {
  constructor(
    private readonly redis: RedisService,
    private readonly audit: PlatformAuditService,
  ) {}

  async assertCanTestAll(userId: string, audit?: PlatformAuditContext): Promise<void> {
    const key = `platform:alerts:test-all:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const count = await this.redis.getClient().incr(key);
    if (count === 1) {
      await this.redis.getClient().expire(key, DAY_SECONDS);
    }
    if (count > TEST_ALL_LIMIT) {
      throw new HttpException(
        {
          code: 'ALERT_TEST_ALL_RATE_LIMITED',
          message: 'Test all routes is limited to 5 runs per operator per day.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (audit) {
      await this.audit.log({
        ...audit,
        action: 'alert_test_all_routes',
        payload: { after: { count, limit: TEST_ALL_LIMIT } },
        target_resource_type: 'alert_routes',
      });
    }
  }
}
