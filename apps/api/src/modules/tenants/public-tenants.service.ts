import { Injectable, NotFoundException } from '@nestjs/common';

import { runWithRlsContext } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

export interface PublicTenantConfig {
  tenant_id: string;
  slug: string;
  name: string;
  display_name: string;
  display_name_ar: string | null;
  logo_url: string | null;
  primary_color: string | null;
  support_email: string | null;
  support_phone: string | null;
  default_locale: string;
  public_domain: string | null;
}

@Injectable()
export class PublicTenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  async findBySlug(slug: string): Promise<PublicTenantConfig> {
    const normalised = slug.trim().toLowerCase();
    if (!normalised) {
      throw new NotFoundException({
        error: { code: 'TENANT_NOT_FOUND', message: 'School not found' },
      });
    }

    // Step 1 — look up the tenant by slug. `tenants` is a platform-level
    // table with no RLS, so a direct query is safe even with no tenant
    // context set on the request.
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: normalised },
    });

    if (!tenant || tenant.status !== 'active') {
      throw new NotFoundException({
        error: { code: 'TENANT_NOT_FOUND', message: 'School not found' },
      });
    }

    // Step 2 — pull the branding row and one verified domain inside a
    // tenant-scoped RLS transaction. Both tables have RLS policies keyed on
    // `app.current_tenant_id`, so we need a real `SET LOCAL` before the
    // query or Postgres will reject the session variable cast to UUID.
    const related = await runWithRlsContext(this.prisma, { tenant_id: tenant.id }, async (tx) => {
      const [branding, domain] = await Promise.all([
        tx.tenantBranding.findUnique({ where: { tenant_id: tenant.id } }),
        tx.tenantDomain.findFirst({
          where: { tenant_id: tenant.id, verification_status: 'verified' },
          orderBy: { created_at: 'asc' },
        }),
      ]);
      return { branding, domain };
    });

    // Resolve raw S3 key to a presigned URL so the public form can render it
    let resolvedLogoUrl: string | null = related.branding?.logo_url ?? null;
    if (resolvedLogoUrl) {
      try {
        resolvedLogoUrl = await this.s3.getPresignedUrl(resolvedLogoUrl, 3600);
      } catch {
        console.error('[PublicTenantsService.findBySlug] Failed to presign logo URL');
        resolvedLogoUrl = null;
      }
    }

    return {
      tenant_id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      display_name: related.branding?.school_name_display ?? tenant.name,
      display_name_ar: related.branding?.school_name_ar ?? null,
      logo_url: resolvedLogoUrl,
      primary_color: related.branding?.primary_color ?? null,
      support_email: related.branding?.support_email ?? null,
      support_phone: related.branding?.support_phone ?? null,
      default_locale: tenant.default_locale,
      public_domain: related.domain?.domain ?? null,
    };
  }
}
