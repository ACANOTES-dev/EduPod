import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { updateNotificationSettingSchema } from '@school/shared';
import type { TenantContext, UpdateNotificationSettingDto } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { NotificationSettingsService } from './notification-settings.service';

@Controller('v1/notification-settings')
@UseGuards(AuthGuard, PermissionGuard)
export class NotificationSettingsController {
  constructor(
    private readonly notificationSettingsService: NotificationSettingsService,
  ) {}

  @Get()
  @RequiresPermission('notifications.manage')
  async listSettings(@CurrentTenant() tenant: TenantContext) {
    return this.notificationSettingsService.listSettings(tenant.tenant_id);
  }

  @Patch(':type')
  @RequiresPermission('notifications.manage')
  async updateSetting(
    @CurrentTenant() tenant: TenantContext,
    @Param('type') type: string,
    @Body(new ZodValidationPipe(updateNotificationSettingSchema))
    dto: UpdateNotificationSettingDto,
  ) {
    return this.notificationSettingsService.updateSetting(
      tenant.tenant_id,
      type,
      dto,
    );
  }
}
