import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { QueueManagementService } from '../queue-admin/queue-management.service';
import { RedisService } from '../redis/redis.service';

export const BULLMQ_HEARTBEAT_REDIS_KEY = 'platform:resilience:bullmq:last_seen_at';

@Injectable()
export class QueueSnapshotHeartbeatTask {
  private readonly logger = new Logger(QueueSnapshotHeartbeatTask.name);

  constructor(
    private readonly queueManagement: QueueManagementService,
    private readonly redis: RedisService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    try {
      const queues = await this.queueManagement.listQueues();
      const healthyCount = queues.filter((queue) => !queue.is_paused).length;
      await this.redis.getClient().set(
        BULLMQ_HEARTBEAT_REDIS_KEY,
        JSON.stringify({
          healthy_count: healthyCount,
          queue_count: queues.length,
          ts: Date.now(),
        }),
        'EX',
        86_400,
      );
    } catch (err: unknown) {
      this.logger.error(
        'Failed to capture BullMQ queue heartbeat',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
