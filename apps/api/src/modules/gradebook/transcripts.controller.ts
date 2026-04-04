import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import { TranscriptsService } from './transcripts.service';

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class TranscriptsController {
  constructor(
    private readonly transcriptsService: TranscriptsService,
    private readonly pdfRenderingService: PdfRenderingService,
    private readonly prisma: PrismaService,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  @Get('transcripts/students/:studentId')
  @RequiresPermission('transcripts.generate')
  async getTranscript(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.transcriptsService.getTranscriptData(
      tenant.tenant_id,
      studentId,
    );
  }

  @Get('transcripts/students/:studentId/pdf')
  @RequiresPermission('transcripts.generate')
  async renderPdf(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Res() res: Response,
  ) {
    const transcriptData = await this.transcriptsService.getTranscriptData(
      tenant.tenant_id,
      studentId,
    );

    // Load tenant branding
    const branding = await this.loadBranding(tenant.tenant_id);

    // Determine locale from tenant default
    const tenantRecord = await this.prisma.tenant.findFirst({
      where: { id: tenant.tenant_id },
      select: { default_locale: true },
    });
    const locale = tenantRecord?.default_locale ?? 'en';

    const pdfBuffer = await this.pdfRenderingService.renderPdf(
      'transcript',
      locale,
      transcriptData,
      branding,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="transcript.pdf"',
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
      },
    });

    return {
      school_name: tenant?.name ?? '',
      school_name_ar: branding?.school_name_ar ?? undefined,
      logo_url: branding?.logo_url ?? undefined,
      primary_color: branding?.primary_color ?? undefined,
    };
  }
}
