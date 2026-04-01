import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  createNotificationTemplateSchema,
  listNotificationTemplatesSchema,
  updateNotificationTemplateSchema,
} from '@school/shared';
import type {
  CreateNotificationTemplateDto,
  ListNotificationTemplatesDto,
  TenantContext,
  UpdateNotificationTemplateDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { NotificationTemplatesService } from './notification-templates.service';

@Controller('v1/notification-templates')
@UseGuards(AuthGuard, PermissionGuard, ModuleEnabledGuard)
@ModuleEnabled('communications')
@RequiresPermission('communications.manage')
export class NotificationTemplatesController {
  constructor(private readonly service: NotificationTemplatesService) {}

  @Get()
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listNotificationTemplatesSchema))
    query: ListNotificationTemplatesDto,
  ) {
    return this.service.list(tenant.tenant_id, query);
  }

  @Get(':id')
  async getById(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(tenant.tenant_id, id);
  }

  @Post()
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createNotificationTemplateSchema))
    dto: CreateNotificationTemplateDto,
  ) {
    return this.service.create(tenant.tenant_id, dto);
  }

  @Patch(':id')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateNotificationTemplateSchema))
    dto: UpdateNotificationTemplateDto,
  ) {
    return this.service.update(tenant.tenant_id, id, dto);
  }
}
