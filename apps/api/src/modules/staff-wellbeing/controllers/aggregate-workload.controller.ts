import { Controller, Get, UseGuards } from '@nestjs/common';
import type {
  AbsenceTrends,
  AggregateTimetableQuality,
  AggregateWorkloadSummary,
  CorrelationResult,
  CoverFairnessResult,
  SubstitutionPressure,
  TenantContext,
} from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { WorkloadCacheService } from '../services/workload-cache.service';
import { WorkloadComputeService } from '../services/workload-compute.service';

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('v1')
@ModuleEnabled('staff_wellbeing')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class AggregateWorkloadController {
  constructor(
    private readonly computeService: WorkloadComputeService,
    private readonly cacheService: WorkloadCacheService,
  ) {}

  // ─── 1. Workload Summary ────────────────────────────────────────────────

  @Get('staff-wellbeing/aggregate/workload-summary')
  @RequiresPermission('wellbeing.view_aggregate')
  async getWorkloadSummary(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<AggregateWorkloadSummary> {
    const { tenant_id } = tenant;

    const cached =
      await this.cacheService.getCachedAggregate<AggregateWorkloadSummary>(
        tenant_id,
        'workload-summary',
      );
    if (cached) return cached;

    const result =
      await this.computeService.getAggregateWorkloadSummary(tenant_id);
    await this.cacheService.setCachedAggregate(
      tenant_id,
      'workload-summary',
      result,
    );
    return result;
  }

  // ─── 2. Cover Fairness ──────────────────────────────────────────────────

  @Get('staff-wellbeing/aggregate/cover-fairness')
  @RequiresPermission('wellbeing.view_aggregate')
  async getCoverFairness(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<CoverFairnessResult> {
    const { tenant_id } = tenant;

    const cached =
      await this.cacheService.getCachedAggregate<CoverFairnessResult>(
        tenant_id,
        'cover-fairness',
      );
    if (cached) return cached;

    const result = await this.computeService.getCoverFairness(tenant_id);
    await this.cacheService.setCachedAggregate(
      tenant_id,
      'cover-fairness',
      result,
    );
    return result;
  }

  // ─── 3. Timetable Quality ───────────────────────────────────────────────

  @Get('staff-wellbeing/aggregate/timetable-quality')
  @RequiresPermission('wellbeing.view_aggregate')
  async getTimetableQuality(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<AggregateTimetableQuality> {
    const { tenant_id } = tenant;

    const cached =
      await this.cacheService.getCachedAggregate<AggregateTimetableQuality>(
        tenant_id,
        'timetable-quality',
      );
    if (cached) return cached;

    const result =
      await this.computeService.getAggregateTimetableQuality(tenant_id);
    await this.cacheService.setCachedAggregate(
      tenant_id,
      'timetable-quality',
      result,
    );
    return result;
  }

  // ─── 4. Absence Trends ──────────────────────────────────────────────────

  @Get('staff-wellbeing/aggregate/absence-trends')
  @RequiresPermission('wellbeing.view_aggregate')
  async getAbsenceTrends(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<AbsenceTrends> {
    const { tenant_id } = tenant;

    const cached =
      await this.cacheService.getCachedAggregate<AbsenceTrends>(
        tenant_id,
        'absence-trends',
      );
    if (cached) return cached;

    const result = await this.computeService.getAbsenceTrends(tenant_id);
    await this.cacheService.setCachedAggregate(
      tenant_id,
      'absence-trends',
      result,
    );
    return result;
  }

  // ─── 5. Substitution Pressure ───────────────────────────────────────────

  @Get('staff-wellbeing/aggregate/substitution-pressure')
  @RequiresPermission('wellbeing.view_aggregate')
  async getSubstitutionPressure(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<SubstitutionPressure> {
    const { tenant_id } = tenant;

    const cached =
      await this.cacheService.getCachedAggregate<SubstitutionPressure>(
        tenant_id,
        'substitution-pressure',
      );
    if (cached) return cached;

    const result =
      await this.computeService.getSubstitutionPressure(tenant_id);
    await this.cacheService.setCachedAggregate(
      tenant_id,
      'substitution-pressure',
      result,
    );
    return result;
  }

  // ─── 6. Correlation ─────────────────────────────────────────────────────

  @Get('staff-wellbeing/aggregate/correlation')
  @RequiresPermission('wellbeing.view_aggregate')
  async getCorrelation(
    @CurrentTenant() tenant: TenantContext,
  ): Promise<CorrelationResult> {
    const { tenant_id } = tenant;

    const cached =
      await this.cacheService.getCachedAggregate<CorrelationResult>(
        tenant_id,
        'correlation',
      );
    if (cached) return cached;

    const result = await this.computeService.getCorrelation(tenant_id);
    await this.cacheService.setCachedAggregate(
      tenant_id,
      'correlation',
      result,
    );
    return result;
  }
}
