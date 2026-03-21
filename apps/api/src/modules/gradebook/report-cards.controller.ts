import {
  Body,
  Controller,
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
import {
  generateReportCardsSchema,
  updateReportCardSchema,
} from '@school/shared';
import type { JwtPayload } from '@school/shared';
import type { Response } from 'express';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { ReportCardsService } from './report-cards.service';

// ─── Query Schemas ────────────────────────────────────────────────────────

const listReportCardsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  academic_period_id: z.string().uuid().optional(),
  status: z.enum(['draft', 'published', 'revised']).optional(),
  student_id: z.string().uuid().optional(),
  include_revisions: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class ReportCardsController {
  constructor(
    private readonly reportCardsService: ReportCardsService,
    private readonly pdfRenderingService: PdfRenderingService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('report-cards/generate')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async generate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(generateReportCardsSchema))
    dto: z.infer<typeof generateReportCardsSchema>,
  ) {
    return this.reportCardsService.generate(
      tenant.tenant_id,
      dto.student_ids,
      dto.academic_period_id,
    );
  }

  @Get('report-cards')
  @RequiresPermission('gradebook.view')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listReportCardsQuerySchema))
    query: z.infer<typeof listReportCardsQuerySchema>,
  ) {
    return this.reportCardsService.findAll(tenant.tenant_id, query);
  }

  @Get('report-cards/:id')
  @RequiresPermission('gradebook.view')
  async findOne(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportCardsService.findOne(tenant.tenant_id, id);
  }

  @Patch('report-cards/:id')
  @RequiresPermission('gradebook.manage')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateReportCardSchema))
    dto: z.infer<typeof updateReportCardSchema>,
  ) {
    return this.reportCardsService.update(tenant.tenant_id, id, dto);
  }

  @Post('report-cards/:id/publish')
  @RequiresPermission('gradebook.publish_report_cards')
  async publish(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportCardsService.publish(tenant.tenant_id, id, user.sub);
  }

  @Post('report-cards/:id/revise')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async revise(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportCardsService.revise(tenant.tenant_id, id);
  }

  @Get('report-cards/:id/pdf')
  @RequiresPermission('gradebook.view')
  async renderPdf(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    // Load the report card with its snapshot payload
    const reportCard = await this.reportCardsService.findOne(tenant.tenant_id, id);

    // Load tenant branding
    const branding = await this.loadBranding(tenant.tenant_id);

    const pdfBuffer = await this.pdfRenderingService.renderPdf(
      'report-card',
      reportCard.template_locale,
      reportCard.snapshot_payload_json,
      branding,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="report-card.pdf"',
    });
    res.send(pdfBuffer);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  private async loadBranding(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { name: true },
    });

    const branding = await this.prisma.tenantBranding.findFirst({
      where: { tenant_id: tenantId },
      select: {
        school_name_ar: true,
        logo_url: true,
        primary_color: true,
        report_card_title: true,
      },
    });

    return {
      school_name: tenant?.name ?? '',
      school_name_ar: branding?.school_name_ar ?? undefined,
      logo_url: branding?.logo_url ?? undefined,
      primary_color: branding?.primary_color ?? undefined,
      report_card_title: branding?.report_card_title ?? undefined,
    };
  }
}
