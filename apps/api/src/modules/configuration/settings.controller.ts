import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { tenantSettingsSchema } from '@school/shared';
import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { SettingsService } from './settings.service';

// Partial version of tenantSettingsSchema for PATCH
const updateSettingsSchema = tenantSettingsSchema.deepPartial();

@Controller('v1/settings')
@UseGuards(AuthGuard, PermissionGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @RequiresPermission('settings.manage')
  async getSettings(@CurrentTenant() tenant: TenantContext) {
    return this.settingsService.getSettings(tenant.tenant_id);
  }

  @Patch()
  @RequiresPermission('settings.manage')
  async updateSettings(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(updateSettingsSchema)) dto: Record<string, unknown>,
  ) {
    return this.settingsService.updateSettings(tenant.tenant_id, dto);
  }
}
