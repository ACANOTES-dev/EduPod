import { Controller, Get, UseGuards } from '@nestjs/common';
import type { BoardReportSummary, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { BoardReportService } from '../services/board-report.service';

@Controller('v1')
@ModuleEnabled('staff_wellbeing')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BoardReportController {
  constructor(private readonly boardReportService: BoardReportService) {}

  @Get('staff-wellbeing/reports/termly-summary')
  @RequiresPermission('wellbeing.view_board_report')
  async getTermlySummary(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<BoardReportSummary> {
    return this.boardReportService.generateTermlySummary(tenant.tenant_id);
  }
}
