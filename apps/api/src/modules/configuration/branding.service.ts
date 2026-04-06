import { extname } from 'path';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import type { UpdateBrandingDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

const ALLOWED_LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
const ALLOWED_MIMETYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  /**
   * Get branding for a tenant.
   * Resolves the raw S3 key in logo_url to a presigned URL (1-hour expiry).
   */
  async getBranding(tenantId: string) {
    const branding = await this.tenantReadFacade.findBranding(tenantId);

    if (!branding) {
      throw new NotFoundException({
        code: 'BRANDING_NOT_FOUND',
        message: 'Branding configuration not found for this tenant',
      });
    }

    if (branding.logo_url) {
      try {
        const presignedUrl = await this.s3.getPresignedUrl(branding.logo_url, 3600);
        return { ...branding, logo_url: presignedUrl };
      } catch {
        // S3 key might be invalid — return branding without resolving the URL
        console.error('[BrandingService.getBranding] Failed to resolve logo presigned URL');
      }
    }

    return branding;
  }

  /**
   * Update branding for a tenant. Creates if not exists (upsert).
   * Maps British English field names from API to American English DB column names.
   */
  async updateBranding(tenantId: string, data: UpdateBrandingDto) {
    const dbData: {
      logo_url?: string | null;
      primary_color?: string | null;
      secondary_color?: string | null;
    } = {};

    if (data.logo_url !== undefined) dbData.logo_url = data.logo_url;
    if (data.primary_colour !== undefined) dbData.primary_color = data.primary_colour;
    if (data.secondary_colour !== undefined) dbData.secondary_color = data.secondary_colour;

    return (
      createRlsClient(this.prisma, { tenant_id: tenantId }) as unknown as PrismaService
    ).$transaction(async (tx) => {
      return tx.tenantBranding.upsert({
        where: { tenant_id: tenantId },
        update: dbData,
        create: {
          tenant_id: tenantId,
          ...dbData,
        },
      });
    });
  }

  /**
   * Upload a logo file to S3 and update the branding record.
   */
  async uploadLogo(
    tenantId: string,
    file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ) {
    const ext = extname(file.originalname).toLowerCase();

    if (!ALLOWED_LOGO_EXTENSIONS.includes(ext)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: `Logo must be one of: ${ALLOWED_LOGO_EXTENSIONS.join(', ')}`,
      });
    }

    if (!ALLOWED_MIMETYPES.includes(file.mimetype)) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'File type not allowed',
      });
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: `Logo must be under ${MAX_LOGO_SIZE_BYTES / (1024 * 1024)} MB`,
      });
    }

    const s3Key = `logos/logo${ext}`;
    const fullKey = await this.s3.upload(tenantId, s3Key, file.buffer, file.mimetype);

    const branding = await (
      createRlsClient(this.prisma, { tenant_id: tenantId }) as unknown as PrismaService
    ).$transaction(async (tx) => {
      return tx.tenantBranding.upsert({
        where: { tenant_id: tenantId },
        update: { logo_url: fullKey },
        create: {
          tenant_id: tenantId,
          logo_url: fullKey,
        },
      });
    });

    // Return presigned URL so the frontend can display the logo immediately
    const presignedUrl = await this.s3.getPresignedUrl(fullKey, 3600);
    return { ...branding, logo_url: presignedUrl };
  }
}
