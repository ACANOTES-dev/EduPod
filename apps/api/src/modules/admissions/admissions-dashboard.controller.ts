import { Controller, Get, UseGuards } from '@nestjs/common';

import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { AdmissionsDashboardService } from './admissions-dashboard.service';

@Controller('v1/admissions')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
@ModuleEnabled('admissions')
export class AdmissionsDashboardController {
  constructor(private readonly dashboardService: AdmissionsDashboardService) {}

  // GET /v1/admissions/dashboard-summary
  @Get('dashboard-summary')
  @RequiresPermission('admissions.view')
  async getDashboardSummary(@CurrentTenant() tenant: TenantContext) {
    const data = await this.dashboardService.getSummary(tenant.tenant_id);
    return { data };
  }
}
