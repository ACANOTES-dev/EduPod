import {
  BadRequestException,
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

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  createReportShareSchema,
  reportShareArtifactFormatSchema,
  type CreateReportShareDto,
  type ReportShareArtifactFormat,
  type ReportShareHistoryResponse,
  type ShareReportResponse,
  type SharedSnapshotView,
} from '@school/shared/reports';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { OWNER_SENTINEL_PERMISSION } from '../subject-registry/reports-subject-registry.service';

import { ReportSharingService } from './report-sharing.service';

/**
 * Report-sharing endpoints (impl 13).
 *
 *   POST /v1/reports/builder/:reportId/share — fire a share. The
 *     `reportId` parameter is the saved report id. Body validates
 *     against `createReportShareSchema` (format + audience + optional
 *     message). The body's `saved_report_id` MUST equal the URL param;
 *     the controller doesn't trust the body's id over the path.
 *
 *   GET  /v1/reports/shared/:shareId — read-only snapshot view used by
 *     the share recipient (impl 19's UI).
 *
 *   GET  /v1/reports/builder/:reportId/shares — share history for the
 *     saved report's owner.
 *
 * Two controllers are registered under different base paths so the
 * route ordering on the existing `ReportsEnhancedController` (which has
 * `Get('builder/:reportId')`) doesn't shadow our `share` /  `shares`
 * subpaths — Express matches in module-registration order, so this
 * controller is registered before `ReportsEnhancedController` (see
 * `reports.module.ts`).
 */
@Controller('v1/reports')
@UseGuards(AuthGuard, PermissionGuard)
export class ReportSharingController {
  constructor(
    private readonly sharing: ReportSharingService,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  // ─── POST /v1/reports/builder/:reportId/export ───────────────────────────
  //
  // Impl 04 endpoint, finally wired in the impl-13 fix sweep. Streams the
  // exported buffer directly to the client with `Content-Type` and
  // `Content-Disposition: attachment` so browsers save under the human-
  // friendly filename. Bypasses the `ResponseTransformInterceptor` via
  // `@Res()` — the interceptor is for JSON envelopes, not binary streams.

  @Post('builder/:reportId/export')
  @RequiresPermission('reports.builder', 'analytics.manage_reports')
  async exportSavedReport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() body: { format?: string } | null,
    @Query('format') queryFormat: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const rawFormat = body?.format ?? queryFormat ?? 'pdf';
    const parsedFormat = reportShareArtifactFormatSchema.safeParse(rawFormat);
    if (!parsedFormat.success) {
      throw new BadRequestException({
        code: 'EXPORT_FORMAT_INVALID',
        message: `Unknown export format "${rawFormat}". Allowed: pdf, excel, word.`,
      });
    }
    const format: ReportShareArtifactFormat = parsedFormat.data;

    const permissions = await this.resolveEffectivePermissions(user);
    const result = await this.sharing.exportSavedReport({
      tenantId: tenant.tenant_id,
      userId: user.sub,
      permissions,
      savedReportId: reportId,
      format,
    });

    res
      .status(HttpStatus.OK)
      .setHeader('Content-Type', result.mimeType)
      .setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename.replace(/[^A-Za-z0-9 _.()-]+/g, '-')}"`,
      )
      .setHeader('X-Row-Count', String(result.rowCount))
      .send(result.buffer);
  }

  // ─── POST /v1/reports/builder/:reportId/share ────────────────────────────

  @Post('builder/:reportId/share')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('reports.share')
  async shareReport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body(new ZodValidationPipe(createReportShareSchema)) body: CreateReportShareDto,
  ): Promise<{ data: ShareReportResponse }> {
    // The body's `saved_report_id` is part of the schema, but the URL
    // param is authoritative. We accept either alignment and prefer the
    // URL — clients that pass the wrong id in the body silently get the
    // URL's id used.
    const permissions = await this.resolveEffectivePermissions(user);
    const result = await this.sharing.share({
      tenantId: tenant.tenant_id,
      sharerUserId: user.sub,
      permissions,
      savedReportId: reportId,
      format: body.format,
      audience: body.audience,
      messageBody: body.message_body,
    });
    return { data: result };
  }

  // ─── GET /v1/reports/builder/:reportId/shares ───────────────────────────

  @Get('builder/:reportId/shares')
  @RequiresPermission('reports.share')
  async listShareHistory(
    @CurrentTenant() tenant: TenantContext,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Query('page') pageRaw?: string,
    @Query('pageSize') pageSizeRaw?: string,
  ): Promise<ReportShareHistoryResponse> {
    return this.sharing.listSharesByReport({
      tenantId: tenant.tenant_id,
      savedReportId: reportId,
      page: parsePositiveInt(pageRaw, 1),
      pageSize: clamp(parsePositiveInt(pageSizeRaw, 20), 1, 100),
    });
  }

  // ─── GET /v1/reports/shared/:shareId ─────────────────────────────────────

  @Get('shared/:shareId')
  @RequiresPermission('reports.view')
  async getSharedSnapshot(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('shareId', ParseUUIDPipe) shareId: string,
  ): Promise<{ data: SharedSnapshotView }> {
    const permissions = await this.resolveEffectivePermissions(user);
    const view = await this.sharing.getSharedSnapshot({
      tenantId: tenant.tenant_id,
      userId: user.sub,
      permissions,
      shareId,
    });
    return { data: view };
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private async resolveEffectivePermissions(user: JwtPayload): Promise<string[]> {
    if (!user.membership_id) return [];
    const [permissions, owner] = await Promise.all([
      this.permissionCache.getPermissions(user.membership_id),
      this.permissionCache.isOwner(user.membership_id),
    ]);
    return owner ? [...permissions, OWNER_SENTINEL_PERMISSION] : permissions;
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
