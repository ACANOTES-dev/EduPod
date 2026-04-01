import {
  Body,
  Controller,
  Delete,
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
  createWebsitePageSchema,
  listWebsitePagesSchema,
  updateWebsitePageSchema,
} from '@school/shared';
import type {
  CreateWebsitePageDto,
  JwtPayload,
  ListWebsitePagesDto,
  TenantContext,
  UpdateWebsitePageDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { WebsitePagesService } from './website-pages.service';

@Controller('v1/website')
@UseGuards(AuthGuard, PermissionGuard, ModuleEnabledGuard)
@ModuleEnabled('website')
@RequiresPermission('website.manage')
export class WebsitePagesController {
  constructor(private readonly service: WebsitePagesService) {}

  @Get('pages')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listWebsitePagesSchema))
    query: ListWebsitePagesDto,
  ) {
    return this.service.list(tenant.tenant_id, query);
  }

  @Get('navigation')
  async getNavigation(
    @CurrentTenant() tenant: TenantContext,
    @Query('locale') locale: string = 'en',
  ) {
    return this.service.getNavigation(tenant.tenant_id, locale);
  }

  @Get('pages/:id')
  async getById(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.getById(tenant.tenant_id, id);
  }

  @Post('pages')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createWebsitePageSchema))
    dto: CreateWebsitePageDto,
  ) {
    return this.service.create(tenant.tenant_id, user.sub, dto);
  }

  @Patch('pages/:id')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateWebsitePageSchema))
    dto: UpdateWebsitePageDto,
  ) {
    return this.service.update(tenant.tenant_id, id, dto);
  }

  @Post('pages/:id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.publish(tenant.tenant_id, id);
  }

  @Post('pages/:id/unpublish')
  @HttpCode(HttpStatus.OK)
  async unpublish(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.unpublish(tenant.tenant_id, id);
  }

  @Delete('pages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.delete(tenant.tenant_id, id);
  }
}
