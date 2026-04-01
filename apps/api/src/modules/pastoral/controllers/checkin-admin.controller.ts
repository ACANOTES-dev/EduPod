import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import { checkinAggregateQuerySchema, checkinFiltersSchema } from '@school/shared';
import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { CheckinAnalyticsService } from '../services/checkin-analytics.service';
import { CheckinService } from '../services/checkin.service';

// ─── Inline schema for exam comparison (shared barrel not yet exporting) ────

const examComparisonQuerySchema = z.object({
  year_group_id: z.string().uuid().optional(),
  exam_start: z.string(),
  exam_end: z.string(),
});

// ─── Inline pagination schema for student history ───────────────────────────

const studentCheckinsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const GROUP_BY_TO_GRANULARITY: Record<string, 'weekly' | 'monthly'> = {
  day: 'weekly',
  week: 'weekly',
  month: 'monthly',
};

// ─── Controller ─────────────────────────────────────────────────────────────

@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class CheckinAdminController {
  constructor(
    private readonly checkinService: CheckinService,
    private readonly analyticsService: CheckinAnalyticsService,
  ) {}

  // ─── 1. Flagged Check-ins ───────────────────────────────────────────────

  @Get('pastoral/checkins/flagged')
  @RequiresPermission('pastoral.view_checkin_monitoring')
  async flagged(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(checkinFiltersSchema))
    filters: z.infer<typeof checkinFiltersSchema>,
  ) {
    return this.checkinService.getFlaggedCheckins(
      tenant.tenant_id,
      filters,
      filters.page,
      filters.pageSize,
    );
  }

  // ─── 2. Student Check-in History ────────────────────────────────────────

  @Get('pastoral/checkins/students/:studentId')
  @RequiresPermission('pastoral.view_checkin_monitoring')
  async studentHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(studentCheckinsQuerySchema))
    query: z.infer<typeof studentCheckinsQuerySchema>,
  ) {
    return this.checkinService.getStudentCheckins(
      tenant.tenant_id,
      studentId,
      query.page,
      query.pageSize,
    );
  }

  // ─── 3. Mood Trends ────────────────────────────────────────────────────

  @Get('pastoral/checkins/analytics/mood-trends')
  @RequiresPermission('pastoral.view_checkin_aggregate')
  async moodTrends(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(checkinAggregateQuerySchema))
    query: z.infer<typeof checkinAggregateQuerySchema>,
  ) {
    const dateRange = {
      from: query.date_from ?? '',
      to: query.date_to ?? '',
    };

    const granularity = GROUP_BY_TO_GRANULARITY[query.group_by] ?? 'weekly';

    if (query.year_group_id) {
      return this.analyticsService.getYearGroupMoodTrends(
        tenant.tenant_id,
        query.year_group_id,
        dateRange,
        granularity,
      );
    }

    return this.analyticsService.getSchoolMoodTrends(tenant.tenant_id, dateRange, granularity);
  }

  // ─── 4. Day-of-Week Patterns ───────────────────────────────────────────

  @Get('pastoral/checkins/analytics/day-of-week')
  @RequiresPermission('pastoral.view_checkin_aggregate')
  async dayOfWeekPatterns(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(checkinAggregateQuerySchema))
    query: z.infer<typeof checkinAggregateQuerySchema>,
  ) {
    const dateRange = {
      from: query.date_from ?? '',
      to: query.date_to ?? '',
    };

    return this.analyticsService.getDayOfWeekPatterns(
      tenant.tenant_id,
      query.year_group_id ?? null,
      dateRange,
    );
  }

  // ─── 5. Exam Period Comparison ─────────────────────────────────────────

  @Get('pastoral/checkins/analytics/exam-comparison')
  @RequiresPermission('pastoral.view_checkin_aggregate')
  async examComparison(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(examComparisonQuerySchema))
    query: z.infer<typeof examComparisonQuerySchema>,
  ) {
    const examPeriod = {
      start: query.exam_start,
      end: query.exam_end,
    };

    return this.analyticsService.getExamPeriodComparison(
      tenant.tenant_id,
      query.year_group_id ?? null,
      examPeriod,
    );
  }
}
