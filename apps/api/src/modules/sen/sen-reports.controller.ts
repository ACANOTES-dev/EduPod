import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import type {
  JwtPayload,
  NcseReturnQuery,
  PlanComplianceQuery,
  ResourceUtilisationQuery,
  SenOverviewReportQuery,
  TenantContext,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { resourceUtilisationQuerySchema } from './dto/resource-utilisation-query.dto';
import {
  ncseReturnQuerySchema,
  planComplianceQuerySchema,
  professionalInvolvementReportQuerySchema,
  senOverviewReportQuerySchema,
} from './dto/sen-report-query.dto';
import { SenReportsService } from './sen-reports.service';

@Controller('v1')
@ModuleEnabled('sen')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class SenReportsController {
  constructor(
    private readonly senReportsService: SenReportsService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // GET /v1/sen/reports/ncse-return
  @Get('sen/reports/ncse-return')
  @RequiresPermission('sen.admin')
  async getNcseReturn(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(ncseReturnQuerySchema)) query: NcseReturnQuery,
  ) {
    return this.senReportsService.getNcseReturn(tenant.tenant_id, query);
  }

  // GET /v1/sen/reports/overview
  @Get('sen/reports/overview')
  @RequiresPermission('sen.view')
  async getOverviewReport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(senOverviewReportQuerySchema)) query: SenOverviewReportQuery,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senReportsService.getOverviewReport(tenant.tenant_id, user.sub, permissions, query);
  }

  // GET /v1/sen/reports/resource-utilisation
  @Get('sen/reports/resource-utilisation')
  @RequiresPermission('sen.admin')
  async getResourceUtilisation(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(resourceUtilisationQuerySchema)) query: ResourceUtilisationQuery,
  ) {
    return this.senReportsService.getResourceUtilisation(tenant.tenant_id, query);
  }

  // GET /v1/sen/reports/plan-compliance
  @Get('sen/reports/plan-compliance')
  @RequiresPermission('sen.view')
  async getPlanCompliance(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(planComplianceQuerySchema)) query: PlanComplianceQuery,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senReportsService.getPlanCompliance(tenant.tenant_id, user.sub, permissions, query);
  }

  // GET /v1/sen/reports/professional-involvement
  @Get('sen/reports/professional-involvement')
  @RequiresPermission('sen.admin')
  async getProfessionalInvolvementReport(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(professionalInvolvementReportQuerySchema))
    _query: Record<string, never>,
  ) {
    return this.senReportsService.getProfessionalInvolvementReport(tenant.tenant_id);
  }

  private async getUserPermissions(membershipId: string | null): Promise<string[]> {
    if (!membershipId) return [];
    return this.permissionCacheService.getPermissions(membershipId);
  }
}
