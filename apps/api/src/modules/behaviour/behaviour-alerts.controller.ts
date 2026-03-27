import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  alertListQuerySchema,
  dismissAlertSchema,
  snoozeAlertSchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BehaviourAlertsService } from './behaviour-alerts.service';

@Controller('v1')
@ModuleEnabled('behaviour')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BehaviourAlertsController {
  constructor(private readonly alertsService: BehaviourAlertsService) {}

  @Get('behaviour/alerts')
  @RequiresPermission('behaviour.view')
  async listAlerts(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(alertListQuerySchema))
    query: z.infer<typeof alertListQuerySchema>,
  ) {
    return this.alertsService.listAlerts(tenant.tenant_id, user.sub, query);
  }

  @Get('behaviour/alerts/badge')
  @RequiresPermission('behaviour.view')
  async getBadgeCount(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    const count = await this.alertsService.getBadgeCount(tenant.tenant_id, user.sub);
    return { count };
  }

  @Get('behaviour/alerts/:id')
  @RequiresPermission('behaviour.view')
  async getAlert(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.alertsService.getAlert(tenant.tenant_id, user.sub, id);
  }

  @Patch('behaviour/alerts/:id/seen')
  @RequiresPermission('behaviour.view')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markSeen(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.alertsService.markSeen(tenant.tenant_id, user.sub, id);
  }

  @Patch('behaviour/alerts/:id/acknowledge')
  @RequiresPermission('behaviour.view')
  @HttpCode(HttpStatus.NO_CONTENT)
  async acknowledge(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.alertsService.acknowledge(tenant.tenant_id, user.sub, id);
  }

  @Patch('behaviour/alerts/:id/snooze')
  @RequiresPermission('behaviour.view')
  @HttpCode(HttpStatus.NO_CONTENT)
  async snooze(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(snoozeAlertSchema))
    dto: z.infer<typeof snoozeAlertSchema>,
  ) {
    await this.alertsService.snooze(tenant.tenant_id, user.sub, id, new Date(dto.snoozed_until));
  }

  @Patch('behaviour/alerts/:id/resolve')
  @RequiresPermission('behaviour.view')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resolve(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.alertsService.resolve(tenant.tenant_id, user.sub, id);
  }

  @Patch('behaviour/alerts/:id/dismiss')
  @RequiresPermission('behaviour.view')
  @HttpCode(HttpStatus.NO_CONTENT)
  async dismiss(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(dismissAlertSchema))
    dto: z.infer<typeof dismissAlertSchema>,
  ) {
    await this.alertsService.dismiss(tenant.tenant_id, user.sub, id, dto.reason);
  }
}
