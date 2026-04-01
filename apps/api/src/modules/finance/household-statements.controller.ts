import { Controller, Get, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

import { statementPdfQuerySchema, statementQuerySchema } from '@school/shared';
import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { HouseholdStatementsService } from './household-statements.service';

@Controller('v1/finance/household-statements')
@UseGuards(AuthGuard, PermissionGuard)
export class HouseholdStatementsController {
  constructor(private readonly statementsService: HouseholdStatementsService) {}

  @Get(':householdId')
  @RequiresPermission('finance.view')
  async getStatement(
    @CurrentTenant() tenant: TenantContext,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Query(new ZodValidationPipe(statementQuerySchema))
    query: z.infer<typeof statementQuerySchema>,
  ) {
    return this.statementsService.getStatement(tenant.tenant_id, householdId, query);
  }

  @Get(':householdId/pdf')
  @RequiresPermission('finance.view')
  async getStatementPdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('householdId', ParseUUIDPipe) householdId: string,
    @Query(new ZodValidationPipe(statementPdfQuerySchema))
    query: z.infer<typeof statementPdfQuerySchema>,
    @Res() res: Response,
  ) {
    const locale = query.locale ?? 'en';
    const pdfBuffer = await this.statementsService.renderPdf(
      tenant.tenant_id,
      householdId,
      locale,
      { date_from: query.date_from, date_to: query.date_to },
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="statement-${householdId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}
