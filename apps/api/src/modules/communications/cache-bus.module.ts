import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module';

import { CommsCacheBusService } from './comms-cache-bus.service';

/**
 * Tiny module that owns the Redis pub/sub coordinator for per-tenant
 * communications credential cache invalidation.
 *
 * Lives in its own module so both `ConfigurationModule` (which publishes
 * after credential mutations) and `CommunicationsModule` (whose providers
 * subscribe) can import it without forming a cycle. Do NOT register
 * `CommsCacheBusService` directly in either of those modules.
 */
@Module({
  imports: [RedisModule],
  providers: [CommsCacheBusService],
  exports: [CommsCacheBusService],
})
export class CommsCacheBusModule {}
