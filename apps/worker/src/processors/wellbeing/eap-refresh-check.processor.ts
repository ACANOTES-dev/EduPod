import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { MembershipStatus, Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

// ─── Job name ─────────────────────────────────────────────────────────────────

export const EAP_REFRESH_CHECK_JOB = 'wellbeing:eap-refresh-check';

// ─── Constants ────────────────────────────────────────────────────────────────

const EAP_STALE_DAYS = 90;
const EAP_STALE_MS = EAP_STALE_DAYS * 24 * 60 * 60 * 1000;
const WELLBEING_MANAGE_RESOURCES_PERMISSION = 'wellbeing.manage_resources';

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Cross-tenant cron job — runs at 06:00 UTC daily.
 *
 * For each tenant with the staff_wellbeing module enabled, checks whether the
 * EAP (Employee Assistance Programme) provider details have been verified in
 * the past 90 days. If not, sends in-app notifications to all users with the
 * `wellbeing.manage_resources` permission.
 */
@Processor(QUEUE_NAMES.WELLBEING, {
  lockDuration: 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class EapRefreshCheckProcessor extends WorkerHost {
  private readonly logger = new Logger(EapRefreshCheckProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== EAP_REFRESH_CHECK_JOB) return;

    this.logger.log(`Processing ${EAP_REFRESH_CHECK_JOB}`);

    // Find all tenants with staff_wellbeing module enabled (cross-tenant, no RLS)
    const enabledModules = await this.prisma.tenantModule.findMany({
      where: {
        module_key: 'staff_wellbeing',
        is_enabled: true,
      },
      select: { tenant_id: true },
    });

    if (enabledModules.length === 0) {
      this.logger.log('No tenants with staff_wellbeing module enabled');
      return;
    }

    this.logger.log(`Found ${enabledModules.length} tenant(s) with staff_wellbeing enabled`);

    const now = Date.now();
    const staleThreshold = now - EAP_STALE_MS;

    for (const { tenant_id: tenantId } of enabledModules) {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;

        // Read EAP last verified date from tenant settings
        const tenantSetting = await tx.tenantSetting.findUnique({
          where: { tenant_id: tenantId },
          select: { settings: true },
        });

        const settings = (tenantSetting?.settings ?? {}) as Record<string, unknown>;
        const wellbeingSettings = (settings['staff_wellbeing'] ?? {}) as Record<string, unknown>;
        const rawDate = wellbeingSettings['eap_last_verified_date'];

        // Determine whether EAP details are stale
        const isStale = this.isEapStale(rawDate, staleThreshold);

        if (!isStale) {
          this.logger.debug(`Tenant ${tenantId}: EAP details are current — skipping`);
          return;
        }

        this.logger.log(
          `Tenant ${tenantId}: EAP details are stale (last verified: ${rawDate ?? 'never'}) — finding managers`,
        );

        // Find users with wellbeing.manage_resources permission
        const userIds = await this.findUsersWithPermission(
          tx as unknown as PrismaClient,
          tenantId,
          WELLBEING_MANAGE_RESOURCES_PERMISSION,
        );

        if (userIds.length === 0) {
          this.logger.warn(
            `Tenant ${tenantId}: no users with ${WELLBEING_MANAGE_RESOURCES_PERMISSION} permission — skipping notifications`,
          );
          return;
        }

        // Create in-app notifications for each eligible user
        const now = new Date();

        await tx.notification.createMany({
          data: userIds.map((userId) => ({
            tenant_id: tenantId,
            recipient_user_id: userId,
            channel: 'in_app' as const,
            template_key: null,
            locale: 'en',
            status: 'delivered' as const,
            delivered_at: now,
            payload_json: {
              title: 'EAP Details Review',
              body: "It's been a while — please verify your EAP provider details are current.",
              link: '/settings/wellbeing',
            } as Prisma.InputJsonValue,
            source_entity_type: 'tenant_settings',
            source_entity_id: tenantId,
          })),
        });

        this.logger.log(
          `Tenant ${tenantId}: created EAP review notifications for ${userIds.length} user(s)`,
        );
      });
    }

    this.logger.log(`${EAP_REFRESH_CHECK_JOB} complete`);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Returns true if the EAP details are considered stale:
   * - eap_last_verified_date is null/undefined, OR
   * - the date parsed from the value is earlier than the stale threshold
   */
  private isEapStale(rawDate: unknown, staleThresholdMs: number): boolean {
    if (rawDate == null) return true;
    if (typeof rawDate !== 'string') return true;

    const parsed = new Date(rawDate).getTime();
    if (isNaN(parsed)) return true;

    return parsed < staleThresholdMs;
  }

  /**
   * Resolves user IDs that hold the given permission key within a tenant.
   *
   * Join chain:
   *   permission → role_permission → membership_role → tenant_membership
   */
  private async findUsersWithPermission(
    tx: PrismaClient,
    tenantId: string,
    permissionKey: string,
  ): Promise<string[]> {
    // 1. Resolve the permission record
    const permission = await tx.permission.findFirst({
      where: { permission_key: permissionKey },
      select: { id: true },
    });

    if (!permission) {
      this.logger.warn(`Permission key "${permissionKey}" not found in permission table`);
      return [];
    }

    // 2. Find all role IDs that have this permission
    const rolePermissions = await tx.rolePermission.findMany({
      where: { permission_id: permission.id },
      select: { role_id: true },
    });

    if (rolePermissions.length === 0) return [];

    const roleIds = rolePermissions.map((rp) => rp.role_id);

    // 3. Find all membership IDs in this tenant that have one of those roles
    const membershipRoles = await tx.membershipRole.findMany({
      where: { role_id: { in: roleIds } },
      select: { membership_id: true },
    });

    if (membershipRoles.length === 0) return [];

    const membershipIds = membershipRoles.map((mr) => mr.membership_id);

    // 4. Resolve to user IDs via active tenant memberships
    const memberships = await tx.tenantMembership.findMany({
      where: {
        id: { in: membershipIds },
        tenant_id: tenantId,
        membership_status: MembershipStatus.active,
      },
      select: { user_id: true },
    });

    // Deduplicate: a user might hold the permission through multiple roles
    return [...new Set(memberships.map((m) => m.user_id))];
  }
}
