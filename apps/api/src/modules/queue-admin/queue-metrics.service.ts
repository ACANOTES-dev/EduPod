import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { RedisPubSubService } from '../platform/redis-pubsub.service';

import { QueueManagementService } from './queue-management.service';

const QUEUE_METRICS_INTERVAL_MS = 10_000;

@Injectable()
export class QueueMetricsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueMetricsService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly queueManagementService: QueueManagementService,
    private readonly redisPubSubService: RedisPubSubService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.publishQueueMetrics();
    }, QUEUE_METRICS_INTERVAL_MS);
    void this.publishQueueMetrics();
    this.logger.log('Queue metrics publisher initialized');
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async publishQueueMetrics(): Promise<void> {
    try {
      const queues = await this.queueManagementService.listQueues();
      await this.redisPubSubService.publish('platform:queues', {
        type: 'queue_metrics',
        queues: queues.map((queue) => ({
          name: queue.name,
          is_paused: queue.is_paused,
          waiting: queue.counts.waiting,
          active: queue.counts.active,
          completed: queue.counts.completed,
          failed: queue.counts.failed,
          delayed: queue.counts.delayed,
          paused: queue.counts.paused,
        })),
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      this.logger.error(
        'Failed to publish queue metrics',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
