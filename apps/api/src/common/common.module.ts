import { Global, Module } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../modules/prisma/prisma.service';
import { RedisService } from '../modules/redis/redis.service';

import { RlsRoleCheckService } from './guards/rls-role-check.service';
import { CircuitBreakerRegistry } from './services/circuit-breaker-registry';
import { StructuredLoggerService } from './services/logger.service';
import { LokiLogShipper } from './services/loki-log-shipper.service';
import { PermissionCacheService } from './services/permission-cache.service';
import { RequestContextService } from './services/request-context.service';
import { TenantCodePoolService } from './services/tenant-code-pool.service';
import { TenantModuleCacheBusService } from './services/tenant-module-cache-bus.service';
import {
  TENANT_MODULE_PRISMA_CLIENT,
  TENANT_MODULE_REDIS_CLIENT,
  TenantModuleService,
} from './services/tenant-module.service';

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
    TenantCodePoolService,
    { provide: TENANT_MODULE_PRISMA_CLIENT, useExisting: PrismaService },
    { provide: TENANT_MODULE_REDIS_CLIENT, useExisting: RedisService },
    TenantModuleCacheBusService,
    TenantModuleService,
  ],
  exports: [
    CircuitBreakerRegistry,
    LokiLogShipper,
    PermissionCacheService,
    RequestContextService,
    TenantCodePoolService,
    TenantModuleCacheBusService,
    TenantModuleService,
  ],
})
export class CommonModule implements OnModuleInit {
  constructor(private readonly lokiShipper: LokiLogShipper) {}

  onModuleInit(): void {
    StructuredLoggerService.setShipper(this.lokiShipper);
  }
}
