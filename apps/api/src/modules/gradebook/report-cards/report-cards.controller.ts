import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';

import {
  classMatrixQuerySchema,
  dryRunGenerationCommentGateSchema,
  generateBatchReportCardsSchema,
  generateReportCardsSchema,
  listGenerationRunsQuerySchema,
  listReportCardLibraryQuerySchema,
  reportCardOverviewQuerySchema,
  startGenerationRunSchema,
  updateReportCardSchema,
} from '@school/shared';
import type { ClassMatrixQuery, JwtPayload, ListReportCardLibraryQuery } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { PdfRenderingService } from '../../pdf-rendering/pdf-rendering.service';
import { TenantReadFacade } from '../../tenants/tenant-read.facade';

import { ReportCardGenerationService } from './report-card-generation.service';
import { ReportCardsQueriesService } from './report-cards-queries.service';
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
  private readonly deprecationLogger = new Logger(ReportCardsController.name);

  constructor(
    private readonly reportCardsService: ReportCardsService,
    private readonly reportCardsQueriesService: ReportCardsQueriesService,
    private readonly pdfRenderingService: PdfRenderingService,
    private readonly tenantReadFacade: TenantReadFacade,
    private readonly generationService: ReportCardGenerationService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // ─── Role helpers (impl 06) ─────────────────────────────────────────────
  // Library scoping is computed at the controller layer so the service stays
  // free of permission-resolution concerns. The `report_cards.view` and
  // `report_cards.manage` permissions both grant a full cross-tenant view;
  // `report_cards.comment` users are scoped server-side to their own students.

  private async hasAnyPermission(user: JwtPayload, required: string[]): Promise<boolean> {
    if (!user.membership_id) return false;
    const perms = await this.permissionCacheService.getPermissions(user.membership_id);
    return required.some((p) => perms.includes(p));
  }

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
    return this.reportCardsQueriesService.findAll(tenant.tenant_id, query);
  }

  // ─── Generation runs (impl 04) ──────────────────────────────────────────
  // IMPORTANT: register BEFORE the dynamic `:id` route so NestJS matches the
  // literal segment `generation-runs` first.

  // POST /v1/report-cards/generation-runs/dry-run
  @Post('report-cards/generation-runs/dry-run')
  @RequiresPermission('report_cards.manage')
  @HttpCode(HttpStatus.OK)
  async dryRunGenerationRun(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(dryRunGenerationCommentGateSchema))
    dto: z.infer<typeof dryRunGenerationCommentGateSchema>,
  ) {
    return this.generationService.dryRunCommentGate(tenant.tenant_id, dto);
  }

  // POST /v1/report-cards/generation-runs
  @Post('report-cards/generation-runs')
  @RequiresPermission('report_cards.manage')
  @HttpCode(HttpStatus.CREATED)
  async startGenerationRun(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(startGenerationRunSchema))
    dto: z.infer<typeof startGenerationRunSchema>,
  ) {
    return this.generationService.generateRun(tenant.tenant_id, user.sub, dto);
  }

  // GET /v1/report-cards/generation-runs
  @Get('report-cards/generation-runs')
  @RequiresPermission('report_cards.manage')
  async listGenerationRuns(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listGenerationRunsQuerySchema))
    query: z.infer<typeof listGenerationRunsQuerySchema>,
  ) {
    return this.generationService.listRuns(tenant.tenant_id, query);
  }

  // GET /v1/report-cards/generation-runs/:id
  @Get('report-cards/generation-runs/:id')
  @RequiresPermission('report_cards.manage')
  async getGenerationRun(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.generationService.getRun(tenant.tenant_id, id);
  }

  // ─── Library (impl 06) ──────────────────────────────────────────────────
  // Register BEFORE the dynamic `:id` route.

  // GET /v1/report-cards/library
  @Get('report-cards/library')
  @RequiresPermission('report_cards.view')
  async listLibrary(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listReportCardLibraryQuerySchema))
    query: ListReportCardLibraryQuery,
  ) {
    const isAdmin = await this.hasAnyPermission(user, ['report_cards.manage', 'report_cards.view']);
    return this.reportCardsQueriesService.listReportCardLibrary(
      tenant.tenant_id,
      { user_id: user.sub, is_admin: isAdmin },
      query,
    );
  }

  // ─── Class matrix (impl 06) ─────────────────────────────────────────────

  // GET /v1/report-cards/classes/:classId/matrix
  @Get('report-cards/classes/:classId/matrix')
  @RequiresPermission('report_cards.view')
  async getClassMatrix(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query(new ZodValidationPipe(classMatrixQuerySchema))
    query: ClassMatrixQuery,
  ) {
    return this.reportCardsQueriesService.getClassMatrix(tenant.tenant_id, {
      classId,
      academicPeriodId: query.academic_period_id,
    });
  }

  /**
   * @deprecated Report Cards Redesign (impl 06): use
   *   `GET /v1/report-cards/classes/:classId/matrix` for the class matrix view
   *   and `GET /v1/report-cards/library` for the document library. This flat
   *   overview is preserved until impl 12 flips the frontend over.
   */
  @Get('report-cards/overview')
  @RequiresPermission('gradebook.view')
  async gradeOverview(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(reportCardOverviewQuerySchema))
    query: z.infer<typeof reportCardOverviewQuerySchema>,
  ) {
    this.deprecationLogger.warn(
      '[DEPRECATED] GET /v1/report-cards/overview — prefer /v1/report-cards/classes/:classId/matrix or /v1/report-cards/library (impl 06)',
    );
    return this.reportCardsQueriesService.gradeOverview(tenant.tenant_id, query);
  }

  @Get('report-cards/:id')
  @RequiresPermission('gradebook.view')
  async findOne(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reportCardsQueriesService.findOne(tenant.tenant_id, id);
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

  @Post('report-cards/generate-batch')
  @RequiresPermission('gradebook.manage')
  async generateBatchPdf(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(generateBatchReportCardsSchema))
    dto: z.infer<typeof generateBatchReportCardsSchema>,
    @Res() res: Response,
  ) {
    // 1. Build snapshot payloads for all students in the class
    const snapshots = await this.reportCardsQueriesService.buildBatchSnapshots(
      tenant.tenant_id,
      dto.class_id,
      dto.academic_period_id,
    );

    if (snapshots.length === 0) {
      res.status(HttpStatus.NO_CONTENT).send();
      return;
    }

    // 2. Load tenant branding
    const branding = await this.loadBranding(tenant.tenant_id);

    // 3. Render each student's report card as HTML and combine
    const templateKey = dto.template_id === 'modern' ? 'report-card-modern' : 'report-card';
    const htmlPages: string[] = [];
    for (const snap of snapshots) {
      // Render each student individually. We use 'en' as default locale.
      const html = this.pdfRenderingService.renderHtml(templateKey, 'en', snap.payload, branding);
      htmlPages.push(html);
    }

    // 4. Combine all pages into a single multi-page HTML
    const combinedHtml = this.buildCombinedHtml(htmlPages);

    // 5. Render to PDF
    const pdfBuffer = await this.pdfRenderingService.renderFromHtml(combinedHtml);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="report-cards-batch.pdf"',
    });
    res.send(pdfBuffer);
  }

  @Get('report-cards/:id/pdf')
  @RequiresPermission('gradebook.view')
  async renderPdf(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    // Load the report card with its snapshot payload
    const reportCard = await this.reportCardsQueriesService.findOne(tenant.tenant_id, id);

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

  private buildCombinedHtml(htmlPages: string[]): string {
    // Extract body content from each HTML page and combine with page breaks
    const bodies = htmlPages.map((html) => {
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      return bodyMatch ? bodyMatch[1] : html;
    });

    // Extract style from the first page (all pages share the same template styles)
    const styleMatch = htmlPages[0]?.match(/<style>([\s\S]*?)<\/style>/i);
    const style = styleMatch ? styleMatch[1] : '';

    return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8">
  <style>
    ${style}
    .page-break { page-break-after: always; }
    .page-break:last-child { page-break-after: avoid; }
  </style>
</head>
<body>
  ${bodies
    .map(
      (body, i) =>
        `<div class="page-break"${i === bodies.length - 1 ? ' style="page-break-after: avoid;"' : ''}>${body}</div>`,
    )
    .join('\n  ')}
</body>
</html>`;
  }

  private async loadBranding(tenantId: string) {
    const tenantName = await this.tenantReadFacade.findNameById(tenantId);
    const branding = await this.tenantReadFacade.findBranding(tenantId);

    return {
      school_name: tenantName ?? '',
      school_name_ar: branding?.school_name_ar ?? undefined,
      logo_url: branding?.logo_url ?? undefined,
      primary_color: branding?.primary_color ?? undefined,
      report_card_title: branding?.report_card_title ?? undefined,
    };
  }
}
