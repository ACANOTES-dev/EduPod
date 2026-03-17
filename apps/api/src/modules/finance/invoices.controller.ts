import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  createInstallmentsSchema,
  createInvoiceSchema,
  invoicePdfQuerySchema,
  invoiceQuerySchema,
  updateInvoiceSchema,
  writeOffSchema,
} from '@school/shared';
import type {
  CreateInstallmentsDto,
  CreateInvoiceDto,
  JwtPayload,
  TenantContext,
  UpdateInvoiceDto,
  WriteOffDto,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { InvoicesService } from './invoices.service';

@Controller('v1/finance/invoices')
@UseGuards(AuthGuard, PermissionGuard)
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly pdfRenderingService: PdfRenderingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @RequiresPermission('finance.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(invoiceQuerySchema))
    query: z.infer<typeof invoiceQuerySchema>,
  ) {
    return this.invoicesService.findAll(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('finance.view')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.findOne(tenant.tenant_id, id);
  }

  @Get(':id/preview')
  @RequiresPermission('finance.view')
  async getPreview(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.getPreview(tenant.tenant_id, id);
  }

  @Get(':id/pdf')
  @RequiresPermission('finance.view')
  async getPdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(invoicePdfQuerySchema))
    query: z.infer<typeof invoicePdfQuerySchema>,
    @Res() res: Response,
  ) {
    const invoice = await this.invoicesService.findOne(tenant.tenant_id, id);
    const locale = query.locale ?? 'en';

    const branding = await this.prisma.tenantBranding.findUnique({
      where: { tenant_id: tenant.tenant_id },
    });

    const pdfBranding = {
      school_name: branding?.school_name_display ?? tenant.name,
      school_name_ar: branding?.school_name_ar ?? undefined,
      logo_url: branding?.logo_url ?? undefined,
      primary_color: branding?.primary_color ?? undefined,
    };

    const pdfBuffer = await this.pdfRenderingService.renderPdf(
      'invoice',
      locale,
      invoice,
      pdfBranding,
    );

    const invoiceData = invoice as Record<string, unknown>;
    const invoiceNumber = String(invoiceData['invoice_number'] ?? id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="invoice-${invoiceNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Post()
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createInvoiceSchema)) dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.create(tenant.tenant_id, user.sub, dto);
  }

  @Patch(':id')
  @RequiresPermission('finance.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateInvoiceSchema)) dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(tenant.tenant_id, id, dto);
  }

  @Post(':id/issue')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async issue(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    // Determine if user has direct authority (e.g., school_owner role)
    // For now, pass false — approval workflows decide
    return this.invoicesService.issue(tenant.tenant_id, id, user.sub, false);
  }

  @Post(':id/void')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async voidInvoice(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.voidInvoice(tenant.tenant_id, id);
  }

  @Post(':id/cancel')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.cancel(tenant.tenant_id, id, user.sub);
  }

  @Post(':id/write-off')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async writeOff(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(writeOffSchema)) dto: WriteOffDto,
  ) {
    return this.invoicesService.writeOff(tenant.tenant_id, id, dto);
  }

  // ─── Installments ────────────────────────────────────────────

  @Get(':id/installments')
  @RequiresPermission('finance.view')
  async getInstallments(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.getInstallments(tenant.tenant_id, id);
  }

  @Post(':id/installments')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.CREATED)
  async createInstallments(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createInstallmentsSchema)) dto: CreateInstallmentsDto,
  ) {
    return this.invoicesService.createInstallments(tenant.tenant_id, id, dto.installments);
  }

  @Delete(':id/installments')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async deleteInstallments(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.deleteInstallments(tenant.tenant_id, id);
  }
}
