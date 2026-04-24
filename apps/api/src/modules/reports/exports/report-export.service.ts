import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { S3Service } from '../../s3/s3.service';
import { TenantReadFacade } from '../../tenants/tenant-read.facade';

import { ExcelRenderer } from './renderers/excel-renderer';
import { PdfRenderer } from './renderers/pdf-renderer';
import { WordRenderer } from './renderers/word-renderer';
import type { ExportFormat, ExportInput } from './report-export.types';
import { DEFAULT_PLATFORM_BRANDING, type TenantBranding } from './templates/branding';

// Re-export types so callers have one import path: `./exports/report-export.service`.
export type {
  ExportColumn,
  ExportColumnType,
  ExportFormat,
  ExportInput,
  ExportReportMeta,
} from './report-export.types';
export {
  EXPORT_CONTENT_TYPES,
  EXPORT_FILE_EXTENSIONS,
  SYNCHRONOUS_EXPORT_ROW_LIMIT,
  safeExportFilename,
} from './report-export.types';
export type { TenantBranding } from './templates/branding';

interface BrandingCacheEntry {
  branding: TenantBranding;
  expires_at: number;
}

/**
 * Public entry point for the reports export pipeline.
 *
 * Three format-specific renderers (PDF / Excel / Word) share one `ExportInput`
 * shape, one tenant-branding lookup, and one Buffer return contract. Every
 * consumer — the on-demand HTTP endpoint, the scheduled-reports worker (impl
 * 08), the report-sharing service (impl 13), and the batch export job (see
 * `reports-export-batch.processor.ts`) — funnels through this service so the
 * branded artifact looks identical regardless of entry surface.
 *
 * Branding is looked up lazily and cached for 10 minutes per tenant. The
 * branding rarely changes and fetching it is an extra round-trip per export,
 * so the cache hit rate under bulk-share / scheduled-report load is the
 * expensive path to protect.
 *
 * `dispatchByFormat` is a convenience used by consumers that already have an
 * `ExportFormat` variable and don't want a switch statement.
 */
@Injectable()
export class ReportExportService {
  private readonly logger = new Logger(ReportExportService.name);
  private readonly brandingCache = new Map<string, BrandingCacheEntry>();
  private static readonly BRANDING_CACHE_TTL_MS = 10 * 60 * 1000;

  constructor(
    private readonly pdfRenderer: PdfRenderer,
    private readonly excelRenderer: ExcelRenderer,
    private readonly wordRenderer: WordRenderer,
    private readonly tenantReadFacade: TenantReadFacade,
    private readonly s3: S3Service,
  ) {}

  // ─── Format-specific entry points ─────────────────────────────────────────

  async exportPdf(input: ExportInput): Promise<Buffer> {
    return this.pdfRenderer.render(input);
  }

  async exportExcel(input: ExportInput): Promise<Buffer> {
    return this.excelRenderer.render(input);
  }

  async exportWord(input: ExportInput): Promise<Buffer> {
    return this.wordRenderer.render(input);
  }

  async exportByFormat(format: ExportFormat, input: ExportInput): Promise<Buffer> {
    switch (format) {
      case 'pdf':
        return this.exportPdf(input);
      case 'excel':
        return this.exportExcel(input);
      case 'word':
        return this.exportWord(input);
      default: {
        const exhaustive: never = format;
        throw new Error(`Unsupported export format: ${String(exhaustive)}`);
      }
    }
  }

  // ─── Tenant branding lookup ───────────────────────────────────────────────

  /**
   * Resolve the full branding descriptor for a tenant, falling back to the
   * EduPod platform defaults when a `TenantBranding` row is missing or
   * incomplete. Caches for 10 minutes per tenant.
   */
  async getTenantBranding(tenantId: string): Promise<TenantBranding> {
    const now = Date.now();
    const cached = this.brandingCache.get(tenantId);
    if (cached && cached.expires_at > now) return cached.branding;

    const tenant = await this.tenantReadFacade.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant with id "${tenantId}" not found`,
      });
    }

    const rawBranding = await this.tenantReadFacade.findBranding(tenantId);
    const locale: 'en' | 'ar' = tenant.default_locale === 'ar' ? 'ar' : 'en';

    const schoolName =
      (locale === 'ar' ? rawBranding?.school_name_ar : rawBranding?.school_name_display) ||
      rawBranding?.school_name_display ||
      tenant.name;

    const logoUrl = rawBranding?.logo_url ? await this.safeResolveLogo(rawBranding.logo_url) : null;

    const branding: TenantBranding = {
      tenant_id: tenantId,
      school_name: schoolName,
      logo_url: logoUrl,
      primary_color: rawBranding?.primary_color || DEFAULT_PLATFORM_BRANDING.primary_color,
      secondary_color: rawBranding?.secondary_color || DEFAULT_PLATFORM_BRANDING.secondary_color,
      locale,
      currency_code: tenant.currency_code,
    };

    this.brandingCache.set(tenantId, {
      branding,
      expires_at: now + ReportExportService.BRANDING_CACHE_TTL_MS,
    });

    return branding;
  }

  /**
   * Invalidate the cached branding for a tenant. Called when branding is
   * updated (currently a manual call — the update flow is owned by a
   * different module). Safe to invoke for unknown tenants.
   */
  invalidateBrandingCache(tenantId: string): void {
    this.brandingCache.delete(tenantId);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /**
   * Resolve an `S3 object key -> presigned URL` for use in the PDF renderer's
   * `<img src>`. Puppeteer's request interceptor only allows `data:` and
   * `about:` URLs, so we rely on the inline-display path: if the signed URL
   * is unreachable we silently drop back to the letter-mark placeholder in
   * the template rather than aborting the whole export.
   */
  private async safeResolveLogo(key: string): Promise<string | null> {
    try {
      return await this.s3.getPresignedUrl(key, 3600, { inline: true });
    } catch (err) {
      this.logger.warn(
        `[safeResolveLogo] Failed to presign logo key="${key}": ${(err as Error).message}`,
      );
      return null;
    }
  }
}
