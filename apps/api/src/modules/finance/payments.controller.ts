import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  confirmAllocationsSchema,
  createPaymentSchema,
  paymentQuerySchema,
} from '@school/shared';
import type {
  ConfirmAllocationsDto,
  CreatePaymentDto,
  JwtPayload,
  TenantContext,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PaymentsService } from './payments.service';
import { ReceiptsService } from './receipts.service';

@Controller('v1/finance/payments')
@UseGuards(AuthGuard, PermissionGuard)
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly receiptsService: ReceiptsService,
  ) {}

  @Get()
  @RequiresPermission('finance.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(paymentQuerySchema))
    query: z.infer<typeof paymentQuerySchema>,
  ) {
    return this.paymentsService.findAll(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('finance.view')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.findOne(tenant.tenant_id, id);
  }

  @Post()
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createPaymentSchema)) dto: CreatePaymentDto,
  ) {
    return this.paymentsService.createManual(tenant.tenant_id, user.sub, dto);
  }

  @Post(':id/allocations/suggest')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async suggestAllocations(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.suggestAllocations(tenant.tenant_id, id);
  }

  @Post(':id/allocations')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.CREATED)
  async confirmAllocations(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(confirmAllocationsSchema)) dto: ConfirmAllocationsDto,
  ) {
    return this.paymentsService.confirmAllocations(tenant.tenant_id, id, user.sub, dto);
  }

  @Get(':id/receipt')
  @RequiresPermission('finance.view')
  async getReceipt(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.receiptsService.findByPayment(tenant.tenant_id, id);
  }

  @Get(':id/receipt/pdf')
  @RequiresPermission('finance.view')
  async getReceiptPdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('locale') locale: string | undefined,
    @Res() res: Response,
  ) {
    const resolvedLocale = locale ?? 'en';
    const pdfBuffer = await this.receiptsService.renderPdf(tenant.tenant_id, id, resolvedLocale);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="receipt-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}
