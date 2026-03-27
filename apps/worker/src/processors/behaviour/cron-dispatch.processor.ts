import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { behaviourSettingsSchema } from '@school/shared';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';

import { BEHAVIOUR_DETECT_PATTERNS_JOB } from './detect-patterns.processor';
import { BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB } from './digest-notifications.processor';
import { BEHAVIOUR_GUARDIAN_RESTRICTION_CHECK_JOB } from './guardian-restriction-check.processor';
import { BEHAVIOUR_RETENTION_CHECK_JOB } from './retention-check.processor';
import { SLA_CHECK_JOB } from './sla-check.processor';
import { BEHAVIOUR_SUSPENSION_RETURN_JOB } from './suspension-return.processor';
import { BEHAVIOUR_TASK_REMINDERS_JOB } from './task-reminders.processor';

// ─── Cron dispatch job name constants ────────────────────────────────────────

export const BEHAVIOUR_CRON_DISPATCH_DAILY_JOB = 'behaviour:cron-dispatch-daily';
export const BEHAVIOUR_CRON_DISPATCH_SLA_JOB = 'behaviour:cron-dispatch-sla';
export const BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB = 'behaviour:cron-dispatch-monthly';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ActiveBehaviourTenant {
  id: string;
  timezone: string;
}

// ─── Processor ───────────────────────────────────────────────────────────────

/**
 * Cross-tenant cron dispatcher for the behaviour module.
 *
 * This processor does NOT use TenantAwareJob because it operates across
 * all tenants (no single tenant_id in its own payload). It queries active
 * tenants with the behaviour module enabled and enqueues per-tenant jobs
 * into the appropriate queues.
 *
 * Three dispatch types:
 * - Daily: runs hourly, checks tenant timezone, enqueues daily jobs at the right local hour
 * - SLA: runs every 5 min, enqueues safeguarding SLA checks per tenant
 * - Monthly: runs on the 1st, enqueues retention checks per tenant
 */
