import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from '../../redis/redis.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const PERSONAL_TTL = 300; // 5 minutes
const AGGREGATE_TTL = 86_400; // 24 hours

const KEY_PREFIX_PERSONAL = 'wellbeing:personal';
const KEY_PREFIX_AGGREGATE = 'wellbeing:aggregate';

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class WorkloadCacheService {
  private readonly logger = new Logger(WorkloadCacheService.name);

  constructor(private readonly redis: RedisService) {}

  // ─── Personal cache ─────────────────────────────────────────────────────

  async getCachedPersonal<T>(
    tenantId: string,
    staffProfileId: string,
    metricType: string,
  ): Promise<T | null> {
    const key = `${KEY_PREFIX_PERSONAL}:${tenantId}:${staffProfileId}:${metricType}`;
    const client = this.redis.getClient();

    const cached = await client.get(key);
    if (cached) {
      this.logger.debug(`Cache hit: ${key}`);
      return JSON.parse(cached) as T;
    }

    return null;
  }

  async setCachedPersonal<T>(
    tenantId: string,
    staffProfileId: string,
    metricType: string,
    data: T,
  ): Promise<void> {
    const key = `${KEY_PREFIX_PERSONAL}:${tenantId}:${staffProfileId}:${metricType}`;
    const client = this.redis.getClient();

    await client.set(key, JSON.stringify(data), 'EX', PERSONAL_TTL);
    this.logger.debug(`Cache set: ${key} (TTL ${PERSONAL_TTL}s)`);
  }

  async invalidatePersonal(
    tenantId: string,
    staffProfileId: string,
  ): Promise<void> {
    const client = this.redis.getClient();
    const pattern = `${KEY_PREFIX_PERSONAL}:${tenantId}:${staffProfileId}:*`;
    const keys = await client.keys(pattern);

    if (keys.length === 0) {
      this.logger.debug(`No keys to invalidate for pattern: ${pattern}`);
      return;
    }

    const pipeline = client.pipeline();
    for (const key of keys) {
      pipeline.del(key);
    }
    await pipeline.exec();

    this.logger.debug(
      `Invalidated ${keys.length} personal cache key(s) for staff ${staffProfileId}`,
    );
  }

  // ─── Aggregate cache ───────────────────────────────────────────────────

  async getCachedAggregate<T>(
    tenantId: string,
    metricType: string,
  ): Promise<T | null> {
    const key = `${KEY_PREFIX_AGGREGATE}:${tenantId}:${metricType}`;
    const client = this.redis.getClient();

    const cached = await client.get(key);
    if (cached) {
      this.logger.debug(`Cache hit: ${key}`);
      return JSON.parse(cached) as T;
    }

    return null;
  }

  async setCachedAggregate<T>(
    tenantId: string,
    metricType: string,
    data: T,
  ): Promise<void> {
    const key = `${KEY_PREFIX_AGGREGATE}:${tenantId}:${metricType}`;
    const client = this.redis.getClient();

    await client.set(key, JSON.stringify(data), 'EX', AGGREGATE_TTL);
    this.logger.debug(`Cache set: ${key} (TTL ${AGGREGATE_TTL}s)`);
  }

  async invalidateAggregate(tenantId: string): Promise<void> {
    const client = this.redis.getClient();
    const pattern = `${KEY_PREFIX_AGGREGATE}:${tenantId}:*`;
    const keys = await client.keys(pattern);

    if (keys.length === 0) {
      this.logger.debug(`No keys to invalidate for pattern: ${pattern}`);
      return;
    }

    const pipeline = client.pipeline();
    for (const key of keys) {
      pipeline.del(key);
    }
    await pipeline.exec();

    this.logger.debug(
      `Invalidated ${keys.length} aggregate cache key(s) for tenant ${tenantId}`,
    );
  }

  // ─── Bulk set (used by cron) ───────────────────────────────────────────

  async setAllAggregateMetrics(
    tenantId: string,
    metrics: Record<string, unknown>,
  ): Promise<void> {
    const client = this.redis.getClient();
    const pipeline = client.pipeline();

    const entries = Object.entries(metrics);
    for (const [metricType, data] of entries) {
      const key = `${KEY_PREFIX_AGGREGATE}:${tenantId}:${metricType}`;
      pipeline.set(key, JSON.stringify(data), 'EX', AGGREGATE_TTL);
    }

    await pipeline.exec();

    this.logger.debug(
      `Bulk-set ${entries.length} aggregate metric(s) for tenant ${tenantId}`,
    );
  }
}
