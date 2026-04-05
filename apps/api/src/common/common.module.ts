import { Global, Module } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';

import { RlsRoleCheckService } from './guards/rls-role-check.service';
import { CircuitBreakerRegistry } from './services/circuit-breaker-registry';
import { StructuredLoggerService } from './services/logger.service';
import { LokiLogShipper } from './services/loki-log-shipper.service';
import { PermissionCacheService } from './services/permission-cache.service';
import { RequestContextService } from './services/request-context.service';

/**
 * Global common module.
 *
 * Provides shared services (e.g. PermissionCacheService, CircuitBreakerRegistry)
 * that are used across multiple modules via guards, interceptors, and services.
 */
@Global()
@Module({
  providers: [
    CircuitBreakerRegistry,
    LokiLogShipper,
    PermissionCacheService,
    RequestContextService,
    RlsRoleCheckService,
  ],
  exports: [CircuitBreakerRegistry, LokiLogShipper, PermissionCacheService, RequestContextService],
})
export class CommonModule implements OnModuleInit {
  constructor(private readonly lokiShipper: LokiLogShipper) {}

  onModuleInit(): void {
    StructuredLoggerService.setShipper(this.lokiShipper);
  }
}
