import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UpdateBrandingDto } from '@school/shared';
import { extname } from 'path';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

const ALLOWED_LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
const ALLOWED_MIMETYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /**
   * Get branding for a tenant.
   */
  async getBranding(tenantId: string) {
    const branding = await this.prisma.tenantBranding.findUnique({
      where: { tenant_id: tenantId },
    });

    if (!branding) {
      throw new NotFoundException({
        code: 'BRANDING_NOT_FOUND',
        message: 'Branding configuration not found for this tenant',
      });
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

    return this.prisma.tenantBranding.upsert({
      where: { tenant_id: tenantId },
      update: dbData,
      create: {
        tenant_id: tenantId,
        ...dbData,
      },
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
        error: { code: 'INVALID_FILE_TYPE', message: 'File type not allowed' },
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

    const branding = await this.prisma.tenantBranding.upsert({
      where: { tenant_id: tenantId },
      update: { logo_url: fullKey },
      create: {
        tenant_id: tenantId,
        logo_url: fullKey,
      },
    });

    return branding;
  }
}
