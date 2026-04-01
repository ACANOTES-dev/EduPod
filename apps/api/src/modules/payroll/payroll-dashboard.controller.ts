import { Controller, Get, UseGuards } from '@nestjs/common';

import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { PayrollDashboardService } from './payroll-dashboard.service';

@Controller('v1/payroll/dashboard')
@UseGuards(AuthGuard, PermissionGuard)
export class PayrollDashboardController {
  constructor(private readonly payrollDashboardService: PayrollDashboardService) {}

  @Get()
  @RequiresPermission('payroll.view')
  async getDashboard(@CurrentTenant() tenant: TenantContext) {
    return this.payrollDashboardService.getDashboard(tenant.tenant_id);
  }
}
