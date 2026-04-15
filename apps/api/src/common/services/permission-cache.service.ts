import { Injectable, Logger } from '@nestjs/common';

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
  private readonly logger = new Logger(PermissionCacheService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // SCHED-030 (STRESS-082): Redis GET/SETEX failures must not take down the
  // permission check. When the cache layer is unavailable, fall through to
  // the authoritative Postgres read.

  private async safeRedisGet(key: string): Promise<string | null> {
    try {
      return await this.redis.getClient().get(key);
    } catch (err) {
      this.logger.warn(
        `Redis GET failed for key ${key}; falling back to DB: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  private async safeRedisSetex(key: string, ttl: number, value: string): Promise<void> {
    try {
      await this.redis.getClient().setex(key, ttl, value);
    } catch (err) {
      this.logger.warn(
        `Redis SETEX failed for key ${key} (best effort): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ─── Owner bypass ───────────────────────────────────────────────────────────
  // Three role_keys grant unrestricted access: school_owner, school_principal,
  // and school_vice_principal. The principal and vice principal are trusted
  // delegates of the owner and share every privilege (wizard, publish, settings,
  // reopen-request approvals). Parents, accounting, and teachers go through the
  // normal permission check.
  private static readonly OWNER_ROLE_KEYS: readonly string[] = [
    'school_owner',
    'school_principal',
    'school_vice_principal',
  ];

  /**
   * Check if a membership holds one of the leadership roles that bypass
   * permission checks. Cached separately with a 5-minute TTL since role
   * assignments change rarely.
   */
  async isOwner(membershipId: string): Promise<boolean> {
    const cacheKey = `owner:${membershipId}`;

    const cached = await this.safeRedisGet(cacheKey);
    if (cached !== null) {
      return cached === '1';
    }

    const ownerRole = await runWithRlsContext(
      this.prisma,
      { membership_id: membershipId },
      async (tx) =>
        tx.membershipRole.findFirst({
          where: {
            membership_id: membershipId,
            role: { role_key: { in: [...PermissionCacheService.OWNER_ROLE_KEYS] } },
          },
          select: { role_id: true },
        }),
    );

    const isOwner = ownerRole !== null;
    await this.safeRedisSetex(cacheKey, 300, isOwner ? '1' : '0');
    return isOwner;
  }

  // ─── Permission resolution ────────────────────────────────────────────────

  /** Return cached permission keys for a membership, loading from DB on cache miss (TTL: 60s). */
  async getPermissions(membershipId: string): Promise<string[]> {
    const cacheKey = `permissions:${membershipId}`;

    const cached = await this.safeRedisGet(cacheKey);
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
    await this.safeRedisSetex(cacheKey, this.CACHE_TTL, JSON.stringify(permissions));

    return permissions;
  }

  async invalidate(membershipId: string): Promise<void> {
    const client = this.redis.getClient();
    const pipeline = client.pipeline();
    pipeline.del(`permissions:${membershipId}`);
    pipeline.del(`owner:${membershipId}`);
    await pipeline.exec();
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
      pipeline.del(`owner:${m.id}`);
    }
    await pipeline.exec();
  }
}
