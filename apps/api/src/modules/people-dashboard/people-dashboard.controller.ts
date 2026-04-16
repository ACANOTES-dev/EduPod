import { Controller, Get, UseGuards } from '@nestjs/common';

import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { PeopleDashboardService } from './people-dashboard.service';

@Controller('v1/people')
@UseGuards(AuthGuard, PermissionGuard)
export class PeopleDashboardController {
  constructor(private readonly dashboardService: PeopleDashboardService) {}

  // GET /v1/people/dashboard-summary
  @Get('dashboard-summary')
  @RequiresPermission('students.view')
  async getDashboardSummary(@CurrentTenant() tenant: TenantContext) {
    const data = await this.dashboardService.getSummary(tenant.tenant_id);
    return { data };
  }
}
