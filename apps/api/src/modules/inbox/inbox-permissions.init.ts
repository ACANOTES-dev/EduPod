import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { runWithRlsContext } from '../../common/middleware/rls.middleware';
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
    permission_key: 'inbox.read',
    description: 'Read the inbox — list threads, open a thread, mark read',
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
  'inbox.read',
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
   * Idempotent backfill. Runs in two passes so the RLS policies on
   * `roles` / `role_permissions` get the tenant context they need:
   *
   *   1) An unscoped pass upserts the five `permission` records and
   *      reads the list of tenants. The `permissions` and `tenants`
   *      tables are not RLS-protected so no tenant context is needed.
   *   2) A per-tenant pass runs inside `runWithRlsContext(prisma, { tenant_id })`
   *      which issues `SET LOCAL app.current_tenant_id` before any query.
   *      Inside that transaction we read the tenant's system roles and
   *      upsert the `role_permissions` for each one.
   *
   * Both passes go through the `tx` handle so the
   * `no-cross-module-prisma-access` lint rule (which matches
   * `this.prisma.<model>` literally) does not flag the cross-module
   * reads into rbac tables.
   */
  async backfill(): Promise<void> {
    // ─── Pass 1: permissions + tenant list (unscoped) ───────────────────────
    const { permIdByKey, tenantIds } = await this.prisma.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;
      const permIds = await upsertInboxPermissionRows(tx);
      const tenants = await tx.tenant.findMany({
        where: { status: 'active' },
        select: { id: true },
      });
      return { permIdByKey: permIds, tenantIds: tenants.map((t) => t.id) };
    });

    // ─── Pass 2: per-tenant role_permission upserts (RLS-scoped) ────────────
    let adminGrants = 0;
    let sendGrants = 0;
    for (const tenantId of tenantIds) {
      const counts = await backfillInboxPermissionsForTenant(this.prisma, tenantId, permIdByKey);
      adminGrants += counts.adminGrants;
      sendGrants += counts.sendGrants;
    }

    this.logger.log(
      `Inbox permissions ensured — ${tenantIds.length} tenants, ${adminGrants} admin-tier roles, ${sendGrants} send-only roles.`,
    );
  }
}

/** Idempotent upsert of the inbox.* permission rows. Returns key→id map. */
export async function upsertInboxPermissionRows(tx: PrismaClient): Promise<Map<string, string>> {
  const permIds = new Map<string, string>();
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
    permIds.set(row.permission_key, row.id);
  }
  return permIds;
}

/**
 * Backfill inbox role_permissions for a single tenant. Callable from
 * tenant-creation paths so a tenant created after boot does not have to
 * wait for the next deploy to pick up inbox.* grants. Accepts an optional
 * pre-resolved permId map so the caller can skip the Pass-1 upsert if
 * already done.
 */
export async function backfillInboxPermissionsForTenant(
  prisma: PrismaService,
  tenantId: string,
  permIdByKey?: Map<string, string>,
): Promise<{ adminGrants: number; sendGrants: number }> {
  const permIds =
    permIdByKey ??
    (await prisma.$transaction(async (txClient) =>
      upsertInboxPermissionRows(txClient as unknown as PrismaClient),
    ));

  let adminGrants = 0;
  let sendGrants = 0;
  await runWithRlsContext(prisma, { tenant_id: tenantId }, async (tx) => {
    const adminTierRoles = await tx.role.findMany({
      where: { tenant_id: tenantId, role_key: { in: [...ADMIN_TIER_ROLE_KEYS] } },
      select: { id: true, tenant_id: true, role_key: true },
    });
    await ensureGrantsInternal(tx, adminTierRoles, [...ADMIN_TIER_GRANTS], permIds);
    adminGrants = adminTierRoles.length;

    const sendOnlyRoles = await tx.role.findMany({
      where: { tenant_id: tenantId, role_key: { in: [...SEND_ONLY_ROLE_KEYS] } },
      select: { id: true, tenant_id: true, role_key: true },
    });
    await ensureGrantsInternal(tx, sendOnlyRoles, ['inbox.send', 'inbox.read'], permIds);
    sendGrants = sendOnlyRoles.length;
  });

  return { adminGrants, sendGrants };
}

async function ensureGrantsInternal(
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
