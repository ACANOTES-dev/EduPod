import { Controller, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { ConsentService } from './consent.service';

@Controller('v1/parent-portal/consent')
@UseGuards(AuthGuard, PermissionGuard)
export class ParentConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Get()
  @RequiresPermission('parent.view_own_students')
  async getOwnConsents(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.consentService.getParentPortalConsents(tenant.tenant_id, user.sub);
  }

  @Patch(':id/withdraw')
  @RequiresPermission('parent.view_own_students')
  async withdrawOwnConsent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.consentService.withdrawParentPortalConsent(tenant.tenant_id, user.sub, id);
  }
}
