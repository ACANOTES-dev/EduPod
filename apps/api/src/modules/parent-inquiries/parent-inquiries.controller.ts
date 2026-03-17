import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createInquiryMessageSchema,
  createInquirySchema,
  listInquiriesSchema,
} from '@school/shared';
import type {
  CreateInquiryDto,
  CreateInquiryMessageDto,
  JwtPayload,
  ListInquiriesDto,
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

import { ParentInquiriesService } from './parent-inquiries.service';

@Controller('v1/inquiries')
@UseGuards(AuthGuard, PermissionGuard, ModuleEnabledGuard)
@ModuleEnabled('parent_inquiries')
export class ParentInquiriesController {
  constructor(private readonly service: ParentInquiriesService) {}

  @Get()
  @RequiresPermission('inquiries.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listInquiriesSchema))
    query: ListInquiriesDto,
  ) {
    return this.service.listForAdmin(tenant.tenant_id, query);
  }

  @Get('my')
  @RequiresPermission('parent.submit_inquiry')
  async listForParent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listInquiriesSchema))
    query: ListInquiriesDto,
  ) {
    return this.service.listForParent(tenant.tenant_id, user.sub, query);
  }

  @Get(':id')
  @RequiresPermission('inquiries.view')
  async getById(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getByIdForAdmin(tenant.tenant_id, id);
  }

  @Get(':id/parent')
  @RequiresPermission('parent.submit_inquiry')
  async getByIdForParent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getByIdForParent(tenant.tenant_id, user.sub, id);
  }

  @Post()
  @RequiresPermission('parent.submit_inquiry')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createInquirySchema))
    dto: CreateInquiryDto,
  ) {
    return this.service.create(tenant.tenant_id, user.sub, dto);
  }

  @Post(':id/messages')
  @RequiresPermission('inquiries.respond')
  async addAdminMessage(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createInquiryMessageSchema))
    dto: CreateInquiryMessageDto,
  ) {
    return this.service.addAdminMessage(tenant.tenant_id, user.sub, id, dto);
  }

  @Post(':id/messages/parent')
  @RequiresPermission('parent.submit_inquiry')
  async addParentMessage(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createInquiryMessageSchema))
    dto: CreateInquiryMessageDto,
  ) {
    return this.service.addParentMessage(tenant.tenant_id, user.sub, id, dto);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('inquiries.respond')
  async close(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.close(tenant.tenant_id, id);
  }
}
