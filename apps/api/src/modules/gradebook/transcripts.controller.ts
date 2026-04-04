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

import { TranscriptsService } from './transcripts.service';

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class TranscriptsController {
  constructor(
    private readonly transcriptsService: TranscriptsService,
    private readonly pdfRenderingService: PdfRenderingService,
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
    const locale = await this.tenantReadFacade.findDefaultLocale(tenant.tenant_id);

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
    const tenantName = await this.tenantReadFacade.findNameById(tenantId);
    const branding = await this.tenantReadFacade.findBranding(tenantId);

    return {
      school_name: tenantName ?? '',
      school_name_ar: branding?.school_name_ar ?? undefined,
      logo_url: branding?.logo_url ?? undefined,
      primary_color: branding?.primary_color ?? undefined,
    };
  }
}
