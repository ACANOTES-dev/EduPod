import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { AiFlagsController } from './ai-flags.controller';
import { AiFlagsService } from './ai-flags.service';
import { AiFlagGuard } from './decorators/ai-flag.guard';

/**
 * AiFlagsModule — per-(tenant, module) AI feature gate.
 *
 * Owns the `tenant_ai_flags` table (seeded by impl 01), the admin CRUD at
 * `/v1/admin/ai-flags`, and the global `AiFlagGuard` that enforces
 * `@RequiresAiFlag(moduleKey)` on Wave 3 AI endpoints.
 *
 * `AiFlagsService` is exported so Wave 5 impl 18 (admin UI) and other
 * modules can call `isEnabled(tenantId, moduleKey)` directly when they
 * need to branch on the flag without requesting the full guard treatment.
 *
 * Global modules consumed implicitly: `PrismaModule` (PrismaService),
 * `CommonModule` (PermissionCacheService for PermissionGuard),
 * `AuditLogModule` (AuditLogInterceptor logs every PATCH automatically).
 */
@Module({
  controllers: [AiFlagsController],
  providers: [AiFlagsService, { provide: APP_GUARD, useClass: AiFlagGuard }],
  exports: [AiFlagsService],
})
export class AiFlagsModule {}
