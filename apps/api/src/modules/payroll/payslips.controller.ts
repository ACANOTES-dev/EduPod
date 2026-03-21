import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { payslipQuerySchema } from '@school/shared';
import type { TenantContext } from '@school/shared';
import type { Response } from 'express';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PayslipsService } from './payslips.service';

const payslipPdfQuerySchema = z.object({
  locale: z.enum(['en', 'ar']).optional(),
});

@Controller('v1/payroll/payslips')
@UseGuards(AuthGuard, PermissionGuard)
export class PayslipsController {
  constructor(private readonly payslipsService: PayslipsService) {}

  @Get()
  @RequiresPermission('payroll.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(payslipQuerySchema))
    query: z.infer<typeof payslipQuerySchema>,
  ) {
    return this.payslipsService.listPayslips(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('payroll.view')
  async get(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payslipsService.getPayslip(tenant.tenant_id, id);
  }

  @Get(':id/pdf')
  @RequiresPermission('payroll.generate_payslips')
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
