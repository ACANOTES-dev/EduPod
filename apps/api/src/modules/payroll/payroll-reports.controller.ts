import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { payrollReportQuerySchema } from '@school/shared';
import type { TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PayrollReportsService } from './payroll-reports.service';

const exportQuerySchema = z.object({
  format: z.enum(['csv', 'pdf']).default('csv'),
  period_year: z.coerce.number().int().optional(),
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('v1/payroll/reports')
@UseGuards(AuthGuard, PermissionGuard)
export class PayrollReportsController {
  constructor(private readonly payrollReportsService: PayrollReportsService) {}

  @Get('cost-trend')
  @RequiresPermission('payroll.view_reports')
  async getCostTrend(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(payrollReportQuerySchema))
    query: z.infer<typeof payrollReportQuerySchema>,
  ) {
    return this.payrollReportsService.getCostTrend(tenant.tenant_id, query.period_year);
  }

  @Get('ytd-summary')
  @RequiresPermission('payroll.view_reports')
  async getYtdSummary(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(payrollReportQuerySchema.merge(paginationQuerySchema)))
    query: z.infer<typeof payrollReportQuerySchema> & z.infer<typeof paginationQuerySchema>,
  ) {
    return this.payrollReportsService.getYtdSummary(
      tenant.tenant_id,
      query.period_year,
      query.page,
      query.pageSize,
    );
  }

  @Get('ytd-summary/export')
  @RequiresPermission('payroll.view_reports')
  async exportYtdSummary(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(exportQuerySchema))
    query: z.infer<typeof exportQuerySchema>,
    @Res() res: Response,
  ) {
    const result = await this.payrollReportsService.exportYtdSummary(
      tenant.tenant_id,
      query.period_year,
      query.format,
    );

    if (result.format === 'csv') {
      const csvResult = result as { format: string; content: string; filename: string };
      res.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${csvResult.filename}"`,
      });
      res.send(csvResult.content);
      return;
    }

    // PDF format: return JSON data for now
    res.json(result);
  }

  @Get('bonus-analysis')
  @RequiresPermission('payroll.view_reports')
  async getBonusAnalysis(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(payrollReportQuerySchema))
    query: z.infer<typeof payrollReportQuerySchema>,
  ) {
    return this.payrollReportsService.getBonusAnalysis(tenant.tenant_id, query.period_year);
  }

  @Get('monthly-summary/:runId')
  @RequiresPermission('payroll.view_reports')
  async getMonthlySummary(
    @CurrentTenant() tenant: TenantContext,
    @Param('runId', ParseUUIDPipe) runId: string,
  ) {
    return this.payrollReportsService.getMonthlySummary(tenant.tenant_id, runId);
  }

  @Get('monthly-summary/:runId/export')
  @RequiresPermission('payroll.view_reports')
  async exportMonthlySummary(
    @CurrentTenant() tenant: TenantContext,
    @Param('runId', ParseUUIDPipe) runId: string,
    @Query(new ZodValidationPipe(exportQuerySchema))
    query: z.infer<typeof exportQuerySchema>,
    @Res() res: Response,
  ) {
    const result = await this.payrollReportsService.exportMonthlySummary(
      tenant.tenant_id,
      runId,
      query.format,
    );

    if (result.format === 'csv') {
      const csvResult = result as { format: string; content: string; filename: string };
      res.set({
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${csvResult.filename}"`,
      });
      res.send(csvResult.content);
      return;
    }

    // PDF format: return JSON for now
    res.json(result);
  }

  @Get('staff/:staffProfileId/history')
  @RequiresPermission('payroll.view')
  async getStaffPaymentHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('staffProfileId', ParseUUIDPipe) staffProfileId: string,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.payrollReportsService.getStaffPaymentHistory(
      tenant.tenant_id,
      staffProfileId,
      query.page,
      query.pageSize,
    );
  }
}
