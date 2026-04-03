import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import type { JwtPayload, TenantContext } from '@school/shared';
import { createPrivacyNoticeSchema, updatePrivacyNoticeSchema } from '@school/shared/gdpr';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import type {
  CreatePrivacyNoticeDto,
  UpdatePrivacyNoticeDto,
} from './dto/create-privacy-notice.dto';
import { PrivacyNoticesService } from './privacy-notices.service';

@Controller('v1/privacy-notices')
@UseGuards(AuthGuard)
export class PrivacyNoticesController {
  constructor(private readonly privacyNoticesService: PrivacyNoticesService) {}

  @Get('current')
  async getCurrent(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.privacyNoticesService.getCurrentForUser(tenant.tenant_id, user.sub);
  }

  @Get()
  @UseGuards(PermissionGuard)
  @RequiresPermission('privacy.view')
  async list(@CurrentTenant() tenant: TenantContext) {
    return this.privacyNoticesService.listVersions(tenant.tenant_id);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequiresPermission('privacy.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createPrivacyNoticeSchema)) dto: CreatePrivacyNoticeDto,
  ) {
    return this.privacyNoticesService.createVersion(tenant.tenant_id, user.sub, dto);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequiresPermission('privacy.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePrivacyNoticeSchema)) dto: UpdatePrivacyNoticeDto,
  ) {
    return this.privacyNoticesService.updateVersion(tenant.tenant_id, id, dto);
  }

  @Post('acknowledge')
  @HttpCode(HttpStatus.CREATED)
  async acknowledge(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.privacyNoticesService.acknowledgeCurrentVersion(
      tenant.tenant_id,
      user.sub,
      request.ip,
    );
  }

  @Post(':id/publish')
  @UseGuards(PermissionGuard)
  @RequiresPermission('privacy.manage')
  async publish(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.privacyNoticesService.publishVersion(tenant.tenant_id, id);
  }
}
