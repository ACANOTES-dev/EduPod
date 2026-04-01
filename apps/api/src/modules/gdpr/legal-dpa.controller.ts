import { Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { DpaService } from './dpa.service';

@Controller('v1/legal/dpa')
@UseGuards(AuthGuard)
export class LegalDpaController {
  constructor(private readonly dpaService: DpaService) {}

  @Get('current')
  @UseGuards(PermissionGuard)
  @RequiresPermission('legal.view')
  async getCurrent() {
    return this.dpaService.getCurrentVersion();
  }

  @Get('status')
  @UseGuards(PermissionGuard)
  @RequiresPermission('legal.view')
  async getStatus(@CurrentTenant() tenant: TenantContext) {
    return this.dpaService.getStatus(tenant.tenant_id);
  }

  @Post('accept')
  @UseGuards(PermissionGuard)
  @RequiresPermission('legal.manage')
  @HttpCode(HttpStatus.CREATED)
  async accept(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    return this.dpaService.acceptCurrentVersion(tenant.tenant_id, user.sub, request.ip);
  }
}
