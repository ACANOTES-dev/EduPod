import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';

import {
  updateInboxSettingsSchema,
  updateMessagingPolicySchema,
} from '@school/shared/inbox';
import type { UpdateInboxSettingsDto, UpdateMessagingPolicyDto } from '@school/shared/inbox';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { InboxSettingsService } from './inbox-settings.service';

@Controller('v1/inbox/settings')
@UseGuards(AuthGuard, PermissionGuard)
export class InboxSettingsController {
  constructor(private readonly settingsService: InboxSettingsService) {}

  @Get('policy')
  @RequiresPermission('inbox.settings.read')
  async getPolicy(@CurrentTenant() tenantContext: { tenant_id: string }) {
    const matrix = await this.settingsService.getPolicyMatrix(tenantContext.tenant_id);
    return { matrix };
  }

  @Get('inbox')
  @RequiresPermission('inbox.settings.read')
  async getInboxSettings(@CurrentTenant() tenantContext: { tenant_id: string }) {
    return this.settingsService.getInboxSettings(tenantContext.tenant_id);
  }

  @Put('inbox')
  @RequiresPermission('inbox.settings.write')
  async updateInboxSettings(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Body(new ZodValidationPipe(updateInboxSettingsSchema)) dto: UpdateInboxSettingsDto,
  ) {
    return this.settingsService.updateInboxSettings(tenantContext.tenant_id, dto);
  }

  @Put('policy')
  @RequiresPermission('inbox.settings.write')
  async updatePolicy(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Body(new ZodValidationPipe(updateMessagingPolicySchema)) dto: UpdateMessagingPolicyDto,
  ) {
    const matrix = await this.settingsService.updatePolicyMatrix(tenantContext.tenant_id, dto);
    return { matrix };
  }

  @Post('policy/reset')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('inbox.settings.write')
  async resetPolicy(@CurrentTenant() tenantContext: { tenant_id: string }) {
    const matrix = await this.settingsService.resetPolicyMatrix(tenantContext.tenant_id);
    return { matrix };
  }
}
