import { Injectable, Logger } from '@nestjs/common';

/**
 * Cache-bus DI contract for the three communication-config services.
 *
 * Impl 03 introduced this as a no-op stub. Impl 04 replaced the production
 * binding with a Redis pub/sub-backed implementation
 * (`CommsCacheBusService` in `apps/api/src/modules/communications/`).
 * The DI token + interface remain here so unit tests can still inject
 * a lightweight fake without depending on Redis or ioredis types.
 *
 * Production wiring lives in `configuration.module.ts`:
 *
 *   { provide: COMMS_CACHE_BUS, useExisting: CommsCacheBusService }
 *
 * Test wiring (see `*-config.service.spec.ts`) substitutes a `jest.fn()`
 * that asserts publish-after-commit ordering.
 */
export type CommsChannel = 'email' | 'sms' | 'whatsapp';

export interface CommsCacheBus {
  publishConfigChanged(tenantId: string, channel: CommsChannel): Promise<void>;
}

export const COMMS_CACHE_BUS = Symbol('COMMS_CACHE_BUS');

/**
 * Standalone stub kept for backward compatibility. NOT registered in the
 * production module after Impl 04 — the real service comes via
 * `CommsCacheBusModule`. Tests that want a logging stub instead of a
 * `jest.fn()` can still construct this directly.
 */
@Injectable()
export class CommsCacheBusStub implements CommsCacheBus {
  private readonly logger = new Logger(CommsCacheBusStub.name);

  async publishConfigChanged(tenantId: string, channel: CommsChannel): Promise<void> {
    this.logger.debug(
      `[stub] publishConfigChanged { tenant_id: ${tenantId}, channel: ${channel} }`,
    );
  }
}
