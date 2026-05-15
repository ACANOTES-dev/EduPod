import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export type RedisPubSubCallback = (message: Record<string, unknown>) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

@Injectable()
export class RedisPubSubService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisPubSubService.name);
  private readonly callbacks = new Map<string, Set<RedisPubSubCallback>>();
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL is not configured');
    }

    this.publisher = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        return Math.min(times * 50, 2000);
      },
    });
    this.subscriber = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        return Math.min(times * 50, 2000);
      },
    });

    this.subscriber.on('message', (channel: string, rawMessage: string) => {
      this.handleMessage(channel, rawMessage);
    });

    await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.publisher?.quit(), this.subscriber?.quit()]);
    this.publisher = null;
    this.subscriber = null;
    this.callbacks.clear();
  }

  async publish(channel: string, payload: Record<string, unknown>): Promise<void> {
    const message = JSON.stringify(payload);
    await this.getPublisher().publish(channel, message);
    this.logger.debug(`Published platform message on ${channel}`);
  }

  subscribe(channel: string, callback: RedisPubSubCallback): void {
    const existingCallbacks = this.callbacks.get(channel);
    if (existingCallbacks) {
      existingCallbacks.add(callback);
      this.logger.debug(`Registered platform pub/sub callback for ${channel}`);
      return;
    }

    this.callbacks.set(channel, new Set([callback]));
    void this.getSubscriber()
      .subscribe(channel)
      .then(() => this.logger.debug(`Subscribed to platform pub/sub channel ${channel}`))
      .catch((err: unknown) => {
        this.logger.error(`Failed to subscribe to platform pub/sub channel ${channel}`, err);
      });
  }

  unsubscribe(channel: string, callback: RedisPubSubCallback): void {
    const channelCallbacks = this.callbacks.get(channel);
    if (!channelCallbacks) {
      return;
    }

    channelCallbacks.delete(callback);
    if (channelCallbacks.size > 0) {
      this.logger.debug(`Unregistered platform pub/sub callback for ${channel}`);
      return;
    }

    this.callbacks.delete(channel);
    void this.getSubscriber()
      .unsubscribe(channel)
      .then(() => this.logger.debug(`Unsubscribed from platform pub/sub channel ${channel}`))
      .catch((err: unknown) => {
        this.logger.error(`Failed to unsubscribe from platform pub/sub channel ${channel}`, err);
      });
  }

  private handleMessage(channel: string, rawMessage: string): void {
    const channelCallbacks = this.callbacks.get(channel);
    if (!channelCallbacks || channelCallbacks.size === 0) {
      return;
    }

    try {
      const parsed = JSON.parse(rawMessage) as unknown;
      if (!isRecord(parsed)) {
        this.logger.warn(`Ignored non-object platform pub/sub message on ${channel}`);
        return;
      }

      for (const callback of channelCallbacks) {
        callback(parsed);
      }
    } catch (err: unknown) {
      this.logger.warn(`Failed to parse platform pub/sub message on ${channel}`, err);
    }
  }

  private getPublisher(): Redis {
    if (!this.publisher) {
      throw new Error('Redis publisher not initialized');
    }
    return this.publisher;
  }

  private getSubscriber(): Redis {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not initialized');
    }
    return this.subscriber;
  }
}
