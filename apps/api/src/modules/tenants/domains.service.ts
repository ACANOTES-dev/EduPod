import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import type { CreateDomainDto } from './dto/create-domain.dto';
import type { UpdateDomainDto } from './dto/update-domain.dto';

@Injectable()
export class DomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * List all domains for a tenant.
   */
  async listDomains(tenantId: string) {
    await this.ensureTenantExists(tenantId);

    return this.prisma.tenantDomain.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
    });
  }

  /**
   * Add a new domain to a tenant. Checks for uniqueness.
   */
  async addDomain(tenantId: string, data: CreateDomainDto) {
    await this.ensureTenantExists(tenantId);

    // Check domain uniqueness across all tenants
    const existing = await this.prisma.tenantDomain.findUnique({
      where: { domain: data.domain },
    });
    if (existing) {
      throw new ConflictException({
        code: 'DOMAIN_TAKEN',
        message: `Domain "${data.domain}" is already registered`,
      });
    }

    const domain = await this.prisma.tenantDomain.create({
      data: {
        tenant_id: tenantId,
        domain: data.domain,
        domain_type: data.domain_type,
        is_primary: data.is_primary,
        verification_status: 'pending',
        ssl_status: 'pending',
      },
    });

    return domain;
  }

  /**
   * Update a domain record. Cannot change the domain string itself.
   */
  async updateDomain(tenantId: string, domainId: string, data: UpdateDomainDto) {
    await this.ensureTenantExists(tenantId);

    const domain = await this.prisma.tenantDomain.findFirst({
      where: { id: domainId, tenant_id: tenantId },
    });
    if (!domain) {
      throw new NotFoundException({
        code: 'DOMAIN_NOT_FOUND',
        message: `Domain with id "${domainId}" not found for this tenant`,
      });
    }

    const updated = await this.prisma.tenantDomain.update({
      where: { id: domainId },
      data,
    });

    // Invalidate the cached domain→tenant mapping
    await this.invalidateDomainCache(domain.domain);

    return updated;
  }

  /**
   * Remove a domain from a tenant. Cannot remove the last primary domain.
   */
  async removeDomain(tenantId: string, domainId: string) {
    await this.ensureTenantExists(tenantId);

    const domain = await this.prisma.tenantDomain.findFirst({
      where: { id: domainId, tenant_id: tenantId },
    });
    if (!domain) {
      throw new NotFoundException({
        code: 'DOMAIN_NOT_FOUND',
        message: `Domain with id "${domainId}" not found for this tenant`,
      });
    }

    // Cannot remove the last primary domain
    if (domain.is_primary) {
      const primaryCount = await this.prisma.tenantDomain.count({
        where: { tenant_id: tenantId, is_primary: true },
      });
      if (primaryCount <= 1) {
        throw new BadRequestException({
          code: 'LAST_PRIMARY_DOMAIN',
          message: 'Cannot remove the last primary domain. Add another primary domain first.',
        });
      }
    }

    await this.prisma.tenantDomain.delete({ where: { id: domainId } });

    // Invalidate the cached domain→tenant mapping
    await this.invalidateDomainCache(domain.domain);

    return { deleted: true };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async ensureTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant with id "${tenantId}" not found`,
      });
    }
    return tenant;
  }

  private async invalidateDomainCache(domain: string) {
    const client = this.redis.getClient();
    await client.del(`tenant_domain:${domain}`);
  }
}
