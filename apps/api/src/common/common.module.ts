import { Global, Module } from '@nestjs/common';

import { PermissionCacheService } from './services/permission-cache.service';

/**
 * Global common module.
 *
 * Provides shared services (e.g. PermissionCacheService) that are used
 * across multiple modules via guards and interceptors.
 */
@Global()
@Module({
  providers: [PermissionCacheService],
  exports: [PermissionCacheService],
})
export class CommonModule {}
