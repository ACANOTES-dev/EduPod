import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';

import type { TenantContext } from '@school/shared';

import { PrismaService } from '../../modules/prisma/prisma.service';
import { RedisService } from '../../modules/redis/redis.service';

import { runWithRlsContext } from './rls.middleware';

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
 * tenant_domains resolution runs inside a lightweight RLS bootstrap transaction
 * keyed by the request hostname. This keeps public domain lookup compatible
 * with FORCE ROW LEVEL SECURITY in production.
 */
@Injectable()
export class TenantResolutionMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantResolutionMiddleware.name);

  private readonly platformDomain: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.platformDomain = this.configService.get<string>('PLATFORM_DOMAIN', 'edupod.app');
  }

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
        const hostname = this.getRequestHostname(req);
        const isProxyHostname = this.isProxyHostname(hostname);
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
          if (isProxyHostname) {
            const mutableReq = req as unknown as { tenantContext: TenantContext | null };
            mutableReq.tenantContext = await this.resolveTenantFromToken(req);
            return next();
          }

          const domainRecord = await this.findDomainRecord(hostname);

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
      const hostname = this.getRequestHostname(req);
      const isProxyHostname = this.isProxyHostname(hostname);

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

      if (isProxyHostname) {
        const tenantFromToken = await this.resolveTenantFromToken(req);
        if (tenantFromToken) {
          const mutableReq = req as unknown as { tenantContext: TenantContext };
          mutableReq.tenantContext = tenantFromToken;
          return next();
        }

        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'Not found' },
        });
      }

      const domainRecord = await this.findDomainRecord(hostname);

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

  private async findDomainRecord(hostname: string) {
    return runWithRlsContext(this.prisma, { tenant_domain: hostname }, async (tx) =>
      tx.tenantDomain.findFirst({
        where: { domain: hostname, verification_status: 'verified' },
        include: { tenant: true },
      }),
    );
  }

  private isProxyHostname(hostname: string): boolean {
    return (
      hostname === this.platformDomain ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1'
    );
  }

  private getRequestHostname(req: Request): string {
    const forwardedHostHeader = req.headers['x-forwarded-host'];
    const forwardedHost = Array.isArray(forwardedHostHeader)
      ? forwardedHostHeader[0]
      : forwardedHostHeader?.split(',')[0]?.trim();

    const rawHost = forwardedHost || req.hostname;
    return rawHost.replace(/:\d+$/, '').toLowerCase();
  }

  /**
   * Attempt to resolve tenant context from the JWT bearer token.
   * Used as a fallback when the request arrives via the platform domain
   * (Next.js rewrite proxy) rather than a tenant subdomain.
   */
  private async resolveTenantFromToken(req: Request): Promise<TenantContext | null> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) return null;

      const token = authHeader.substring(7);
      const secret = this.configService.get<string>('JWT_SECRET');
      if (!secret) return null;

      const decoded = jwt.verify(token, secret) as {
        tenant_id?: string;
        type?: string;
      };

      if (!decoded.tenant_id || decoded.type !== 'access') return null;

      // Check Redis cache for this tenant
      const client = this.redis.getClient();
      const tenantCacheKey = `tenant:${decoded.tenant_id}`;
      const cachedTenant = await client.get(tenantCacheKey);

      if (cachedTenant) {
        return JSON.parse(cachedTenant) as TenantContext;
      }

      // Query the tenant directly
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: decoded.tenant_id },
      });

      if (!tenant || tenant.status === 'archived') return null;

      if (tenant.status === 'suspended') {
        await client.set(`tenant:${tenant.id}:suspended`, 'true');
        return null;
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
      await client.setex(tenantCacheKey, 60, JSON.stringify(tenantContext));

      return tenantContext;
    } catch {
      return null;
    }
  }
}
