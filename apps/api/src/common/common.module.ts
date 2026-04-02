import { Global, Module } from '@nestjs/common';

import { RlsRoleCheckService } from './guards/rls-role-check.service';
import { CircuitBreakerRegistry } from './services/circuit-breaker-registry';
import { PermissionCacheService } from './services/permission-cache.service';

/**
 * Global common module.
 *
 * Provides shared services (e.g. PermissionCacheService, CircuitBreakerRegistry)
 * that are used across multiple modules via guards, interceptors, and services.
 */
@Global()
@Module({
  providers: [CircuitBreakerRegistry, PermissionCacheService, RlsRoleCheckService],
  exports: [CircuitBreakerRegistry, PermissionCacheService],
})
export class CommonModule {}
