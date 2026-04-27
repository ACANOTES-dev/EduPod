import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';

import {
  COMMS_CACHE_BUS_CHANNEL,
  COMMS_PROVIDER_CHANNELS,
  type CommsCacheBusEvent,
  type CommsProviderChannel,
} from '@school/shared';

import { RedisService } from '../redis/redis.service';

type Handler = (event: CommsCacheBusEvent) => void;

/**
 * Redis pub/sub coordinator for per-tenant communications credential
 * cache invalidation.
 *
 * Owns one publisher (the shared RedisService client) and one
 * dedicated subscriber connection (`duplicate()` of the main client —
 * ioredis does not allow regular commands on a connection that has
 * issued SUBSCRIBE).
 *
 * Disconnect-handling decision: on subscriber disconnect we log only.
 * We do NOT queue missed events for replay — providers will reload on
 * next dispatch via cache miss / TTL, and Impl 05's mid-flight
 * `is_enabled` re-check is the safety net for credentials revoked
 * while the bus was disconnected.
 */
@Injectable()
export class CommsCacheBusService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommsCacheBusService.name);
  private subscriberClient: Redis | null = null;
  private readonly handlers = new Set<Handler>();

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    this.subscriberClient = this.redis.getClient().duplicate();

    this.subscriberClient.on('error', (err: Error) => {
      this.logger.error(`Cache bus subscriber error: ${err.message}`, err.stack);
    });

    this.subscriberClient.on('end', () => {
      this.logger.warn(
        'Cache bus subscriber disconnected. Cache will be eventually consistent ' +
          'on reconnect — fetched configs will repopulate from DB on next dispatch.',
      );
    });

    await this.subscriberClient.subscribe(COMMS_CACHE_BUS_CHANNEL);

    this.subscriberClient.on('message', (channel: string, raw: string) => {
      if (channel !== COMMS_CACHE_BUS_CHANNEL) return;
      const event = this.parseEvent(raw);
      if (!event) return;
      for (const handler of this.handlers) {
        try {
          handler(event);
        } catch (err) {
          // A bad handler must NOT take out the whole subscription.
          this.logger.error(
            `Cache bus handler threw for tenant=${event.tenant_id} channel=${event.channel}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    });

    this.logger.log(`Subscribed to ${COMMS_CACHE_BUS_CHANNEL}`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriberClient) {
      try {
        await this.subscriberClient.unsubscribe(COMMS_CACHE_BUS_CHANNEL);
        await this.subscriberClient.quit();
      } catch (err) {
        this.logger.warn(
          `Subscriber teardown error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      this.subscriberClient = null;
    }
    this.handlers.clear();
  }

  /**
   * Publish a config-changed event. Called by `*ConfigService` services
   * AFTER the DB write has committed (race-condition note: never publish
   * before commit, or a subscriber could fetch the OLD config off DB
   * while the new transaction is still pending).
   *
   * Failures are logged but never thrown — a Redis blip MUST NOT block
   * a user-facing config save.
   */
  async publishConfigChanged(tenantId: string, channel: CommsProviderChannel): Promise<void> {
    const event: CommsCacheBusEvent = {
      tenant_id: tenantId,
      channel,
      ts: Date.now(),
    };
    try {
      await this.redis.getClient().publish(COMMS_CACHE_BUS_CHANNEL, JSON.stringify(event));
    } catch (err) {
      this.logger.error(
        `Failed to publish ${COMMS_CACHE_BUS_CHANNEL} event for tenant=${tenantId} channel=${channel}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Register a handler for cache-bus events. Called from each provider's
   * `onModuleInit` to wire `cache.invalidate(tenant_id)` on the matching
   * channel.
   */
  subscribe(handler: Handler): void {
    this.handlers.add(handler);
  }

  /**
   * Remove a handler. Test seam.
   */
  unsubscribe(handler: Handler): void {
    this.handlers.delete(handler);
  }

  private parseEvent(raw: string): CommsCacheBusEvent | null {
    try {
      const parsed = JSON.parse(raw) as Partial<CommsCacheBusEvent>;
      if (
        typeof parsed.tenant_id !== 'string' ||
        typeof parsed.channel !== 'string' ||
        !COMMS_PROVIDER_CHANNELS.includes(parsed.channel as CommsProviderChannel) ||
        typeof parsed.ts !== 'number'
      ) {
        this.logger.warn(`Discarding malformed cache bus payload: ${raw}`);
        return null;
      }
      return parsed as CommsCacheBusEvent;
    } catch (err) {
      this.logger.warn(
        `Cache bus JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
