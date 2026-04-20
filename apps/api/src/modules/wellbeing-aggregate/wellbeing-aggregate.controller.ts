import { Controller, Get, UseGuards } from '@nestjs/common';

import type { TenantContext } from '@school/shared';
import type { WellbeingDashboardSummary } from '@school/shared/wellbeing';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { WellbeingAggregateService } from './wellbeing-aggregate.service';

@Controller('v1/wellbeing')
@UseGuards(AuthGuard, PermissionGuard)
export class WellbeingAggregateController {
  constructor(private readonly service: WellbeingAggregateService) {}

  // GET /v1/wellbeing/dashboard-summary
  @Get('dashboard-summary')
  @RequiresPermission('wellbeing.view_dashboard')
  async getDashboardSummary(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<{ data: WellbeingDashboardSummary }> {
    const data = await this.service.getDashboardSummary(tenant.tenant_id);
    return { data };
  }
}
