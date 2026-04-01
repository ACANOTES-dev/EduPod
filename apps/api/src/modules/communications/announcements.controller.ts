import {
  Body,
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

import {
  createAnnouncementSchema,
  listAnnouncementsSchema,
  publishAnnouncementSchema,
  updateAnnouncementSchema,
} from '@school/shared';
import type {
  CreateAnnouncementDto,
  JwtPayload,
  ListAnnouncementsDto,
  PublishAnnouncementDto,
  TenantContext,
  UpdateAnnouncementDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { AnnouncementsService } from './announcements.service';

@Controller('v1/announcements')
@UseGuards(AuthGuard, PermissionGuard, ModuleEnabledGuard)
@ModuleEnabled('communications')
export class AnnouncementsController {
  constructor(private readonly service: AnnouncementsService) {}

  @Get()
  @RequiresPermission('communications.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listAnnouncementsSchema))
    query: ListAnnouncementsDto,
  ) {
    return this.service.list(tenant.tenant_id, query);
  }

  @Get('my')
  @RequiresPermission('parent.view_announcements')
  async listForParent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listAnnouncementsSchema))
    query: ListAnnouncementsDto,
  ) {
    return this.service.listForParent(tenant.tenant_id, user.sub, query);
  }

  @Get(':id')
  @RequiresPermission('communications.view')
  async getById(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(tenant.tenant_id, id);
  }

  @Get(':id/delivery-status')
  @RequiresPermission('communications.view')
  async getDeliveryStatus(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getDeliveryStatus(tenant.tenant_id, id);
  }

  @Post()
  @RequiresPermission('communications.manage')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createAnnouncementSchema))
    dto: CreateAnnouncementDto,
  ) {
    return this.service.create(tenant.tenant_id, user.sub, dto);
  }

  @Patch(':id')
  @RequiresPermission('communications.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAnnouncementSchema))
    dto: UpdateAnnouncementDto,
  ) {
    return this.service.update(tenant.tenant_id, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('communications.send')
  async publish(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(publishAnnouncementSchema))
    dto: PublishAnnouncementDto,
  ) {
    return this.service.publish(tenant.tenant_id, user.sub, id, dto);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('communications.manage')
  async archive(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.archive(tenant.tenant_id, id);
  }
}
