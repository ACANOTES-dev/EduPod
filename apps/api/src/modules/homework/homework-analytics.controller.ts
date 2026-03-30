import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { HomeworkAnalyticsService } from './homework-analytics.service';

// ─── Query Schemas ───────────────────────────────────────────────────────────

const analyticsQuerySchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  academic_period_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

const loadQuerySchema = analyticsQuerySchema.extend({
  class_id: z.string().uuid().optional(),
});

type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
type LoadQuery = z.infer<typeof loadQuerySchema>;

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('v1/homework/analytics')
@UseGuards(AuthGuard, PermissionGuard)
export class HomeworkAnalyticsController {
  constructor(
    private readonly analyticsService: HomeworkAnalyticsService,
  ) {}

  // GET /v1/homework/analytics/completion-rates
  @Get('completion-rates')
  @RequiresPermission('homework.view_analytics')
  async getCompletionRates(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analyticsService.completionRates(
      tenantContext.tenant_id,
      query,
    );
  }

  // GET /v1/homework/analytics/load
  @Get('load')
  @RequiresPermission('homework.view_analytics')
  async getLoadAnalysis(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Query(new ZodValidationPipe(loadQuerySchema)) query: LoadQuery,
  ) {
    return this.analyticsService.loadAnalysis(tenantContext.tenant_id, query);
  }

  // GET /v1/homework/analytics/load/daily
  @Get('load/daily')
  @RequiresPermission('homework.view_analytics')
  async getDailyLoadHeatmap(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analyticsService.dailyLoadHeatmap(
      tenantContext.tenant_id,
      query,
    );
  }

  // GET /v1/homework/analytics/non-completers
  @Get('non-completers')
  @RequiresPermission('homework.view_analytics')
  async getNonCompleters(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analyticsService.nonCompleters(
      tenantContext.tenant_id,
      query,
    );
  }

  // GET /v1/homework/analytics/correlation
  @Get('correlation')
  @RequiresPermission('homework.view_analytics')
  async getCorrelation(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analyticsService.correlationAnalysis(
      tenantContext.tenant_id,
      query,
    );
  }

  // GET /v1/homework/analytics/student/:studentId
  @Get('student/:studentId')
  @RequiresPermission('homework.view_analytics')
  async getStudentTrends(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analyticsService.studentTrends(
      tenantContext.tenant_id,
      studentId,
      query,
    );
  }

  // GET /v1/homework/analytics/class/:classId
  @Get('class/:classId')
  @RequiresPermission('homework.view_analytics')
  async getClassPatterns(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analyticsService.classPatterns(
      tenantContext.tenant_id,
      classId,
      query,
    );
  }

  // GET /v1/homework/analytics/subject/:subjectId
  @Get('subject/:subjectId')
  @RequiresPermission('homework.view_analytics')
  async getSubjectTrends(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analyticsService.subjectTrends(
      tenantContext.tenant_id,
      subjectId,
      query,
    );
  }

  // GET /v1/homework/analytics/teacher/:staffId
  @Get('teacher/:staffId')
  @RequiresPermission('homework.view_analytics')
  async getTeacherPatterns(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('staffId', ParseUUIDPipe) staffId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analyticsService.teacherPatterns(
      tenantContext.tenant_id,
      staffId,
      query,
    );
  }

  // GET /v1/homework/analytics/year-group/:ygId
  @Get('year-group/:ygId')
  @RequiresPermission('homework.view_analytics')
  async getYearGroupOverview(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('ygId', ParseUUIDPipe) ygId: string,
    @Query(new ZodValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ) {
    return this.analyticsService.yearGroupOverview(
      tenantContext.tenant_id,
      ygId,
      query,
    );
  }
}
