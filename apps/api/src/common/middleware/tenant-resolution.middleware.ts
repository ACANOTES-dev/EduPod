import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { TenantContext } from '@school/shared';
import { NextFunction, Request, Response } from 'express';

import { PrismaService } from '../../modules/prisma/prisma.service';
import { RedisService } from '../../modules/redis/redis.service';

/**
 * Tenant resolution middleware.
 *
 * Resolution flow:
 * 1. Skip platform admin and public invitation routes (no tenant context needed)
 * 2. Extract hostname from request
 * 3. Check Redis cache for domain → tenant mapping
 * 4. On cache miss, query tenant_domains WHERE domain = hostname AND verification_status = 'verified'
 * 5. Check tenant status (active/suspended/archived)
 * 6. Cache result for 60s, inject tenant context into request
 *
 * Note: The tenant_domains query runs outside of an RLS transaction context.
 * In development, the Prisma connection uses a superuser which bypasses RLS.
 * In production, the connection role must be the table owner (which bypasses
 * ENABLE ROW LEVEL SECURITY but not FORCE). If FORCE is used on tenant_domains,
 * ensure the connection role has BYPASSRLS or reconfigure RLS policies.
 */
@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolutionMiddleware.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Skip tenant resolution for platform admin routes
    if (req.originalUrl.startsWith('/api/v1/admin')) {
      const mutableReq = req as unknown as { tenantContext: TenantContext | null };
      mutableReq.tenantContext = null;
      return next();
    }

    // Skip tenant resolution for auth routes (login works with or without tenant context)
    if (req.originalUrl.startsWith('/api/v1/auth')) {
      // Attempt tenant resolution but don't block if no domain found
      try {
        const hostname = req.hostname;
        const client = this.redis.getClient();
        const cacheKey = `tenant_domain:${hostname}`;
        const cached = await client.get(cacheKey);

        if (cached) {
          const tenantContext: TenantContext = JSON.parse(cached);

          // Check suspension flag
          const suspended = await client.get(`tenant:${tenantContext.tenant_id}:suspended`);
          if (suspended) {
            return res.status(403).json({
              error: {
                code: 'TENANT_SUSPENDED',
                message: 'This school account has been suspended',
              },
            });
          }

          const mutableReq = req as unknown as { tenantContext: TenantContext };
          mutableReq.tenantContext = tenantContext;
        } else {
          const domainRecord = await this.prisma.tenantDomain.findFirst({
            where: { domain: hostname, verification_status: 'verified' },
            include: { tenant: true },
          });

          if (domainRecord && domainRecord.tenant.status === 'active') {
            const tenantContext: TenantContext = {
              tenant_id: domainRecord.tenant.id,
              slug: domainRecord.tenant.slug,
              name: domainRecord.tenant.name,
              status: domainRecord.tenant.status,
              default_locale: domainRecord.tenant.default_locale,
              timezone: domainRecord.tenant.timezone,
            };
            await client.setex(cacheKey, 60, JSON.stringify(tenantContext));
            const mutableReq = req as unknown as { tenantContext: TenantContext };
            mutableReq.tenantContext = tenantContext;
          } else {
            const mutableReq = req as unknown as { tenantContext: TenantContext | null };
            mutableReq.tenantContext = null;
          }
        }
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error(`Auth route tenant resolution failed: ${err.message}`, err.stack);
        const mutableReq = req as unknown as { tenantContext: TenantContext | null };
        mutableReq.tenantContext = null;
      }

      return next();
    }

    // Skip tenant resolution for invitation acceptance (public endpoint)
    if (req.originalUrl.startsWith('/api/v1/invitations/accept')) {
      const mutableReq = req as unknown as { tenantContext: TenantContext | null };
      mutableReq.tenantContext = null;
      return next();
    }

    try {
      const hostname = req.hostname;

      // Check Redis cache first
      const client = this.redis.getClient();
      const cacheKey = `tenant_domain:${hostname}`;
      const cached = await client.get(cacheKey);

      if (cached) {
        const tenantContext: TenantContext = JSON.parse(cached);

        // Check suspension flag
        const suspended = await client.get(`tenant:${tenantContext.tenant_id}:suspended`);
        if (suspended) {
          return res.status(403).json({
            error: {
              code: 'TENANT_SUSPENDED',
              message: 'This school account has been suspended',
            },
          });
        }

        const mutableReq = req as unknown as { tenantContext: TenantContext };
        mutableReq.tenantContext = tenantContext;
        return next();
      }

      // Query database — this runs outside RLS transaction context
      const domainRecord = await this.prisma.tenantDomain.findFirst({
        where: { domain: hostname, verification_status: 'verified' },
        include: { tenant: true },
      });

      if (!domainRecord) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Not found' },
        });
      }

      const tenant = domainRecord.tenant;

      if (tenant.status === 'archived') {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Not found' },
        });
      }

      if (tenant.status === 'suspended') {
        // Set Redis flag for quick checks on subsequent requests
        await client.set(`tenant:${tenant.id}:suspended`, 'true');
        return res.status(403).json({
          error: {
            code: 'TENANT_SUSPENDED',
            message: 'This school account has been suspended',
          },
        });
      }

      const tenantContext: TenantContext = {
        tenant_id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        default_locale: tenant.default_locale,
        timezone: tenant.timezone,
      };

      // Cache for 60 seconds
      await client.setex(cacheKey, 60, JSON.stringify(tenantContext));

      const mutableReq = req as unknown as { tenantContext: TenantContext };
      mutableReq.tenantContext = tenantContext;
      next();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Tenant resolution failed: ${err.message}`, err.stack);
      return res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      });
    }
  }
}
