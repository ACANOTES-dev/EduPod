import { ForbiddenException, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';

import type { ExportPurpose, ReportFilterDto } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { CpExportService } from '../../child-protection/services/cp-export.service';
import type { PdfBranding } from '../../pdf-rendering/pdf-rendering.service';
import { PdfRenderingService } from '../../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import { PastoralReportService } from './pastoral-report.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface InitTier3ExportDto {
  purpose: ExportPurpose;
  purpose_other?: string;
  student_id?: string;
  from_date?: string;
  to_date?: string;
}

export interface Tier3ExportPreview {
  preview_token: string;
  record_count: number;
  student_name: string;
  date_range: { from: string | null; to: string | null };
  record_types_found: string[];
}

export interface Tier3ExportResult {
  download_token: string;
  export_ref_id: string;
  filename: string;
}

export interface Tier3DownloadResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class PastoralExportService {
  private readonly logger = new Logger(PastoralExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
    private readonly pdfService: PdfRenderingService,
    private readonly reportService: PastoralReportService,
    @Inject(forwardRef(() => CpExportService))
    private readonly cpExportService: CpExportService,
  ) {}

  // ─── Tier 1/2 Exports ──────────────────────────────────────────────────

  /**
   * Export a student pastoral summary as a PDF.
   * Tier 1 — general wellbeing overview.
   */
  async exportStudentSummary(
    tenantId: string,
    userId: string,
    studentId: string,
    locale: string,
  ): Promise<Buffer> {
    const data = await this.reportService.getStudentSummary(tenantId, userId, studentId, {});
    const branding = await this.getTenantBranding(tenantId);

    const buffer = await this.pdfService.renderPdf('pastoral-summary', locale, data, branding);

    await this.recordExportAuditEvent(tenantId, userId, studentId, 'student_summary', 1);

    return buffer;
  }

  /**
   * Export SST activity report as a PDF.
   * Tier 2 — SST-level reporting.
   */
  async exportSstActivity(
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
    locale: string,
  ): Promise<Buffer> {
    const data = await this.reportService.getSstActivity(tenantId, userId, filters);
    const branding = await this.getTenantBranding(tenantId);

    const buffer = await this.pdfService.renderPdf('sst-activity', locale, data, branding);

    await this.recordExportAuditEvent(tenantId, userId, null, 'sst_activity', 2);

    return buffer;
  }

  // ─── Tier 3 Export Delegation ──────────────────────────────────────────

  /**
   * Initiate a Tier 3 export (child protection data).
   * Requires cp_access grant. Delegates preview to CpExportService.
   */
  async initTier3Export(
    tenantId: string,
    userId: string,
    dto: InitTier3ExportDto,
  ): Promise<Tier3ExportPreview> {
    await this.assertCpAccess(tenantId, userId);

    const result = await this.cpExportService.preview(
      tenantId,
      userId,
      {
        student_id: dto.student_id ?? '',
        purpose: dto.purpose,
        other_reason: dto.purpose_other,
        record_types: undefined,
        date_from: dto.from_date,
        date_to: dto.to_date,
      },
      null,
    );

    return result.data;
  }

  /**
   * Confirm and generate a Tier 3 export PDF.
   * Delegates to CpExportService.generate().
   */
  async confirmTier3Export(
    tenantId: string,
    userId: string,
    exportId: string,
  ): Promise<Tier3ExportResult> {
    await this.assertCpAccess(tenantId, userId);

    const result = await this.cpExportService.generate(
      tenantId,
      userId,
      {
        preview_token: exportId,
      },
      null,
    );

    return result.data;
  }

  /**
   * Download a previously generated Tier 3 export.
   * Delegates to CpExportService.download().
   */
  async downloadTier3Export(
    tenantId: string,
    userId: string,
    exportId: string,
  ): Promise<Tier3DownloadResult> {
    await this.assertCpAccess(tenantId, userId);
    return this.cpExportService.download(exportId, null);
  }

  // ─── Generic PDF Rendering ──────────────────────────────────────────────

  /**
   * Render any pastoral report as a PDF using a registered template.
   * Used by the reports controller for safeguarding compliance, wellbeing, DES inspection.
   */
  async renderPdf(
    templateKey: string,
    data: unknown,
    locale: string,
    tenantId?: string,
  ): Promise<Buffer> {
    const branding = await this.getTenantBranding(tenantId ?? '');
    return this.pdfService.renderPdf(templateKey, locale, data, branding);
  }

  // ─── Internal Methods ─────────────────────────────────────────────────

  /**
   * Record an audit event for a pastoral export.
   */
  private async recordExportAuditEvent(
    tenantId: string,
    userId: string,
    studentId: string | null,
    scope: string,
    tier: number,
  ): Promise<void> {
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'record_exported',
      entity_type: 'export',
      entity_id: scope,
      student_id: studentId,
      actor_user_id: userId,
      tier,
      payload: {
        export_tier: tier,
        entity_type: 'export' as const,
        entity_ids: [],
        export_ref_id: scope,
        watermarked: false,
      },
      ip_address: null,
    });
  }

  /**
   * Fetch tenant branding for PDF rendering.
   * Falls back to defaults when branding is not configured.
   */
  async getTenantBranding(tenantId: string): Promise<PdfBranding> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: tenantId, // System-level query; RLS scoped to tenant
    });

    const result = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const tenant = await db.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });

      const branding = await db.tenantBranding.findUnique({
        where: { tenant_id: tenantId },
        select: {
          school_name_display: true,
          school_name_ar: true,
          logo_url: true,
          primary_color: true,
        },
      });

      return { tenant, branding };
    })) as {
      tenant: { name: string } | null;
      branding: {
        school_name_display: string | null;
        school_name_ar: string | null;
        logo_url: string | null;
        primary_color: string | null;
      } | null;
    };

    const schoolName = result.branding?.school_name_display ?? result.tenant?.name ?? 'School';

    return {
      school_name: schoolName,
      school_name_ar: result.branding?.school_name_ar ?? undefined,
      logo_url: result.branding?.logo_url ?? undefined,
      primary_color: result.branding?.primary_color ?? undefined,
    };
  }

  /**
   * Assert the user has an active CP access grant.
   * Throws ForbiddenException if no active grant exists.
   */
  private async assertCpAccess(tenantId: string, userId: string): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const grant = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.cpAccessGrant.findFirst({
        where: {
          tenant_id: tenantId,
          user_id: userId,
          revoked_at: null,
        },
      });
    });

    if (!grant) {
      throw new ForbiddenException({
        error: {
          code: 'CP_ACCESS_REQUIRED',
          message: 'You do not have child protection access to perform this export.',
        },
      });
    }
  }
}
