import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';

import {
  platformErrorLogQuerySchema,
  tenantMetricsCompareQuerySchema,
  tenantMetricsQuerySchema,
  type PlatformErrorLogQuery,
  type TenantMetricsCompareQuery,
  type TenantMetricsQuery,
} from '@school/shared';

import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformErrorLogService } from '../platform-error-log/platform-error-log.service';

import { TenantMetricsService } from './tenant-metrics.service';

@Controller('v1/admin')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class TenantMetricsController {
  constructor(
    private readonly tenantMetricsService: TenantMetricsService,
    private readonly platformErrorLogService: PlatformErrorLogService,
  ) {}

  // GET /v1/admin/tenants/metrics/compare
  @Get('tenants/metrics/compare')
  @RequiresPlatformPermission('platform.tenants.view')
  async compareMetrics(
    @Query(new ZodValidationPipe(tenantMetricsCompareQuerySchema))
    query: TenantMetricsCompareQuery,
  ) {
    return this.tenantMetricsService.compareMetrics(query.tenant_ids, query.days);
  }

  // GET /v1/admin/tenants/:id/metrics
  @Get('tenants/:id/metrics')
  @RequiresPlatformPermission('platform.tenants.view')
  async getTenantMetrics(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(tenantMetricsQuerySchema)) query: TenantMetricsQuery,
  ) {
    return this.tenantMetricsService.getMetricsForTenant(id, query.days);
  }

  // GET /v1/admin/tenants/:id/errors
  @Get('tenants/:id/errors')
  @RequiresPlatformPermission('platform.audit_log.view')
  async getTenantErrors(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(platformErrorLogQuerySchema)) query: PlatformErrorLogQuery,
  ) {
    return this.platformErrorLogService.listRedacted({ ...query, tenant_id: id });
  }

  // GET /v1/admin/errors
  @Get('errors')
  @RequiresPlatformPermission('platform.audit_log.view')
  async listErrors(
    @Query(new ZodValidationPipe(platformErrorLogQuerySchema)) query: PlatformErrorLogQuery,
  ) {
    return this.platformErrorLogService.listRedacted(query);
  }

  // GET /v1/admin/errors/:id
  @Get('errors/:id')
  @RequiresPlatformPermission('platform.audit_log.view')
  async getError(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformErrorLogService.getRedacted(id);
  }
}
