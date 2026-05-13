import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { ModuleKey, TenantContext } from '@school/shared';

import { MODULE_ENABLED_KEY } from '../decorators/module-enabled.decorator';
import { ModuleDisabledException } from '../exceptions/module-disabled.exception';
import { TenantModuleService } from '../services/tenant-module.service';

/**
 * Module-enabled guard.
 *
 * Checks if the current tenant has the required module enabled through
 * TenantModuleService (Redis-cached with 300s TTL).
 *
 * Flow:
 * 1. Read @ModuleEnabled() metadata from the handler/controller
 * 2. If no module required, allow
 * 3. Extract tenantContext from request — requires TenantResolutionMiddleware to run first
 * 4. Check TenantModuleService for the tenant's enabled modules
 * 5. Throw ModuleDisabledException if the required module is not enabled
 */
@Injectable()
export class ModuleEnabledGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantModuleService: TenantModuleService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredModule = this.reflector.getAllAndOverride<ModuleKey | undefined>(
      MODULE_ENABLED_KEY,
      [context.getHandler(), context.getClass()],
    );

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

    const enabled = await this.tenantModuleService.isEnabled(
      tenantContext.tenant_id,
      requiredModule,
    );

    if (!enabled) {
      // SAFETY: TenantModuleService excludes a key in BOTH cases:
      //   (a) tenant_modules row exists with is_enabled=false
      //   (b) NO tenant_modules row exists for this (tenant, key) pair
      //
      // Case (b) is default deny. This is intentional, but it means every
      // gateable module key MUST have a tenant_modules row provisioned for
      // every tenant before enforcement of that key can ship. The
      // canonical-registry backfill migration (Module Gating implementation 02)
      // is the invariant that protects existing tenants from accidental 404s.
      //
      // See Module Gating/STRATEGY.md sections 4.2 and 9 for the rationale.
      throw new ModuleDisabledException(requiredModule);
    }

    return true;
  }
}
