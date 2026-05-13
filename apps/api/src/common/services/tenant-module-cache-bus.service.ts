import { Injectable, Logger } from '@nestjs/common';

import type { ModuleKey } from '@school/shared/modules';

import { RedisService } from '../../modules/redis/redis.service';

export interface TenantModuleInvalidationEvent {
  tenantId: string;
  module_key: ModuleKey;
  is_enabled: boolean;
  timestamp: number;
}

@Injectable()
export class TenantModuleCacheBusService {
  static readonly CHANNEL = 'tenant_modules:invalidated';

  private readonly logger = new Logger(TenantModuleCacheBusService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Best-effort fast-path invalidation. The per-tenant module cache TTL remains
   * the correctness fallback if Redis pub/sub is temporarily unavailable.
   */
  async publishInvalidation(
    tenantId: string,
    moduleKey: ModuleKey,
    isEnabled: boolean,
  ): Promise<void> {
    const event: TenantModuleInvalidationEvent = {
      tenantId,
      module_key: moduleKey,
      is_enabled: isEnabled,
      timestamp: Date.now(),
    };

    try {
      await this.redis
        .getClient()
        .publish(TenantModuleCacheBusService.CHANNEL, JSON.stringify(event));
    } catch (err) {
      this.logger.warn(
        `Failed to publish tenant module invalidation for tenant=${tenantId} module=${moduleKey}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
