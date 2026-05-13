import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  updateBudgetingTenantPreferencesSchema,
  type BudgetingTenantPreferences,
  type UpdateBudgetingTenantPreferencesDto,
} from '@school/shared/budgeting';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { TenantPreferencesService } from './tenant-preferences.service';

@Controller('v1/budgeting/tenant-preferences')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
@ModuleEnabled('budgeting')
export class TenantPreferencesController {
  constructor(private readonly service: TenantPreferencesService) {}

  // GET /v1/budgeting/tenant-preferences — readable by anyone with
  // `budgeting.view` so the workspace can read `hidden_kpi_keys` and the
  // share modal can read `shareable_link_max_days` without requiring the
  // higher `budgeting.manage` permission.
  @Get()
  @RequiresPermission('budgeting.view')
  get(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUser() user: JwtPayload,
  ): Promise<BudgetingTenantPreferences> {
    return this.service.getOrCreate(ctx.tenant_id, user.sub);
  }

  // PATCH /v1/budgeting/tenant-preferences — gated by `budgeting.manage`.
  @Patch()
  @RequiresPermission('budgeting.manage')
  update(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateBudgetingTenantPreferencesSchema))
    body: UpdateBudgetingTenantPreferencesDto,
  ): Promise<BudgetingTenantPreferences> {
    return this.service.update(ctx.tenant_id, user.sub, body);
  }
}
