import { Injectable } from '@nestjs/common';

import { runWithRlsContext } from '../../common/middleware/rls.middleware';
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
 * Cache reads are wrapped in a lightweight RLS context keyed by membership_id
 * so permission checks stay compatible with FORCE ROW LEVEL SECURITY.
 */
@Injectable()
export class PermissionCacheService {
  private readonly CACHE_TTL = 60; // seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Return cached permission keys for a membership, loading from DB on cache miss (TTL: 60s). */
  async getPermissions(membershipId: string): Promise<string[]> {
    const client = this.redis.getClient();
    const cacheKey = `permissions:${membershipId}`;

    const cached = await client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Load from DB: membership → membership_roles → roles → role_permissions → permissions
    const membershipRoles = await runWithRlsContext(
      this.prisma,
      { membership_id: membershipId },
      async (tx) =>
        tx.membershipRole.findMany({
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
        }),
    );

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

  /**
   * Invalidate all cached permission entries for every membership in a tenant.
   * Call this when a role or permission is changed tenant-wide (e.g., role assignment update).
   * Uses a Redis pipeline for atomic batch deletion.
   */
  async invalidateAllForTenant(tenantId: string): Promise<void> {
    // Find all memberships for tenant and invalidate each
    const memberships = await runWithRlsContext(this.prisma, { tenant_id: tenantId }, async (tx) =>
      tx.tenantMembership.findMany({
        where: { tenant_id: tenantId },
        select: { id: true },
      }),
    );

    const client = this.redis.getClient();
    const pipeline = client.pipeline();
    for (const m of memberships) {
      pipeline.del(`permissions:${m.id}`);
    }
    await pipeline.exec();
  }
}
