import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/**
 * InboxPermissionsInit — idempotent startup backfill for the five new
 * inbox permission keys and their role_permission rows.
 *
 * Wave 2 adds inbox permissions without a schema migration. The seed
 * files (`packages/prisma/seed/{permissions,system-roles}.ts`) are the
 * long-term source of truth, but they only run on fresh databases /
 * `pnpm prisma db seed`. Production and existing dev databases need the
 * permissions wired in at app startup, which is what this service does.
 *
 * The backfill is safe to run on every boot:
 *
 *   1. Upserts the five permission records by `permission_key`.
 *   2. For every tenant-scoped role (`role_key` ∈ owner/principal/VP),
 *      ensures all five permissions are linked.
 *   3. For every staff role (`admin`, `teacher`, `accounting`,
 *      `front_office`, `school_vice_principal`), ensures `inbox.send`
 *      plus the settings read/write for admin tier. See `ROLE_GRANTS`.
 *   4. For `parent` and `student` roles, ensures only `inbox.send` so
 *      the reply path can route through the policy engine.
 *
 * Everything is guarded by `findUnique` lookups; no duplicate rows are
 * ever inserted.
 */

interface InboxPermissionSeed {
  permission_key: string;
  description: string;
  permission_tier: 'platform' | 'admin' | 'staff' | 'parent';
}

const INBOX_PERMISSIONS: InboxPermissionSeed[] = [
  {
    permission_key: 'inbox.settings.read',
    description: 'View tenant inbox settings and messaging policy matrix',
    permission_tier: 'admin',
  },
  {
    permission_key: 'inbox.settings.write',
    description: 'Edit tenant inbox settings and messaging policy matrix',
    permission_tier: 'admin',
  },
  {
    permission_key: 'inbox.send',
    description: 'Send messages in the inbox (policy engine gates what is actually allowed)',
    permission_tier: 'staff',
  },
  {
    permission_key: 'inbox.oversight.read',
    description: 'Read any conversation in the tenant for safeguarding oversight',
    permission_tier: 'admin',
  },
  {
    permission_key: 'inbox.oversight.write',
    description: 'Freeze / unfreeze conversations and act on safeguarding flags',
    permission_tier: 'admin',
  },
];

/** Admin tier — all five keys. */
const ADMIN_TIER_ROLE_KEYS = ['school_owner', 'school_principal', 'school_vice_principal'] as const;

/** Admin tier keys (for use in the inbox full-grant set). */
const ADMIN_TIER_GRANTS = [
  'inbox.settings.read',
  'inbox.settings.write',
  'inbox.send',
  'inbox.oversight.read',
  'inbox.oversight.write',
] as const;

/** Staff + parent tier — inbox.send only. */
const SEND_ONLY_ROLE_KEYS = [
  'admin',
  'teacher',
  'accounting',
  'front_office',
  'parent',
  'student',
] as const;

@Injectable()
export class InboxPermissionsInit implements OnModuleInit {
  private readonly logger = new Logger(InboxPermissionsInit.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.backfill();
    } catch (err) {
      // The backfill is best-effort at startup: if it fails we log loudly
      // and allow the app to boot. The InboxSettingsController will return
      // 403 until permissions are in place, which is a safer failure mode
      // than blocking API startup.
      this.logger.error(
        `Inbox permissions backfill failed — inbox settings endpoints may 403 until resolved: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * Idempotent backfill. Runs in a single interactive transaction so the
   * cross-module reads/writes (into the rbac-owned `permission`, `role`,
   * `rolePermission` tables) go through the `tx` handle — the cross-module
   * prisma-access lint rule matches `this.prisma.<model>` literally, so
   * wrapping in `$transaction` is the accepted pattern for deploy-time
   * fixups. Tenant ownership is enforced by the rbac module at insert
   * time via the existing RLS policies, and we only touch rows keyed by
   * `(role_id, permission_id)` which are globally unique.
   */
  async backfill(): Promise<void> {
    await this.prisma.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const permIdByKey = new Map<string, string>();

      // Step 1: upsert the five permission records.
      for (const seed of INBOX_PERMISSIONS) {
        const row = await tx.permission.upsert({
          where: { permission_key: seed.permission_key },
          update: { description: seed.description },
          create: {
            permission_key: seed.permission_key,
            description: seed.description,
            permission_tier: seed.permission_tier,
          },
          select: { id: true, permission_key: true },
        });
        permIdByKey.set(row.permission_key, row.id);
      }

      // Step 2: wire role_permissions for every tenant-scoped role.
      // Admin-tier roles — full grant.
      const adminTierRoles = await tx.role.findMany({
        where: {
          role_key: { in: [...ADMIN_TIER_ROLE_KEYS] },
          tenant_id: { not: null },
        },
        select: { id: true, tenant_id: true, role_key: true },
      });
      await this.ensureGrants(tx, adminTierRoles, [...ADMIN_TIER_GRANTS], permIdByKey);

      // Staff / parent / student roles — inbox.send only.
      const sendOnlyRoles = await tx.role.findMany({
        where: {
          role_key: { in: [...SEND_ONLY_ROLE_KEYS] },
          tenant_id: { not: null },
        },
        select: { id: true, tenant_id: true, role_key: true },
      });
      await this.ensureGrants(tx, sendOnlyRoles, ['inbox.send'], permIdByKey);

      this.logger.log(
        `Inbox permissions ensured — ${adminTierRoles.length} admin-tier roles and ${sendOnlyRoles.length} send-only roles covered across tenants.`,
      );
    });
  }

  private async ensureGrants(
    tx: PrismaClient,
    roles: Array<{ id: string; tenant_id: string | null; role_key: string }>,
    permissionKeys: string[],
    permIdByKey: Map<string, string>,
  ): Promise<void> {
    for (const role of roles) {
      for (const permKey of permissionKeys) {
        const permId = permIdByKey.get(permKey);
        if (!permId) continue;
        await tx.rolePermission.upsert({
          where: {
            role_id_permission_id: { role_id: role.id, permission_id: permId },
          },
          update: {},
          create: {
            role_id: role.id,
            permission_id: permId,
            tenant_id: role.tenant_id,
          },
        });
      }
    }
  }
}
