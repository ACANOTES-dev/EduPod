import { Controller, Get, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

import { payslipQuerySchema } from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PayslipsService } from './payslips.service';

const payslipPdfQuerySchema = z.object({
  locale: z.enum(['en', 'ar']).optional(),
});

const myPayslipsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const myYtdQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

@Controller('v1/payroll')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
@ModuleEnabled('payroll')
export class PayslipsController {
  constructor(private readonly payslipsService: PayslipsService) {}

  // ─── Self-service ────────────────────────────────────────────────────────
  //
  // `GET /v1/payroll/my-payslips` — calling user's own payslips.
  // `GET /v1/payroll/my-payslips/ytd` — YTD totals for the calling user.
  // `GET /v1/payroll/my-payslips/:id/pdf` — PDF for the user's own payslip.
  //
  // No `staff_profile_id` query param is accepted — privacy invariant.

  @Get('my-payslips')
  @RequiresPermission('payroll.self_service', 'payroll.view')
  async listMyPayslips(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(myPayslipsQuerySchema))
    query: z.infer<typeof myPayslipsQuerySchema>,
  ) {
    return this.payslipsService.listForUser(tenant.tenant_id, user.sub, query.page, query.pageSize);
  }

  @Get('my-payslips/ytd')
  @RequiresPermission('payroll.self_service', 'payroll.view')
  async getMyYtd(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(myYtdQuerySchema))
    query: z.infer<typeof myYtdQuerySchema>,
  ) {
    const year = query.year ?? new Date().getFullYear();
    return this.payslipsService.getYtdForUser(tenant.tenant_id, user.sub, year);
  }

  @Get('my-payslips/:id/pdf')
  @RequiresPermission('payroll.self_service', 'payroll.view')
  async getMyPayslipPdf(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(payslipPdfQuerySchema))
    query: z.infer<typeof payslipPdfQuerySchema>,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.payslipsService.renderOwnPayslipPdf(
      tenant.tenant_id,
      id,
      user.sub,
      query.locale,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="payslip-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  // ─── Admin payslip endpoints (preserved at /v1/payroll/payslips/*) ───────

  @Get('payslips')
  @RequiresPermission('payroll.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(payslipQuerySchema))
    query: z.infer<typeof payslipQuerySchema>,
  ) {
    return this.payslipsService.listPayslips(tenant.tenant_id, query);
  }

  @Get('payslips/:id')
  @RequiresPermission('payroll.view')
  async get(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.payslipsService.getPayslip(tenant.tenant_id, id);
  }

  @Get('payslips/:id/pdf')
  @RequiresPermission('payroll.generate_payslips', 'payroll.view')
  async getPdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(payslipPdfQuerySchema))
    query: z.infer<typeof payslipPdfQuerySchema>,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.payslipsService.renderPayslipPdf(
      tenant.tenant_id,
      id,
      query.locale,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="payslip-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}
