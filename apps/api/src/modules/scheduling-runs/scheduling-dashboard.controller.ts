import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { SchedulingDashboardService } from './scheduling-dashboard.service';

const baseQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
});

const preferencesQuerySchema = baseQuerySchema.extend({
  staff_id: z.string().uuid().optional(),
});

@Controller('v1/scheduling-dashboard')
@UseGuards(AuthGuard, PermissionGuard)
export class SchedulingDashboardController {
  constructor(
    private readonly dashboardService: SchedulingDashboardService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  /**
   * GET /v1/scheduling-dashboard/overview
   * High-level scheduling stats for the academic year.
   */
  @Get('overview')
  @RequiresPermission('schedule.view_auto_reports')
  async overview(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(baseQuerySchema))
    query: z.infer<typeof baseQuerySchema>,
  ) {
    return this.dashboardService.overview(tenant.tenant_id, query.academic_year_id);
  }

  /**
   * GET /v1/scheduling-dashboard/workload
   * Per-teacher period count for the academic year.
   */
  @Get('workload')
  @RequiresPermission('schedule.view_auto_reports')
  async workload(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(baseQuerySchema))
    query: z.infer<typeof baseQuerySchema>,
  ) {
    return this.dashboardService.workload(tenant.tenant_id, query.academic_year_id);
  }

  /**
   * GET /v1/scheduling-dashboard/unassigned
   * Classes missing schedule coverage.
   */
  @Get('unassigned')
  @RequiresPermission('schedule.view_auto_reports')
  async unassigned(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(baseQuerySchema))
    query: z.infer<typeof baseQuerySchema>,
  ) {
    return this.dashboardService.unassigned(tenant.tenant_id, query.academic_year_id);
  }

  /**
   * GET /v1/scheduling-dashboard/room-utilisation
   * Per-room utilisation stats for the academic year.
   */
  @Get('room-utilisation')
  @RequiresPermission('schedule.view_auto_reports')
  async roomUtilisation(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(baseQuerySchema))
    query: z.infer<typeof baseQuerySchema>,
  ) {
    return this.dashboardService.roomUtilisation(tenant.tenant_id, query.academic_year_id);
  }

  /**
   * GET /v1/scheduling-dashboard/trends
   * Historical scheduling metrics across runs.
   */
  @Get('trends')
  @RequiresPermission('schedule.view_auto_reports')
  async trends(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(baseQuerySchema))
    query: z.infer<typeof baseQuerySchema>,
  ) {
    return this.dashboardService.trends(tenant.tenant_id, query.academic_year_id);
  }

  /**
   * GET /v1/scheduling-dashboard/preferences
   * Staff preference satisfaction from the latest run.
   * Accessible to users with schedule.view_auto_reports OR schedule.view_own_satisfaction.
   * Users with only schedule.view_own_satisfaction can only see their own data.
   */
  @Get('preferences')
  @RequiresPermission('schedule.view_own_satisfaction')
  async preferences(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(preferencesQuerySchema))
    query: z.infer<typeof preferencesQuerySchema>,
  ) {
    // If user has view_auto_reports, allow filtering by any staff_id.
    // For view_own_satisfaction only, scope to their own staff profile.
    let hasFullAccess = false;
    if (user.membership_id) {
      const permissions = await this.permissionCache.getPermissions(user.membership_id);
      hasFullAccess = permissions.includes('schedule.view_auto_reports');
    }

    let staffId: string | undefined;
    if (hasFullAccess) {
      staffId = query.staff_id;
    } else {
      // For own-satisfaction only, scope to the requesting user's staff profile
      const staffProfile = await this.dashboardService.getStaffProfileId(
        tenant.tenant_id,
        user.sub,
      );
      staffId = staffProfile ?? undefined;
    }

    return this.dashboardService.preferences(
      tenant.tenant_id,
      query.academic_year_id,
      staffId,
    );
  }
}
