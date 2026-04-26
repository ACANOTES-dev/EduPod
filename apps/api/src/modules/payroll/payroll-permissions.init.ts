import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { runWithRlsContext } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

/**
 * PayrollPermissionsInit — idempotent startup backfill for the two new
 * payroll permission keys and their role_permission rows.
 *
 * Wave 1 added these permissions to the seed catalogue (`packages/prisma/seed/`)
 * but seeds only run on fresh databases. Existing tenants need the
 * backfill at boot, mirroring the InboxPermissionsInit pattern.
 *
 * The two permissions are:
 *
 *   - payroll.manage_attendance — admin-tier roles only (school_owner,
 *     school_principal, school_vice_principal, accounting). Splits the
 *     pre-rebuild over-broad `payroll.create_run` grant.
 *   - payroll.self_service — granted to ALL tenant roles (every staff
 *     user should be able to read their own payslips). The service-layer
 *     enforcement scopes to the calling user's own staff_profile so the
 *     permission alone never authorises cross-staff access.
 *
 * Safe to run on every boot.
 */

const PAYROLL_PERMISSIONS = [
  {
    permission_key: 'payroll.manage_attendance',
    description: 'Mark and bulk-update staff attendance records',
    permission_tier: 'admin' as const,
  },
  {
    permission_key: 'payroll.self_service',
    description: 'View own payslips and YTD summary',
    permission_tier: 'staff' as const,
  },
];

const ADMIN_TIER_ROLE_KEYS = [
  'school_owner',
  'school_principal',
  'school_vice_principal',
  'accounting',
] as const;

@Injectable()
export class PayrollPermissionsInit implements OnModuleInit {
  private readonly logger = new Logger(PayrollPermissionsInit.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.backfill();
    } catch (err) {
      // Best-effort at startup: log and continue. Endpoints that require
      // these permissions will 403 until resolved, which is safer than
      // blocking API boot.
      this.logger.error(
        `Payroll permissions backfill failed — payroll.manage_attendance / self_service may be missing: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  /**
   * Idempotent two-pass backfill — same shape as `InboxPermissionsInit`.
   *
   *   Pass 1 (unscoped): upserts the two permission rows, reads the
   *     active-tenant list. The `permissions` and `tenants` tables are
   *     not RLS-protected.
   *   Pass 2 (per tenant, RLS-scoped): grants
   *     `payroll.manage_attendance` to admin-tier roles and
   *     `payroll.self_service` to ALL tenant roles.
   */
  async backfill(): Promise<void> {
    const { permIdByKey, tenantIds } = await this.prisma.$transaction(async (txClient) => {
      const tx = txClient as unknown as PrismaClient;

      const permIds = new Map<string, string>();
      for (const seed of PAYROLL_PERMISSIONS) {
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

      const tenants = await tx.tenant.findMany({
        where: { status: 'active' },
        select: { id: true },
      });
      return { permIdByKey: permIds, tenantIds: tenants.map((t) => t.id) };
    });

    let adminGrants = 0;
    let allRoleGrants = 0;
    let skippedTenants = 0;

    for (const tenantId of tenantIds) {
      try {
        await runWithRlsContext(this.prisma, { tenant_id: tenantId }, async (tx) => {
          // payroll.manage_attendance → admin tier only
          const adminRoles = await tx.role.findMany({
            where: {
              tenant_id: tenantId,
              role_key: { in: [...ADMIN_TIER_ROLE_KEYS] },
            },
            select: { id: true, tenant_id: true },
          });
          await this.ensureGrants(tx, adminRoles, ['payroll.manage_attendance'], permIdByKey);
          adminGrants += adminRoles.length;

          // payroll.self_service → every tenant role
          const allRoles = await tx.role.findMany({
            where: { tenant_id: tenantId },
            select: { id: true, tenant_id: true },
          });
          await this.ensureGrants(tx, allRoles, ['payroll.self_service'], permIdByKey);
          allRoleGrants += allRoles.length;
        });
      } catch (err) {
        skippedTenants += 1;
        this.logger.warn(
          `Payroll permission backfill skipped for tenant ${tenantId}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Payroll permissions ensured — ${tenantIds.length - skippedTenants}/${tenantIds.length} tenants, ${adminGrants} admin-tier + ${allRoleGrants} self-service grants.`,
    );
  }

  private async ensureGrants(
    tx: PrismaClient,
    roles: Array<{ id: string; tenant_id: string | null }>,
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
