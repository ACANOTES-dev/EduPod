import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

import {
  aiQuerySchema,
  behaviourAnalyticsQuerySchema,
  benchmarkQuerySchema,
  csvExportQuerySchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourAIService } from './behaviour-ai.service';
import { BehaviourAnalyticsService } from './behaviour-analytics.service';
import { BehaviourPulseService } from './behaviour-pulse.service';

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('v1')
@ModuleEnabled('behaviour')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BehaviourAnalyticsController {
  constructor(
    private readonly analyticsService: BehaviourAnalyticsService,
    private readonly pulseService: BehaviourPulseService,
    private readonly aiService: BehaviourAIService,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Pulse ─────────────────────────────────────────────────────────────────

  @Get('behaviour/analytics/pulse')
  @RequiresPermission('behaviour.view')
  async getPulse(@CurrentTenant() tenant: TenantContext) {
    const behaviourSettings = await this.getBehaviourSettings(tenant.tenant_id);
    if (!behaviourSettings.behaviour_pulse_enabled) {
      return { pulse_enabled: false };
    }
    return this.pulseService.getPulse(tenant.tenant_id);
  }

  // ─── Overview ──────────────────────────────────────────────────────────────

  @Get('behaviour/analytics/overview')
  @RequiresPermission('behaviour.view')
  async getOverview(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.analyticsService.getOverview(tenant.tenant_id, user.sub, permissions, query);
  }

  // ─── Heatmap ───────────────────────────────────────────────────────────────

  @Get('behaviour/analytics/heatmap')
  @RequiresPermission('behaviour.view')
  async getHeatmap(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.analyticsService.getHeatmap(tenant.tenant_id, user.sub, permissions, query);
  }

  @Get('behaviour/analytics/heatmap/historical')
  @RequiresPermission('behaviour.view')
  async getHistoricalHeatmap(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.analyticsService.getHistoricalHeatmap(
      tenant.tenant_id,
      user.sub,
      permissions,
      query,
    );
  }

  // ─── Trends ────────────────────────────────────────────────────────────────

  @Get('behaviour/analytics/trends')
  @RequiresPermission('behaviour.view')
  async getTrends(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.analyticsService.getTrends(tenant.tenant_id, user.sub, permissions, query);
  }

  // ─── Categories ────────────────────────────────────────────────────────────

  @Get('behaviour/analytics/categories')
  @RequiresPermission('behaviour.view')
  async getCategories(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.analyticsService.getCategories(tenant.tenant_id, user.sub, permissions, query);
  }

  // ─── Subjects ──────────────────────────────────────────────────────────────

  @Get('behaviour/analytics/subjects')
  @RequiresPermission('behaviour.view')
  async getSubjects(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.analyticsService.getSubjects(tenant.tenant_id, user.sub, permissions, query);
  }

  // ─── Staff Activity ────────────────────────────────────────────────────────

  @Get('behaviour/analytics/staff')
  @RequiresPermission('behaviour.view_staff_analytics')
  async getStaffActivity(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    return this.analyticsService.getStaffActivity(tenant.tenant_id, query);
  }

  // ─── Sanctions ─────────────────────────────────────────────────────────────

  @Get('behaviour/analytics/sanctions')
  @RequiresPermission('behaviour.view')
  async getSanctions(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.analyticsService.getSanctions(tenant.tenant_id, user.sub, permissions, query);
  }

  // ─── Interventions ─────────────────────────────────────────────────────────

  @Get('behaviour/analytics/interventions')
  @RequiresPermission('behaviour.manage')
  async getInterventionOutcomes(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    return this.analyticsService.getInterventionOutcomes(tenant.tenant_id, query);
  }

  // ─── Ratio ─────────────────────────────────────────────────────────────────

  @Get('behaviour/analytics/ratio')
  @RequiresPermission('behaviour.view')
  async getRatio(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.analyticsService.getRatio(tenant.tenant_id, user.sub, permissions, query);
  }

  // ─── Comparisons ──────────────────────────────────────────────────────────

  @Get('behaviour/analytics/comparisons')
  @RequiresPermission('behaviour.view')
  async getComparisons(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.analyticsService.getComparisons(tenant.tenant_id, user.sub, permissions, query);
  }

  // ─── Policy Effectiveness ──────────────────────────────────────────────────

  @Get('behaviour/analytics/policy-effectiveness')
  @RequiresPermission('behaviour.admin')
  async getPolicyEffectiveness(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    return this.analyticsService.getPolicyEffectiveness(tenant.tenant_id, query);
  }

  // ─── Task Completion ──────────────────────────────────────────────────────

  @Get('behaviour/analytics/task-completion')
  @RequiresPermission('behaviour.manage')
  async getTaskCompletion(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    return this.analyticsService.getTaskCompletion(tenant.tenant_id, query);
  }

  // ─── Benchmarks ──────────────────────────────────────────────────────────

  @Get('behaviour/analytics/benchmarks')
  @RequiresPermission('behaviour.admin')
  async getBenchmarks(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(benchmarkQuerySchema))
    query: z.infer<typeof benchmarkQuerySchema>,
  ) {
    return this.analyticsService.getBenchmarks(tenant.tenant_id, query);
  }

  // ─── Teacher Analytics ──────────────────────────────────────────────────

  @Get('behaviour/analytics/teachers')
  @RequiresPermission('behaviour.view_staff_analytics')
  async getTeacherAnalytics(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    return this.analyticsService.getTeacherAnalytics(tenant.tenant_id, query);
  }

  // ─── Class Comparisons ─────────────────────────────────────────────────

  @Get('behaviour/analytics/class-comparisons')
  @RequiresPermission('behaviour.view')
  async getClassComparisons(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(behaviourAnalyticsQuerySchema))
    query: z.infer<typeof behaviourAnalyticsQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.analyticsService.getClassComparisons(
      tenant.tenant_id,
      user.sub,
      permissions,
      query,
    );
  }

  // ─── CSV Export ─────────────────────────────────────────────────────────

  @Get('behaviour/analytics/export/csv')
  @RequiresPermission('behaviour.manage')
  async exportCsv(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(csvExportQuerySchema))
    query: z.infer<typeof csvExportQuerySchema>,
    @Res() res: Response,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    const result = await this.analyticsService.exportCsv(
      tenant.tenant_id,
      user.sub,
      permissions,
      query,
    );
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
    });
    res.send(result.content);
  }

  // ─── AI Query ──────────────────────────────────────────────────────────────

  @Post('behaviour/analytics/ai-query')
  @RequiresPermission('behaviour.ai_query')
  @HttpCode(HttpStatus.OK)
  async aiQuery(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(aiQuerySchema))
    input: z.infer<typeof aiQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    const settings = await this.getBehaviourSettings(tenant.tenant_id);
    return this.aiService.processNLQuery(tenant.tenant_id, user.sub, permissions, input, settings);
  }

  @Get('behaviour/analytics/ai-query/history')
  @RequiresPermission('behaviour.ai_query')
  async aiQueryHistory(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.aiService.getQueryHistory(tenant.tenant_id, user.sub, query.page, query.pageSize);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async getUserPermissions(membershipId: string | null): Promise<string[]> {
    if (!membershipId) return [];
    return this.permissionCacheService.getPermissions(membershipId);
  }

  private async getBehaviourSettings(tenantId: string): Promise<Record<string, unknown>> {
    const tenantSettings = await this.prisma.tenantSetting.findFirst({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });
    const settings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
    return (settings?.behaviour as Record<string, unknown>) ?? {};
  }
}
