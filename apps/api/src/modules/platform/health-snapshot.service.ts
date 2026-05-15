import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, type PlatformHealthSnapshot } from '@prisma/client';

// eslint-disable-next-line school/no-cross-module-internal-import -- Platform health snapshots consume HealthModule's exported HealthService; see ADR-006.
import { HealthService, type FullHealthResult } from '../health/health.service';
import { PrismaService } from '../prisma/prisma.service';

import { RedisPubSubService } from './redis-pubsub.service';

type HealthStatus = FullHealthResult['status'];
type HealthComponent = 'postgresql' | 'redis' | 'meilisearch' | 'bullmq' | 'disk';

const SNAPSHOT_INTERVAL_MS = 60_000;
const SNAPSHOT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 1440;

function serializeChecks(checks: FullHealthResult['checks']): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(checks)) as Prisma.InputJsonValue;
}

@Injectable()
export class HealthSnapshotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HealthSnapshotService.name);
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private lastCleanupAt = 0;
  private lastStatus: HealthStatus | null = null;

  constructor(
    private readonly healthService: HealthService,
    private readonly prisma: PrismaService,
    private readonly redisPubSub: RedisPubSubService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.takeSnapshot();
    }, SNAPSHOT_INTERVAL_MS);
    this.logger.log('Health snapshot interval started (every 60s)');
    void this.takeSnapshot();
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async takeSnapshot(): Promise<void> {
    try {
      const result = await this.healthService.check();

      if (this.lastStatus !== null && this.lastStatus !== result.status) {
        await this.publishHealthUpdate({
          type: 'state_change',
          previous_status: this.lastStatus,
          current_status: result.status,
          timestamp: result.timestamp,
          checks: result.checks,
        });
      }

      await this.publishHealthUpdate({
        type: 'snapshot',
        status: result.status,
        timestamp: result.timestamp,
        uptime: result.uptime,
        checks: result.checks,
      });

      this.lastStatus = result.status;

      await this.prisma.platformHealthSnapshot.create({
        data: {
          status: result.status,
          checks: serializeChecks(result.checks),
          uptime: result.uptime,
        },
      });

      await this.cleanupOldSnapshotsIfDue();
    } catch (err: unknown) {
      this.logger.error('[takeSnapshot] Failed to take health snapshot', err);
    }
  }

  async cleanupOldSnapshots(): Promise<number> {
    const cutoff = new Date(Date.now() - SNAPSHOT_RETENTION_MS);
    const result = await this.prisma.platformHealthSnapshot.deleteMany({
      where: { created_at: { lt: cutoff } },
    });
    this.logger.log(`Cleaned up ${result.count} old health snapshots`);
    return result.count;
  }

  async getHistory(
    hours: number,
    component?: HealthComponent,
  ): Promise<{
    data: PlatformHealthSnapshot[];
    meta: { total: number };
  }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const where = { created_at: { gte: since } };

    const [snapshots, total] = await Promise.all([
      this.prisma.platformHealthSnapshot.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: HISTORY_LIMIT,
      }),
      this.prisma.platformHealthSnapshot.count({ where }),
    ]);

    if (!component) {
      return { data: snapshots, meta: { total } };
    }

    const data = snapshots.map((snapshot) => ({
      ...snapshot,
      checks: this.pickComponent(snapshot.checks, component),
    }));

    return { data, meta: { total } };
  }

  private async cleanupOldSnapshotsIfDue(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) {
      return;
    }

    this.lastCleanupAt = now;
    await this.cleanupOldSnapshots();
  }

  private async publishHealthUpdate(payload: Record<string, unknown>): Promise<void> {
    try {
      await this.redisPubSub.publish('platform:health', payload);
    } catch (err: unknown) {
      this.logger.error('[publishHealthUpdate] Failed to publish health update', err);
    }
  }

  private pickComponent(checks: Prisma.JsonValue, component: HealthComponent): Prisma.JsonValue {
    if (checks === null || typeof checks !== 'object' || Array.isArray(checks)) {
      return checks;
    }

    const record = checks as Prisma.JsonObject;
    return { [component]: record[component] ?? null };
  }
}
