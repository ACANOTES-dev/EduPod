import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type TenantDomain } from '@prisma/client';

import { withRls } from '../../common/helpers/with-rls';
import { OnboardingService } from '../platform/onboarding.service';
import {
  PlatformAuditService,
  type PlatformAuditContext,
} from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import type { CreateDomainDto } from './dto/create-domain.dto';
import type { UpdateDomainDto } from './dto/update-domain.dto';

@Injectable()
export class DomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly onboardingService: OnboardingService,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  /**
   * List all domains for a tenant.
   */
  async listDomains(tenantId: string) {
    await this.ensureTenantExists(tenantId);

    return withRls(this.prisma, { tenant_id: tenantId }, async (tx) =>
      tx.tenantDomain.findMany({
        where: { tenant_id: tenantId },
        orderBy: { created_at: 'asc' },
      }),
    );
  }

  /**
   * Add a new domain to a tenant. Checks for uniqueness.
   */
  async addDomain(tenantId: string, data: CreateDomainDto, audit?: PlatformAuditContext) {
    await this.ensureTenantExists(tenantId);

    let domain: TenantDomain;
    try {
      domain = await withRls(this.prisma, { tenant_id: tenantId }, async (tx) =>
        tx.tenantDomain.create({
          data: {
            tenant_id: tenantId,
            domain: data.domain,
            domain_type: data.domain_type,
            is_primary: data.is_primary,
            verification_status: 'pending',
            ssl_status: 'pending',
          },
        }),
      );
    } catch (err) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException({
          code: 'DOMAIN_TAKEN',
          message: `Domain "${data.domain}" is already registered`,
        });
      }
      throw err;
    }

    await this.onboardingService.autoCompleteStep(tenantId, 'domain_configured', {
      domain: domain.domain,
    });

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'tenant_domain_created',
        target_resource_type: 'tenant_domain',
        target_resource_id: domain.id,
        target_tenant_id: tenantId,
        payload: { after: domain },
      });
    }

    return domain;
  }

  /**
   * Update a domain record. Cannot change the domain string itself.
   */
  async updateDomain(
    tenantId: string,
    domainId: string,
    data: UpdateDomainDto,
    audit?: PlatformAuditContext,
  ) {
    await this.ensureTenantExists(tenantId);

    const domain = await withRls(this.prisma, { tenant_id: tenantId }, async (tx) =>
      tx.tenantDomain.findFirst({
        where: { id: domainId, tenant_id: tenantId },
      }),
    );
    if (!domain) {
      throw new NotFoundException({
        code: 'DOMAIN_NOT_FOUND',
        message: `Domain with id "${domainId}" not found for this tenant`,
      });
    }

    const updated = await withRls(this.prisma, { tenant_id: tenantId }, async (tx) =>
      tx.tenantDomain.update({
        where: { id: domainId },
        data,
      }),
    );

    // Invalidate the cached domain→tenant mapping
    await this.invalidateDomainCache(domain.domain);

    if (data.ssl_status === 'active') {
      await this.onboardingService.autoCompleteStep(tenantId, 'ssl_verified', {
        domain: updated.domain,
      });
    }

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'tenant_domain_updated',
        target_resource_type: 'tenant_domain',
        target_resource_id: domainId,
        target_tenant_id: tenantId,
        payload: { before: domain, after: updated },
      });
    }

    return updated;
  }

  /**
   * Remove a domain from a tenant. Cannot remove the last primary domain.
   */
  async removeDomain(tenantId: string, domainId: string, audit?: PlatformAuditContext) {
    await this.ensureTenantExists(tenantId);

    const domain = await withRls(this.prisma, { tenant_id: tenantId }, async (tx) =>
      tx.tenantDomain.findFirst({
        where: { id: domainId, tenant_id: tenantId },
      }),
    );
    if (!domain) {
      throw new NotFoundException({
        code: 'DOMAIN_NOT_FOUND',
        message: `Domain with id "${domainId}" not found for this tenant`,
      });
    }

    // Cannot remove the last primary domain
    if (domain.is_primary) {
      const primaryCount = await withRls(this.prisma, { tenant_id: tenantId }, async (tx) =>
        tx.tenantDomain.count({
          where: { tenant_id: tenantId, is_primary: true },
        }),
      );
      if (primaryCount <= 1) {
        throw new BadRequestException({
          code: 'LAST_PRIMARY_DOMAIN',
          message: 'Cannot remove the last primary domain. Add another primary domain first.',
        });
      }
    }

    await withRls(this.prisma, { tenant_id: tenantId }, async (tx) =>
      tx.tenantDomain.delete({ where: { id: domainId } }),
    );

    // Invalidate the cached domain→tenant mapping
    await this.invalidateDomainCache(domain.domain);

    if (audit) {
      await this.platformAuditService.log({
        ...audit,
        action: 'tenant_domain_removed',
        target_resource_type: 'tenant_domain',
        target_resource_id: domainId,
        target_tenant_id: tenantId,
        payload: { before: domain },
      });
    }

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

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
