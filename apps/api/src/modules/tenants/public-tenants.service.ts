import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  async findBySlug(slug: string): Promise<PublicTenantConfig> {
    const normalised = slug.trim().toLowerCase();
    if (!normalised) {
      throw new NotFoundException({
        error: { code: 'TENANT_NOT_FOUND', message: 'School not found' },
      });
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: normalised },
      include: {
        branding: true,
        domains: {
          where: { verification_status: 'verified' },
          orderBy: { created_at: 'asc' },
          take: 1,
        },
      },
    });

    if (!tenant || tenant.status !== 'active') {
      throw new NotFoundException({
        error: { code: 'TENANT_NOT_FOUND', message: 'School not found' },
      });
    }

    return {
      tenant_id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      display_name: tenant.branding?.school_name_display ?? tenant.name,
      display_name_ar: tenant.branding?.school_name_ar ?? null,
      logo_url: tenant.branding?.logo_url ?? null,
      primary_color: tenant.branding?.primary_color ?? null,
      support_email: tenant.branding?.support_email ?? null,
      support_phone: tenant.branding?.support_phone ?? null,
      default_locale: tenant.default_locale,
      public_domain: tenant.domains[0]?.domain ?? null,
    };
  }
}
