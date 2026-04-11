import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { runWithRlsContext } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

/**
 * SafeguardingPermissionsInit — idempotent startup backfill for the
 * `safeguarding.keywords.write` permission and the role_permission rows that
 * grant it to the admin tier (Owner / Principal / Vice Principal).
 *
 * Mirrors the two-pass RLS pattern used by `InboxPermissionsInit`:
 *
 *   1) Unscoped pass: upsert the permission record and read the active
 *      tenant list (both `permissions` and `tenants` are platform tables
 *      without RLS).
 *   2) Per-tenant pass inside `runWithRlsContext`: upsert the
 *      `role_permission` rows for the admin-tier roles.
 */

const SAFEGUARDING_KEYWORDS_WRITE_PERMISSION = {
  permission_key: 'safeguarding.keywords.write',
  description: 'Read and manage the tenant safeguarding keyword list',
  permission_tier: 'admin' as const,
};

const ADMIN_TIER_ROLE_KEYS = ['school_owner', 'school_principal', 'school_vice_principal'] as const;

@Injectable()
export class SafeguardingPermissionsInit implements OnModuleInit {
  private readonly logger = new Logger(SafeguardingPermissionsInit.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.backfill();
    } catch (err) {
      this.logger.error(
        `Safeguarding permissions backfill failed — /v1/safeguarding/keywords endpoints may 403 until resolved: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  async backfill(): Promise<void> {
    const { permissionId, tenantIds } = await this.prisma.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const perm = await tx.permission.upsert({
        where: { permission_key: SAFEGUARDING_KEYWORDS_WRITE_PERMISSION.permission_key },
        update: { description: SAFEGUARDING_KEYWORDS_WRITE_PERMISSION.description },
        create: {
          permission_key: SAFEGUARDING_KEYWORDS_WRITE_PERMISSION.permission_key,
          description: SAFEGUARDING_KEYWORDS_WRITE_PERMISSION.description,
          permission_tier: SAFEGUARDING_KEYWORDS_WRITE_PERMISSION.permission_tier,
        },
        select: { id: true },
      });

      const tenants = await tx.tenant.findMany({
        where: { status: 'active' },
        select: { id: true },
      });
      return { permissionId: perm.id, tenantIds: tenants.map((t) => t.id) };
    });

    let adminGrants = 0;
    for (const tenantId of tenantIds) {
      await runWithRlsContext(this.prisma, { tenant_id: tenantId }, async (tx) => {
        const adminTierRoles = await tx.role.findMany({
          where: {
            tenant_id: tenantId,
            role_key: { in: [...ADMIN_TIER_ROLE_KEYS] },
          },
          select: { id: true, tenant_id: true },
        });

        for (const role of adminTierRoles) {
          await tx.rolePermission.upsert({
            where: {
              role_id_permission_id: { role_id: role.id, permission_id: permissionId },
            },
            update: {},
            create: {
              role_id: role.id,
              permission_id: permissionId,
              tenant_id: role.tenant_id,
            },
          });
          adminGrants += 1;
        }
      });
    }

    this.logger.log(
      `Safeguarding permissions ensured — ${tenantIds.length} tenants, ${adminGrants} admin-tier grants.`,
    );
  }
}
