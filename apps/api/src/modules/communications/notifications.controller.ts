import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { listNotificationsSchema } from '@school/shared';
import type {
  JwtPayload,
  ListNotificationsDto,
  TenantContext,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { NotificationsService } from './notifications.service';

@Controller('v1/notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listNotificationsSchema))
    query: ListNotificationsDto,
  ) {
    return this.service.listForUser(tenant.tenant_id, user.sub, query);
  }

  @Get('unread-count')
  async getUnreadCount(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.getUnreadCount(tenant.tenant_id, user.sub);
  }

  @Get('admin/failed')
  @UseGuards(PermissionGuard, ModuleEnabledGuard)
  @ModuleEnabled('communications')
  @RequiresPermission('communications.view')
  async listFailed(@CurrentTenant() tenant: TenantContext) {
    return this.service.listFailed(tenant.tenant_id, { page: 1, pageSize: 100 });
  }

  @Patch(':id/read')
  async markRead(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.markAsRead(tenant.tenant_id, user.sub, id);
  }

  @Post('mark-all-read')
  @HttpCode(HttpStatus.OK)
  async markAllRead(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.markAllAsRead(tenant.tenant_id, user.sub);
  }
}
