import { Controller, Get, UseGuards } from '@nestjs/common';

import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { FinanceDashboardService } from './finance-dashboard.service';

@Controller('v1/finance/dashboard')
@UseGuards(AuthGuard, PermissionGuard)
export class FinanceDashboardController {
  constructor(private readonly dashboardService: FinanceDashboardService) {}

  @Get()
  @RequiresPermission('finance.view')
  async getDashboard(@CurrentTenant() tenant: TenantContext) {
    return this.dashboardService.getDashboardData(tenant.tenant_id);
  }
}
