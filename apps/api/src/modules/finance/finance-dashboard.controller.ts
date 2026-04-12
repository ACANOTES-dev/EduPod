import { Body, Controller, Get, Patch, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';

import type { TenantContext } from '@school/shared';
import { householdOverviewQuerySchema } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TenantReadFacade } from '../tenants/tenant-read.facade';
import { TenantsService } from '../tenants/tenants.service';

import { FinanceDashboardService } from './finance-dashboard.service';

const updateCurrencySchema = z.object({
  currency_code: z.string().min(1).max(10),
});

@Controller('v1/finance/dashboard')
@UseGuards(AuthGuard, PermissionGuard)
export class FinanceDashboardController {
  constructor(
    private readonly dashboardService: FinanceDashboardService,
    private readonly tenantReadFacade: TenantReadFacade,
    private readonly tenantsService: TenantsService,
  ) {}

  // GET /v1/finance/dashboard
  @Get()
  @RequiresPermission('finance.view')
  async getDashboard(@CurrentTenant() tenant: TenantContext) {
    return this.dashboardService.getDashboardData(tenant.tenant_id);
  }

  // GET /v1/finance/dashboard/debt-breakdown?bucket=10_30
  @Get('debt-breakdown')
  @RequiresPermission('finance.view')
  async getDebtBreakdown(@CurrentTenant() tenant: TenantContext, @Query('bucket') bucket?: string) {
    return this.dashboardService.getDebtBreakdown(tenant.tenant_id, bucket);
  }

  // GET /v1/finance/dashboard/household-overview
  @Get('household-overview')
  @RequiresPermission('finance.view')
  async getHouseholdOverview(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(householdOverviewQuerySchema))
    query: {
      page: number;
      pageSize: number;
      search?: string;
      status?: 'fully_paid' | 'partially_paid' | 'unpaid';
      overdue?: boolean;
    },
  ) {
    return this.dashboardService.getHouseholdOverview(tenant.tenant_id, query);
  }

  // GET /v1/finance/dashboard/currency
  @Get('currency')
  @RequiresPermission('finance.view')
  async getCurrency(@CurrentTenant() tenant: TenantContext) {
    const code = await this.tenantReadFacade.findCurrencyCode(tenant.tenant_id);
    return { currency_code: code ?? 'USD' };
  }

  // PATCH /v1/finance/dashboard/currency
  @Patch('currency')
  @RequiresPermission('finance.manage')
  async updateCurrency(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(updateCurrencySchema)) dto: z.infer<typeof updateCurrencySchema>,
  ) {
    await this.tenantsService.updateTenant(tenant.tenant_id, { currency_code: dto.currency_code });
    return { currency_code: dto.currency_code };
  }
}
