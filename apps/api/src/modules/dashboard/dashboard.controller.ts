import { Controller, Get, UseGuards } from '@nestjs/common';
import type { JwtPayload } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { DashboardService } from './dashboard.service';

@Controller('v1/dashboard')
@UseGuards(AuthGuard, PermissionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('school-admin')
  @RequiresPermission('students.view')
  async schoolAdmin(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.dashboardService.schoolAdmin(tenantContext.tenant_id, user.sub);
  }

  @Get('parent')
  @RequiresPermission('parent.view_own_students')
  async parent(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.dashboardService.parent(tenantContext.tenant_id, user.sub);
  }

  @Get('teacher')
  @RequiresPermission('attendance.take')
  async teacher(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.dashboardService.teacher(tenantContext.tenant_id, user.sub);
  }
}
