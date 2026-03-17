import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../modules/prisma/prisma.service';
import { RedisService } from '../../modules/redis/redis.service';

/**
 * Permission cache service.
 *
 * Loads and caches permissions for a given membership. Permission data flows:
 * membership → membership_roles → roles → role_permissions → permissions
 *
 * Cache strategy:
 * - Key: `permissions:{membership_id}`
 * - Value: JSON array of permission_key strings
 * - TTL: 60 seconds
 *
 * Invalidation:
 * - Single membership: call invalidate(membershipId)
 * - All memberships for a tenant: call invalidateAllForTenant(tenantId)
 *   (used when roles/permissions are modified at the tenant level)
 *
 * Note: These queries run outside of RLS transaction context as this is a
 * platform-level service. In dev, the Prisma connection uses a superuser.
 */
@Injectable()
export class PermissionCacheService {
  private readonly CACHE_TTL = 60; // seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getPermissions(membershipId: string): Promise<string[]> {
    const client = this.redis.getClient();
    const cacheKey = `permissions:${membershipId}`;

    const cached = await client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Load from DB: membership → membership_roles → roles → role_permissions → permissions
    const membershipRoles = await this.prisma.membershipRole.findMany({
      where: { membership_id: membershipId },
      include: {
        role: {
          include: {
            role_permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const permissionKeys = new Set<string>();
    for (const mr of membershipRoles) {
      for (const rp of mr.role.role_permissions) {
        permissionKeys.add(rp.permission.permission_key);
      }
    }

    const permissions = Array.from(permissionKeys);
    await client.setex(cacheKey, this.CACHE_TTL, JSON.stringify(permissions));

    return permissions;
  }

  async invalidate(membershipId: string): Promise<void> {
    const client = this.redis.getClient();
    await client.del(`permissions:${membershipId}`);
  }

  async invalidateAllForTenant(tenantId: string): Promise<void> {
    // Find all memberships for tenant and invalidate each
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { tenant_id: tenantId },
      select: { id: true },
    });

    const client = this.redis.getClient();
    const pipeline = client.pipeline();
    for (const m of memberships) {
      pipeline.del(`permissions:${m.id}`);
    }
    await pipeline.exec();
  }
}
