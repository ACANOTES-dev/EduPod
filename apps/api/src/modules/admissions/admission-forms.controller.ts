import { Controller, Get, Post, UseGuards } from '@nestjs/common';

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { AdmissionFormsService } from './admission-forms.service';

@Controller('v1/admission-forms')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
@ModuleEnabled('admissions')
export class AdmissionFormsController {
  constructor(private readonly admissionFormsService: AdmissionFormsService) {}

  // GET /v1/admission-forms/system
  @Get('system')
  @RequiresPermission('admissions.view')
  async getSystemForm(@CurrentTenant() tenant: TenantContext) {
    return this.admissionFormsService.getPublishedForm(tenant.tenant_id);
  }

  // POST /v1/admission-forms/system/rebuild
  @Post('system/rebuild')
  @RequiresPermission('admissions.manage')
  async rebuildSystemForm(@CurrentTenant() tenant: TenantContext, @CurrentUser() user: JwtPayload) {
    return this.admissionFormsService.rebuildSystemForm(tenant.tenant_id, user.sub);
  }
}
