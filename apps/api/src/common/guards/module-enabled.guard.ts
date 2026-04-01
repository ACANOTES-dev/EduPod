import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { TenantContext } from '@school/shared';

import { PrismaService } from '../../modules/prisma/prisma.service';
import { RedisService } from '../../modules/redis/redis.service';
import { MODULE_ENABLED_KEY } from '../decorators/module-enabled.decorator';

/**
 * Module-enabled guard.
 *
 * Checks if the current tenant has the required module enabled by querying
 * tenant_modules (Redis-cached with 300s TTL).
 *
 * Flow:
 * 1. Read @ModuleEnabled() metadata from the handler/controller
 * 2. If no module required, allow
 * 3. Extract tenantContext from request — requires TenantResolutionMiddleware to run first
 * 4. Check Redis cache for tenant's enabled modules
 * 5. On cache miss, query tenant_modules for this tenant, cache the result
 * 6. Throw ForbiddenException if the required module is not enabled
 */
@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  private readonly MODULE_CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<string>(MODULE_ENABLED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredModule) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const tenantContext = request['tenantContext'] as TenantContext | null;

    if (!tenantContext) {
      throw new ForbiddenException({
        error: {
          code: 'TENANT_CONTEXT_REQUIRED',
          message: 'Tenant context is required to access this resource',
        },
      });
    }

    const enabledModules = await this.getEnabledModules(tenantContext.tenant_id);

    if (!enabledModules.includes(requiredModule)) {
      throw new ForbiddenException({
        error: {
          code: 'MODULE_DISABLED',
          message: `The "${requiredModule}" module is not enabled for this tenant`,
        },
      });
    }

    return true;
  }

  private async getEnabledModules(tenantId: string): Promise<string[]> {
    const client = this.redis.getClient();
    const cacheKey = `tenant_modules:${tenantId}`;

    const cached = await client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Query tenant_modules — runs outside RLS transaction context
    const modules = await this.prisma.tenantModule.findMany({
      where: { tenant_id: tenantId, is_enabled: true },
      select: { module_key: true },
    });

    const moduleKeys = modules.map((m) => m.module_key);

    await client.setex(cacheKey, this.MODULE_CACHE_TTL, JSON.stringify(moduleKeys));

    return moduleKeys;
  }
}
