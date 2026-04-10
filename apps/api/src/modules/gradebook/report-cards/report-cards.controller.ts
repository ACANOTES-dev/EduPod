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
import { z } from 'zod';

import {
  bulkDeleteReportCardsSchema,
  classMatrixQuerySchema,
  dryRunGenerationCommentGateSchema,
  generateReportCardsSchema,
  listGenerationRunsQuerySchema,
  listReportCardLibraryQuerySchema,
  reportCardBundlePdfQuerySchema,
  startGenerationRunSchema,
  updateReportCardSchema,
} from '@school/shared';
import type {
  BulkDeleteReportCardsDto,
  ClassMatrixQuery,
  JwtPayload,
  ListReportCardLibraryQuery,
  ReportCardBundlePdfQuery,
} from '@school/shared';

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
  //
  // `school_owner` is an unrestricted role — it bypasses all permission
  // checks in `PermissionGuard` (see `common/guards/permission.guard.ts`).
  // We replicate that bypass here because owners may not hold the explicit
  // `report_cards.view`/`.manage` permission keys in the permissions table;
  // without this check, the library would treat them as teachers scoped to
  // an empty student list and return an empty dataset.

  private async hasAnyPermission(user: JwtPayload, required: string[]): Promise<boolean> {
    if (!user.membership_id) return false;
    if (await this.permissionCacheService.isOwner(user.membership_id)) return true;
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

  // GET /v1/report-cards/library/grouped — grouped by run → class → student.
  // Declared before the dynamic `:id` route so the literal segment matches
  // first.
  @Get('report-cards/library/grouped')
  @RequiresPermission('report_cards.view')
  async listLibraryGrouped(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
  ) {
    const isAdmin = await this.hasAnyPermission(user, ['report_cards.manage', 'report_cards.view']);
    return this.reportCardsQueriesService.listReportCardLibraryGrouped(tenant.tenant_id, {
      user_id: user.sub,
      is_admin: isAdmin,
    });
  }

  // GET /v1/report-cards/library/bundle-pdf — admin download of merged PDFs
  // (one file for everything in scope, or a ZIP of per-class PDFs). The
  // static `library/bundle-pdf` segment must be declared before `:id`.
  @Get('report-cards/library/bundle-pdf')
  @RequiresPermission('report_cards.manage')
  async bundlePdf(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(reportCardBundlePdfQuerySchema))
    query: ReportCardBundlePdfQuery,
    @Res() res: Response,
  ) {
    const academicPeriodId =
      query.academic_period_id === 'full_year' ? null : (query.academic_period_id ?? undefined);

    const result = await this.reportCardsService.bundlePdfs(tenant.tenant_id, {
      class_ids: query.class_ids,
      report_card_ids: query.report_card_ids,
      academic_period_id: academicPeriodId,
      academic_year_id: query.academic_year_id,
      locale: query.locale,
      merge_mode: query.merge_mode,
    });

    res.setHeader('Content-Type', result.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.buffer.length);
    res.send(result.buffer);
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

  // POST /v1/report-cards/bulk-delete — MUST be declared before any
  // `DELETE /report-cards/:id`-style catch-alls so the static segment
  // matches first. Uses POST + body because DELETE with a body is
  // notoriously patchy across clients/proxies.
  @Post('report-cards/bulk-delete')
  @RequiresPermission('report_cards.manage')
  @HttpCode(HttpStatus.OK)
  async bulkDelete(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(bulkDeleteReportCardsSchema))
    dto: BulkDeleteReportCardsDto,
  ) {
    // Translate the `'full_year'` sentinel into a NULL DB match so the
    // downstream Prisma where clause targets the Phase 1b full-year rows.
    const academic_period_id =
      dto.academic_period_id === 'full_year' ? null : (dto.academic_period_id ?? undefined);

    const result = await this.reportCardsService.bulkDelete(tenant.tenant_id, {
      report_card_ids: dto.report_card_ids,
      class_ids: dto.class_ids,
      year_group_ids: dto.year_group_ids,
      academic_period_id,
      academic_year_id: dto.academic_year_id,
    });
    return { data: result };
  }

  // DELETE /v1/report-cards/:id — single delete
  @Delete('report-cards/:id')
  @RequiresPermission('report_cards.manage')
  @HttpCode(HttpStatus.OK)
  async deleteReportCard(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.reportCardsService.delete(tenant.tenant_id, id);
    return { data: result };
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
