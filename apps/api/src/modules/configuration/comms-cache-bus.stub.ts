import { Injectable, Logger } from '@nestjs/common';

/**
 * STUB — Impl 04 wires this to Redis pub/sub on channel `comms:config-changed`.
 *
 * The contract is: every credential mutation (insert/update/delete) MUST
 * publish via this service so the per-tenant client cache (Impl 04) is
 * invalidated across API and worker processes.
 *
 * Today this is a no-op logger. After Impl 04 replaces the implementation,
 * the service interface stays identical — callers do not change.
 */
export type CommsChannel = 'email' | 'sms' | 'whatsapp';

export interface CommsCacheBus {
  publishConfigChanged(tenantId: string, channel: CommsChannel): Promise<void>;
}

export const COMMS_CACHE_BUS = Symbol('COMMS_CACHE_BUS');

@Injectable()
export class CommsCacheBusStub implements CommsCacheBus {
  private readonly logger = new Logger(CommsCacheBusStub.name);

  async publishConfigChanged(tenantId: string, channel: CommsChannel): Promise<void> {
    // Impl 04 will replace this with a real Redis publish.
    // Logging here is deliberate — gives visibility while the stub is in place.
    this.logger.debug(
      `[stub] would publish comms:config-changed { tenant_id: ${tenantId}, channel: ${channel} }`,
    );
  }
}
