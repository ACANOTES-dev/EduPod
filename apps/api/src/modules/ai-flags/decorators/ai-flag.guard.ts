import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { WellbeingAiModuleKey } from '@school/shared/wellbeing';

import { AiFlagsService } from '../ai-flags.service';

import { REQUIRES_AI_FLAG_KEY } from './requires-ai-flag.decorator';

/**
 * AiFlagGuard — gates routes decorated with `@RequiresAiFlag(moduleKey)`.
 *
 * Registered globally via APP_GUARD. Routes without the decorator pass
 * through. Routes with the decorator load the per-tenant flag (cached
 * for 5 minutes) and throw `403 AI_DISABLED` when the flag is off.
 */
@Injectable()
export class AiFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly aiFlags: AiFlagsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const moduleKey = this.reflector.getAllAndOverride<WellbeingAiModuleKey | undefined>(
      REQUIRES_AI_FLAG_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!moduleKey) return true;

    const request = ctx.switchToHttp().getRequest<Record<string, unknown>>();
    const tenantContext = request['tenantContext'] as { tenant_id: string } | null | undefined;
    const tenantId = tenantContext?.tenant_id;

    if (!tenantId) {
      throw new ForbiddenException({
        code: 'TENANT_REQUIRED',
        message: 'AI-gated routes require a resolved tenant context',
      });
    }

    const enabled = await this.aiFlags.isEnabled(tenantId, moduleKey);
    if (!enabled) {
      throw new ForbiddenException({
        code: 'AI_DISABLED',
        message: `AI features for ${moduleKey} are disabled for this tenant`,
      });
    }
    return true;
  }
}
