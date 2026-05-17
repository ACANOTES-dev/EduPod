import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { RedisPubSubService, type RedisPubSubCallback } from '../platform/redis-pubsub.service';
import { RedisService } from '../redis/redis.service';

export const REDIS_PUBSUB_HEARTBEAT_KEY = 'platform:resilience:pubsub:last_seen_at';

@Injectable()
export class RedisPubSubHeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubHeartbeatService.name);
  private readonly callback: RedisPubSubCallback = (message) => {
    void this.handleHeartbeat(message);
  };

  constructor(
    private readonly redis: RedisService,
    private readonly redisPubSub: RedisPubSubService,
  ) {}

  onModuleInit(): void {
    this.redisPubSub.subscribe('platform:health', this.callback);
  }

  onModuleDestroy(): void {
    this.redisPubSub.unsubscribe('platform:health', this.callback);
  }

  @Interval(10_000)
  async publishHeartbeat(): Promise<void> {
    try {
      await this.redisPubSub.publish('platform:health', {
        source: 'platform-resilience',
        ts: Date.now(),
        type: 'resilience_pubsub_heartbeat',
      });
    } catch (err: unknown) {
      this.logger.warn(
        'Failed to publish Redis pub/sub heartbeat',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async handleHeartbeat(message: Record<string, unknown>): Promise<void> {
    if (message.type !== 'resilience_pubsub_heartbeat') {
      return;
    }
    try {
      const ts = typeof message.ts === 'number' ? message.ts : Date.now();
      await this.redis
        .getClient()
        .set(REDIS_PUBSUB_HEARTBEAT_KEY, JSON.stringify({ ts }), 'EX', 86_400);
    } catch (err: unknown) {
      this.logger.warn(
        'Failed to store Redis pub/sub heartbeat',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
