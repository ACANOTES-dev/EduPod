import { Body, Controller, Get, HttpCode, HttpStatus, Put, UseGuards } from '@nestjs/common';

import type { JwtPayload, TenantContext } from '@school/shared';
import { updateWellbeingChannelPreferencesSchema } from '@school/shared/wellbeing';
import type { UpdateWellbeingChannelPreferencesDto } from '@school/shared/wellbeing';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { WellbeingNotificationsService } from './wellbeing-notifications.service';

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('v1/wellbeing-notifications')
@UseGuards(AuthGuard, PermissionGuard)
export class WellbeingNotificationsController {
  constructor(private readonly service: WellbeingNotificationsService) {}

  // GET /v1/wellbeing-notifications/channels
  @Get('channels')
  @RequiresPermission('settings.manage')
  async getChannels(@CurrentTenant() tenant: TenantContext) {
    const data = await this.service.getChannels(tenant.tenant_id);
    return { data };
  }

  // PUT /v1/wellbeing-notifications/channels
  @Put('channels')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('settings.manage')
  async updateChannels(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateWellbeingChannelPreferencesSchema))
    dto: UpdateWellbeingChannelPreferencesDto,
  ) {
    const data = await this.service.upsertChannels(tenant.tenant_id, user.sub, dto);
    return { data };
  }
}
