import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';
import { reportsAiModuleKeySchema } from '@school/shared/reports';
import { updateTenantAiFlagSchema, wellbeingAiModuleKeySchema } from '@school/shared/wellbeing';
import type { UpdateTenantAiFlagDto } from '@school/shared/wellbeing';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { AiFlagsService, type AiModuleKey } from './ai-flags.service';

const moduleKeyParamSchema = z.union([wellbeingAiModuleKeySchema, reportsAiModuleKeySchema]);

@Controller('v1/ai-flags')
@UseGuards(AuthGuard, PermissionGuard)
@RequiresPermission('ai_flag.manage')
export class AiFlagsController {
  constructor(private readonly aiFlags: AiFlagsService) {}

  // GET /v1/ai-flags
  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.aiFlags.list(tenant.tenant_id);
  }

  // PATCH /v1/ai-flags/:moduleKey
  @Patch(':moduleKey')
  setFlag(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('moduleKey', new ZodValidationPipe(moduleKeyParamSchema))
    moduleKey: AiModuleKey,
    @Body(new ZodValidationPipe(updateTenantAiFlagSchema.pick({ enabled: true })))
    body: Pick<UpdateTenantAiFlagDto, 'enabled'>,
  ) {
    return this.aiFlags.setFlag(tenant.tenant_id, moduleKey, body.enabled, user.sub);
  }
}
