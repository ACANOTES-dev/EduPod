import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';

import { isModuleKey } from '@school/shared/modules';

import {
  TenantModuleCacheBusService,
  type TenantModuleInvalidationEvent,
} from '../../../api/src/common/services/tenant-module-cache-bus.service';
import { TenantModuleService } from '../../../api/src/common/services/tenant-module.service';
import { getRedisClient } from '../base/redis.helpers';

@Injectable()
export class TenantModuleCacheBusSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenantModuleCacheBusSubscriber.name);
  private subscriberClient: Redis | null = null;

  constructor(private readonly tenantModuleService: TenantModuleService) {}

  async onModuleInit(): Promise<void> {
    this.subscriberClient = getRedisClient().duplicate();

    this.subscriberClient.on('error', (err: Error) => {
      this.logger.error(`Tenant module cache subscriber error: ${err.message}`, err.stack);
    });

    this.subscriberClient.on('end', () => {
      this.logger.warn(
        'Tenant module cache subscriber disconnected. Worker cache remains eventually consistent via TTL.',
      );
    });

    await this.subscriberClient.subscribe(TenantModuleCacheBusService.CHANNEL);
    this.subscriberClient.on('message', (channel: string, raw: string) => {
      void this.handleMessage(channel, raw);
    });

    this.logger.log(`Subscribed to ${TenantModuleCacheBusService.CHANNEL}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.subscriberClient) return;

    try {
      await this.subscriberClient.unsubscribe(TenantModuleCacheBusService.CHANNEL);
      await this.subscriberClient.quit();
    } catch (err) {
      this.logger.warn(
        `Tenant module subscriber teardown error: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    } finally {
      this.subscriberClient = null;
    }
  }

  private async handleMessage(channel: string, raw: string): Promise<void> {
    if (channel !== TenantModuleCacheBusService.CHANNEL) return;

    const event = this.parseEvent(raw);
    if (!event) return;

    try {
      await this.tenantModuleService.invalidateCache(event.tenantId);
      this.logger.log(
        `Invalidated worker tenant module cache for tenant=${event.tenantId} module=${event.module_key}`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to invalidate worker tenant module cache: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private parseEvent(raw: string): TenantModuleInvalidationEvent | null {
    try {
      const parsed = JSON.parse(raw) as Partial<TenantModuleInvalidationEvent>;
      if (
        typeof parsed.tenantId !== 'string' ||
        typeof parsed.module_key !== 'string' ||
        !isModuleKey(parsed.module_key) ||
        typeof parsed.is_enabled !== 'boolean' ||
        typeof parsed.timestamp !== 'number'
      ) {
        this.logger.warn(`Discarding malformed tenant module invalidation payload: ${raw}`);
        return null;
      }
      return parsed as TenantModuleInvalidationEvent;
    } catch (err) {
      this.logger.warn(
        `Tenant module invalidation JSON parse failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }
}
