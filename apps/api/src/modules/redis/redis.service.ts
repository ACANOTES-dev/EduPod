import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface RedisMemoryInfo {
  maxmemory_bytes: number | null;
  used_memory_bytes: number;
}

function parseRedisInfoNumber(info: string, key: string): number | null {
  const line = info
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${key}:`));

  if (!line) {
    return null;
  }

  const [, rawValue] = line.split(':', 2);
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL is not configured');
    }
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        return Math.min(times * 50, 2000);
      },
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.getClient().ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async getMemoryInfo(): Promise<RedisMemoryInfo> {
    const info = await this.getClient().info('memory');
    const usedMemory = parseRedisInfoNumber(info, 'used_memory');
    const maxmemory = parseRedisInfoNumber(info, 'maxmemory');

    if (usedMemory === null) {
      throw new Error('Redis INFO memory output is missing used_memory');
    }

    return {
      used_memory_bytes: usedMemory,
      maxmemory_bytes: maxmemory && maxmemory > 0 ? maxmemory : null,
    };
  }
}