@Processor(QUEUE_NAMES.BEHAVIOUR)
export class BehaviourCronDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(BehaviourCronDispatchProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.BEHAVIOUR) private readonly behaviourQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case BEHAVIOUR_CRON_DISPATCH_DAILY_JOB:
        await this.dispatchDaily();
        break;
      case BEHAVIOUR_CRON_DISPATCH_SLA_JOB:
        await this.dispatchSla();
        break;
      case BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB:
        await this.dispatchMonthly();
        break;
      default:
        // Not our job — another processor on the same queue handles it
        return;
    }
  }

  // ─── Daily dispatch ──────────────────────────────────────────────────────

  /**
   * Runs hourly. For each active tenant with behaviour enabled:
   * - At 07:00 TZ -> suspension-return
   * - At 08:00 TZ -> task-reminders
   * - At 05:00 UTC -> detect-patterns (UTC-based)
   * - At 06:00 UTC -> guardian-restriction-check (UTC-based)
   * - At digest_time TZ -> digest-notifications (to notifications queue)
   */
  private async dispatchDaily(): Promise<void> {
    this.logger.log('Starting daily cron dispatch — scanning active behaviour tenants');

    const tenants = await this.getActiveBehaviourTenants();
    const now = new Date();
    const currentUtcHour = now.getUTCHours();

    let enqueued = 0;

    for (const tenant of tenants) {
      try {
        const tenantHour = this.getCurrentHourInTimezone(now, tenant.timezone);

        // Timezone-based jobs
        if (tenantHour === 7) {
          await this.behaviourQueue.add(
            BEHAVIOUR_SUSPENSION_RETURN_JOB,
            { tenant_id: tenant.id },
            { jobId: `daily:${BEHAVIOUR_SUSPENSION_RETURN_JOB}:${tenant.id}` },
          );
          enqueued++;
        }

        if (tenantHour === 8) {
          await this.behaviourQueue.add(
            BEHAVIOUR_TASK_REMINDERS_JOB,
            { tenant_id: tenant.id },
            { jobId: `daily:${BEHAVIOUR_TASK_REMINDERS_JOB}:${tenant.id}` },
          );
          enqueued++;
        }

        // UTC-based jobs (only enqueue once per UTC hour, regardless of tenant TZ)
        if (currentUtcHour === 5) {
          await this.behaviourQueue.add(
            BEHAVIOUR_DETECT_PATTERNS_JOB,
            { tenant_id: tenant.id },
            { jobId: `daily:${BEHAVIOUR_DETECT_PATTERNS_JOB}:${tenant.id}` },
          );
          enqueued++;
        }

        if (currentUtcHour === 6) {
          await this.behaviourQueue.add(
            BEHAVIOUR_GUARDIAN_RESTRICTION_CHECK_JOB,
            { tenant_id: tenant.id },
            { jobId: `daily:${BEHAVIOUR_GUARDIAN_RESTRICTION_CHECK_JOB}:${tenant.id}` },
          );
          enqueued++;
        }

        // Digest notifications — at tenant-configured digest time (default 16:00)
        const digestHour = await this.getDigestHour(tenant.id);
        if (tenantHour === digestHour) {
          await this.notificationsQueue.add(
            BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB,
            { tenant_id: tenant.id },
            { jobId: `daily:${BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB}:${tenant.id}` },
          );
          enqueued++;
        }
      } catch (err: unknown) {
        this.logger.error(
          `Daily dispatch failed for tenant ${tenant.id}: ${String(err)}`,
        );
        // Continue processing other tenants
      }
    }

    this.logger.log(
      `Daily cron dispatch complete: ${enqueued} job(s) enqueued across ${tenants.length} tenant(s)`,
    );
  }

  // ─── SLA dispatch ────────────────────────────────────────────────────────

  /**
   * Runs every 5 minutes. Enqueues safeguarding SLA checks for all active
   * behaviour tenants.
   */
  private async dispatchSla(): Promise<void> {
    this.logger.log('Starting SLA cron dispatch — scanning active behaviour tenants');

    const tenants = await this.getActiveBehaviourTenants();
    let enqueued = 0;

    for (const tenant of tenants) {
      try {
        await this.behaviourQueue.add(
          SLA_CHECK_JOB,
          { tenant_id: tenant.id },
        );
        enqueued++;
      } catch (err: unknown) {
        this.logger.error(
          `SLA dispatch failed for tenant ${tenant.id}: ${String(err)}`,
        );
      }
    }

    this.logger.log(
      `SLA cron dispatch complete: ${enqueued} job(s) enqueued across ${tenants.length} tenant(s)`,
    );
  }

  // ─── Monthly dispatch ────────────────────────────────────────────────────

  /**
   * Runs monthly on the 1st. Enqueues retention checks for all active
   * behaviour tenants.
   */
  private async dispatchMonthly(): Promise<void> {
    this.logger.log('Starting monthly cron dispatch — scanning active behaviour tenants');

    const tenants = await this.getActiveBehaviourTenants();
    let enqueued = 0;

    for (const tenant of tenants) {
      try {
        await this.behaviourQueue.add(
          BEHAVIOUR_RETENTION_CHECK_JOB,
          { tenant_id: tenant.id },
        );
        enqueued++;
      } catch (err: unknown) {
        this.logger.error(
          `Monthly dispatch failed for tenant ${tenant.id}: ${String(err)}`,
        );
      }
    }

    this.logger.log(
      `Monthly cron dispatch complete: ${enqueued} job(s) enqueued across ${tenants.length} tenant(s)`,
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Query all active tenants that have the behaviour module enabled.
   * Cross-tenant query — no RLS context set (system-level read).
   */
  private async getActiveBehaviourTenants(): Promise<ActiveBehaviourTenant[]> {
    const tenants = await this.prisma.tenant.findMany({
      where: {
        status: 'active',
        modules: {
          some: {
            module_key: 'behaviour',
            is_enabled: true,
          },
        },
      },
      select: {
        id: true,
        timezone: true,
      },
    });

    return tenants;
  }

  /**
   * Get the current hour (0-23) in a tenant's timezone.
   * Falls back to UTC if the timezone is invalid.
   */
  private getCurrentHourInTimezone(now: Date, timezone: string): number {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const hourPart = parts.find((p) => p.type === 'hour');
      return hourPart ? parseInt(hourPart.value, 10) : now.getUTCHours();
    } catch {
      this.logger.warn(
        `Invalid timezone "${timezone}" — falling back to UTC`,
      );
      return now.getUTCHours();
    }
  }

  /**
   * Read the tenant's configured digest notification hour from behaviour settings.
   * Defaults to 16 (4:00 PM) if not configured.
   */
  private async getDigestHour(tenantId: string): Promise<number> {
    const DEFAULT_DIGEST_HOUR = 16;

    try {
      const tenantSettings = await this.prisma.tenantSetting.findFirst({
        where: { tenant_id: tenantId },
        select: { settings: true },
      });

      const rawSettings = (tenantSettings?.settings as Record<string, unknown>) ?? {};
      const behaviourRaw = (rawSettings.behaviour as Record<string, unknown>) ?? {};
      const settings = behaviourSettingsSchema.parse(behaviourRaw);

      const digestTime = settings.parent_notification_digest_time;
      if (!digestTime) return DEFAULT_DIGEST_HOUR;

      // Parse "HH:MM" format — extract the hour
      const hourStr = digestTime.split(':')[0];
      if (!hourStr) return DEFAULT_DIGEST_HOUR;

      const hour = parseInt(hourStr, 10);
      return isNaN(hour) || hour < 0 || hour > 23 ? DEFAULT_DIGEST_HOUR : hour;
    } catch {
      return DEFAULT_DIGEST_HOUR;
    }
  }
}
