import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { engagementEventTypeEnum } from '@school/shared';
import type { TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { EngagementAnalyticsService } from './engagement-analytics.service';

// ─── Inline Schemas ─────────────────────────────────────────────────────────

const analyticsFilterSchema = z
  .object({
    academic_year_id: z.string().uuid().optional(),
    event_type: engagementEventTypeEnum.optional(),
    date_from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    date_to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine((value) => !value.date_from || !value.date_to || value.date_from <= value.date_to, {
    message: 'date_from must be before or equal to date_to',
    path: ['date_to'],
  });

type AnalyticsFilterQuery = z.infer<typeof analyticsFilterSchema>;

// ─── Controller ─────────────────────────────────────────────────────────────

@Controller('v1/engagement')
@ModuleEnabled('engagement')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class EngagementAnalyticsController {
  constructor(private readonly analyticsService: EngagementAnalyticsService) {}

  // GET /v1/engagement/analytics/overview
  @Get('analytics/overview')
  @RequiresPermission('engagement.events.view_dashboard')
  async getOverview(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(analyticsFilterSchema)) query: AnalyticsFilterQuery,
  ) {
    return this.analyticsService.getOverview(tenant.tenant_id, query);
  }

  // GET /v1/engagement/analytics/completion-rates
  @Get('analytics/completion-rates')
  @RequiresPermission('engagement.events.view_dashboard')
  async getCompletionRates(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(analyticsFilterSchema)) query: AnalyticsFilterQuery,
  ) {
    return this.analyticsService.getCompletionRates(tenant.tenant_id, query);
  }

  // GET /v1/engagement/calendar-events
  @Get('calendar-events')
  @RequiresPermission('engagement.events.view')
  async getCalendarEvents(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(analyticsFilterSchema)) query: AnalyticsFilterQuery,
  ) {
    return this.analyticsService.getCalendarEvents(tenant.tenant_id, query);
  }
}
