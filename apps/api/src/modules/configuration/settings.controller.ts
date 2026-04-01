import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { TENANT_SETTINGS_MODULE_SCHEMAS, tenantSettingsSchema } from '@school/shared';
import type { JwtPayload, TenantContext, TenantSettingsModuleKey } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { SettingsService } from './settings.service';

// Partial version of tenantSettingsSchema for PATCH
const updateSettingsSchema = tenantSettingsSchema.deepPartial();

/** Valid module keys for per-module endpoints */
const VALID_MODULE_KEYS = new Set<string>(Object.keys(TENANT_SETTINGS_MODULE_SCHEMAS));

@Controller('v1/settings')
@UseGuards(AuthGuard, PermissionGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // GET /v1/settings
  @Get()
  @RequiresPermission('settings.manage')
  async getSettings(@CurrentTenant() tenant: TenantContext) {
    return this.settingsService.getSettings(tenant.tenant_id);
  }

  // PATCH /v1/settings
  @Patch()
  @RequiresPermission('settings.manage')
  async updateSettings(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateSettingsSchema)) dto: Record<string, unknown>,
  ) {
    return this.settingsService.updateSettings(tenant.tenant_id, dto, user.sub);
  }

  // GET /v1/settings/:moduleKey
  @Get(':moduleKey')
  @RequiresPermission('settings.manage')
  async getModuleSettings(
    @CurrentTenant() tenant: TenantContext,
    @Param('moduleKey') moduleKey: string,
  ) {
    this.assertValidModuleKey(moduleKey);
    return this.settingsService.getModuleSettings(tenant.tenant_id, moduleKey);
  }

  // PATCH /v1/settings/:moduleKey
  @Patch(':moduleKey')
  @RequiresPermission('settings.manage')
  async updateModuleSettings(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('moduleKey') moduleKey: string,
    @Body() dto: Record<string, unknown>,
  ) {
    this.assertValidModuleKey(moduleKey);
    return this.settingsService.updateModuleSettings(tenant.tenant_id, moduleKey, dto, user.sub);
  }

  /**
   * Validates that the moduleKey param is a known settings module key.
   * Throws BadRequestException if not.
   */
  private assertValidModuleKey(moduleKey: string): asserts moduleKey is TenantSettingsModuleKey {
    if (!VALID_MODULE_KEYS.has(moduleKey)) {
      throw new BadRequestException({
        code: 'INVALID_MODULE_KEY',
        message: `Unknown settings module "${moduleKey}". Valid keys: ${[...VALID_MODULE_KEYS].join(', ')}`,
      });
    }
  }
}
