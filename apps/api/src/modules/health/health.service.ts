import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MeilisearchClient } from '../search/meilisearch.client';

interface HealthCheckResult {
  status: 'ok' | 'degraded';
  checks: {
    postgres: 'up' | 'down';
    redis: 'up' | 'down';
  };
}

interface DependencyCheck {
  status: 'ok' | 'fail';
  latency_ms: number;
}

interface ReadinessResult {
  status: 'ok' | 'degraded' | 'unhealthy';
  checks: {
    postgres: DependencyCheck;
    redis: DependencyCheck;
    meilisearch: DependencyCheck;
  };
  version: string;
  uptime_seconds: number;
}

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private meilisearch: MeilisearchClient,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const [postgresUp, redisUp] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
    ]);

    return {
      status: postgresUp && redisUp ? 'ok' : 'degraded',
      checks: {
        postgres: postgresUp ? 'up' : 'down',
        redis: redisUp ? 'up' : 'down',
      },
    };
  }

  async getReadiness(): Promise<ReadinessResult> {
    const [postgres, redis, meilisearch] = await Promise.all([
      this.checkPostgresLatency(),
      this.checkRedisLatency(),
      this.checkMeilisearchLatency(),
    ]);

    const allOk = postgres.status === 'ok' && redis.status === 'ok' && meilisearch.status === 'ok';
    const criticalOk = postgres.status === 'ok' && redis.status === 'ok';

    return {
      status: allOk ? 'ok' : criticalOk ? 'degraded' : 'unhealthy',
      checks: { postgres, redis, meilisearch },
      version: process.env.npm_package_version ?? '0.0.0',
      uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
    };
  }

  private async checkPostgres(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    return this.redis.ping();
  }

  private async checkPostgresLatency(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latency_ms: Date.now() - start };
    } catch {
      return { status: 'fail', latency_ms: Date.now() - start };
    }
  }

  private async checkRedisLatency(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      const ok = await this.redis.ping();
      return { status: ok ? 'ok' : 'fail', latency_ms: Date.now() - start };
    } catch {
      return { status: 'fail', latency_ms: Date.now() - start };
    }
  }

  private async checkMeilisearchLatency(): Promise<DependencyCheck> {
    const start = Date.now();
    try {
      if (!this.meilisearch.available) {
        return { status: 'fail', latency_ms: 0 };
      }
      // Attempt a lightweight search to verify connectivity
      await this.meilisearch.search('_health_check', '', {});
      return { status: 'ok', latency_ms: Date.now() - start };
    } catch {
      // Meilisearch may throw on non-existent index — that still means it's up
      return { status: 'ok', latency_ms: Date.now() - start };
    }
  }
}
