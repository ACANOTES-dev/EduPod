import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { EARLY_WARNING_COMPUTE_STUDENT_JOB } from '@school/shared';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';
import { DISPATCH_NOTIFICATIONS_JOB } from '../communications/dispatch-notifications.processor';

import { buildEscalationJobId, ESCALATION_TIMEOUT_JOB } from './escalation-timeout.processor';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface NotifyConcernPayload extends TenantJobPayload {
  concern_id: string;
  severity: 'routine' | 'elevated' | 'urgent' | 'critical';
  student_id: string;
  student_name: string;
  category: string;
  logged_by_user_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const NOTIFY_CONCERN_JOB = 'pastoral:notify-concern';

// ─── Severity channel map ────────────────────────────────────────────────────

type NotificationChannelKey = 'in_app' | 'email' | 'whatsapp';

const SEVERITY_CHANNELS: Record<string, NotificationChannelKey[]> = {
  routine: ['in_app'],
  elevated: ['in_app', 'email'],
  urgent: ['in_app', 'email'],
  critical: ['in_app', 'email', 'whatsapp'],
};

// ─── Default fallback roles per severity ─────────────────────────────────────

const DEFAULT_FALLBACK_ROLES: Record<string, string[]> = {
  routine: [],
  elevated: ['year_head', 'pastoral_coordinator'],
  urgent: ['dlp', 'deputy_principal'],
  critical: ['dlp', 'principal'],
};

// ─── Default escalation timeouts ─────────────────────────────────────────────

const DEFAULT_URGENT_TIMEOUT_MINUTES = 120;
const DEFAULT_CRITICAL_TIMEOUT_MINUTES = 30;

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PASTORAL)
export class NotifyConcernProcessor extends WorkerHost {
  private readonly logger = new Logger(NotifyConcernProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.EARLY_WARNING)
    private readonly earlyWarningQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
    private readonly notificationsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PASTORAL)
    private readonly pastoralQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<NotifyConcernPayload>): Promise<void> {
    if (job.name !== NOTIFY_CONCERN_JOB) {
      return;
    }

    const { tenant_id, concern_id, severity } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${NOTIFY_CONCERN_JOB} — concern ${concern_id}, severity ${severity}`,
    );

    const tenantJob = new NotifyConcernTenantJob(this.prisma);
    await tenantJob.execute(job.data);

    // Enqueue external notification dispatch OUTSIDE the Prisma transaction
    const externalNotifIds = tenantJob.externalNotificationIds;
    if (externalNotifIds.length > 0) {
      await this.notificationsQueue.add(
        DISPATCH_NOTIFICATIONS_JOB,
        { tenant_id, notification_ids: externalNotifIds },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );

      this.logger.log(
        `Enqueued dispatch for ${externalNotifIds.length} external notification(s) — concern ${concern_id}`,
      );
    }

    // Enqueue delayed escalation timeout job for urgent/critical concerns
    const escalationJob = tenantJob.escalationJobToEnqueue;
    if (escalationJob) {
      const jobId = buildEscalationJobId(tenant_id, concern_id, escalationJob.escalation_type);

      await this.pastoralQueue.add(
        ESCALATION_TIMEOUT_JOB,
        {
          tenant_id,
          concern_id,
          escalation_type: escalationJob.escalation_type,
          original_severity: severity,
          enqueued_at: new Date().toISOString(),
        },
        {
          delay: escalationJob.delay_ms,
          jobId,
        },
      );

      this.logger.log(
        `Enqueued escalation timeout ${escalationJob.escalation_type} for concern ${concern_id} ` +
          `with ${escalationJob.delay_ms / 60_000}-minute delay (jobId: ${jobId})`,
      );
    }

    // ── Early warning intraday trigger for critical concerns ──────────────
    if (job.data.severity === 'critical' && job.data.student_id) {
      await this.earlyWarningQueue.add(
        EARLY_WARNING_COMPUTE_STUDENT_JOB,
        {
          tenant_id: job.data.tenant_id,
          student_id: job.data.student_id,
          trigger_event: 'critical_incident',
        },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
      this.logger.log(
        `Enqueued early warning recompute for student ${job.data.student_id} (trigger: critical_incident)`,
      );
    }
  }
}

// ─── Escalation job shape ────────────────────────────────────────────────────

interface EscalationJobConfig {
  escalation_type: 'urgent_to_critical' | 'critical_second_round';
  delay_ms: number;
}

// ─── Recipient config shape ──────────────────────────────────────────────────

interface SeverityRecipientConfig {
  user_ids: string[];
  fallback_roles: string[];
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class NotifyConcernTenantJob extends TenantAwareJob<NotifyConcernPayload> {
  private readonly logger = new Logger(NotifyConcernTenantJob.name);

  /**
   * IDs of non-in_app notifications created, for external dispatch enqueue.
   * Read AFTER execute() returns.
   */
  public externalNotificationIds: string[] = [];

  /**
   * Escalation job config to enqueue, if applicable.
   * Read AFTER execute() returns.
   */
  public escalationJobToEnqueue: EscalationJobConfig | null = null;

  protected async processJob(data: NotifyConcernPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, concern_id, student_name, category, logged_by_user_id } = data;

    // 1. Verify concern still exists and severity has not changed
    const concern = await tx.pastoralConcern.findFirst({
      where: { id: concern_id, tenant_id },
      select: { id: true, severity: true, student_id: true },
    });

    if (!concern) {
      this.logger.warn(
        `Concern ${concern_id} not found for tenant ${tenant_id} — skipping notification`,
      );
      return;
    }

    // Use the current DB severity (may have changed since job was enqueued)
    const effectiveSeverity = concern.severity as NotifyConcernPayload['severity'];

    // 2. Load tenant settings for recipient resolution and escalation config
    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });

    const rawSettings = tenantSettings?.settings;

    // 3. Resolve recipients
    const recipients = await this.resolveRecipients(
      tx,
      tenant_id,
      effectiveSeverity,
      concern.student_id,
      logged_by_user_id,
      rawSettings,
    );

    if (recipients.length === 0 && effectiveSeverity !== 'routine') {
      this.logger.warn(
        `No recipients resolved for ${effectiveSeverity} concern ${concern_id} — ` +
          `check tenant pastoral notification settings`,
      );
    }

    // 4. Determine channels based on severity
    const channels = SEVERITY_CHANNELS[effectiveSeverity] ?? ['in_app'];

    // 5. Create notification records
    const now = new Date();
    const notificationPayload: Prisma.InputJsonValue = {
      concern_id,
      category,
      severity: effectiveSeverity,
      student_name,
    };

    if (effectiveSeverity === 'routine') {
      // Routine: in-app only for Tier 1 viewers.
      // For routine concerns, recipients may be empty (in-app list is broad).
      // Still create notifications for any resolved recipients.
      for (const userId of recipients) {
        await tx.notification.create({
          data: {
            tenant_id,
            recipient_user_id: userId,
            channel: 'in_app',
            template_key: 'pastoral.concern_routine',
            locale: 'en',
            status: 'delivered',
            payload_json: notificationPayload,
            source_entity_type: 'pastoral_concern',
            source_entity_id: concern_id,
            delivered_at: now,
          },
        });
      }

      this.logger.log(
        `Created ${recipients.length} in-app notification(s) for routine concern ${concern_id}`,
      );
    } else {
      // Elevated, urgent, critical: multi-channel
      const templateKey =
        effectiveSeverity === 'elevated'
          ? 'pastoral.concern_elevated'
          : effectiveSeverity === 'urgent'
            ? 'pastoral.concern_urgent'
            : 'pastoral.concern_critical';

      for (const userId of recipients) {
        for (const channel of channels) {
          const isInApp = channel === 'in_app';

          // For urgent/critical, in_app notifications get priority flag for PWA push
          const enrichedPayload =
            isInApp && (effectiveSeverity === 'urgent' || effectiveSeverity === 'critical')
              ? {
                  ...(notificationPayload as Record<string, unknown>),
                  priority: 'high',
                }
              : notificationPayload;

          const notification = await tx.notification.create({
            data: {
              tenant_id,
              recipient_user_id: userId,
              channel,
              template_key: templateKey,
              locale: 'en',
              status: isInApp ? 'delivered' : 'queued',
              payload_json: enrichedPayload as Prisma.InputJsonValue,
              source_entity_type: 'pastoral_concern',
              source_entity_id: concern_id,
              delivered_at: isInApp ? now : undefined,
            },
          });

          if (!isInApp) {
            this.externalNotificationIds.push(notification.id);
          }
        }
      }

      this.logger.log(
        `Created ${recipients.length * channels.length} notification(s) for ` +
          `${effectiveSeverity} concern ${concern_id} (${channels.length} channel(s), ${recipients.length} recipient(s))`,
      );
    }

    // 6. Determine escalation timeout for urgent/critical
    if (effectiveSeverity === 'urgent' || effectiveSeverity === 'critical') {
      const escalationConfig = this.extractEscalationConfig(rawSettings);

      if (effectiveSeverity === 'urgent') {
        this.escalationJobToEnqueue = {
          escalation_type: 'urgent_to_critical',
          delay_ms: escalationConfig.urgent_timeout_minutes * 60 * 1000,
        };
      } else {
        this.escalationJobToEnqueue = {
          escalation_type: 'critical_second_round',
          delay_ms: escalationConfig.critical_timeout_minutes * 60 * 1000,
        };
      }
    }
  }

  // ─── Recipient resolution ──────────────────────────────────────────────

  /**
   * Resolves notification recipient user IDs based on severity and tenant settings.
   * 1. Check for explicit user_ids in tenant_settings.pastoral.notification_recipients[severity]
   * 2. If empty, fall back to role-based resolution
   * 3. Deduplicate and exclude the logged_by_user_id
   */
  private async resolveRecipients(
    tx: PrismaClient,
    tenantId: string,
    severity: string,
    studentId: string,
    excludeUserId: string,
    rawSettings: unknown,
  ): Promise<string[]> {
    const config = this.extractRecipientConfig(rawSettings, severity);
    let userIds: string[] = [];

    if (config.user_ids.length > 0) {
      userIds = [...config.user_ids];
    } else if (config.fallback_roles.length > 0) {
      userIds = await this.resolveRecipientsByRoles(
        tx,
        tenantId,
        config.fallback_roles,
        rawSettings,
        studentId,
      );
    }

    // Deduplicate and exclude the concern author
    const unique = [...new Set(userIds)].filter((id) => id !== excludeUserId);
    return unique;
  }

  /**
   * Extract recipient config for a given severity from tenant settings.
   */
  private extractRecipientConfig(rawSettings: unknown, severity: string): SeverityRecipientConfig {
    const settings = (rawSettings as Record<string, unknown>) ?? {};
    const pastoral = (settings?.pastoral as Record<string, unknown>) ?? {};
    const notifRecipients = (pastoral?.notification_recipients as Record<string, unknown>) ?? {};
    const severityConfig = (notifRecipients?.[severity] as Record<string, unknown>) ?? {};

    const userIds = Array.isArray(severityConfig?.user_ids)
      ? (severityConfig.user_ids as string[]).filter((id): id is string => typeof id === 'string')
      : [];

    const fallbackRoles = Array.isArray(severityConfig?.fallback_roles)
      ? (severityConfig.fallback_roles as string[]).filter(
          (r): r is string => typeof r === 'string',
        )
      : (DEFAULT_FALLBACK_ROLES[severity] ?? []);

    return { user_ids: userIds, fallback_roles: fallbackRoles };
  }

  /**
   * Resolve user IDs from role keys.
   * Special role keys:
   * - 'dlp' -> cpAccessGrant (users with active CP access)
   * - 'deputy_dlp' -> tenant_settings.pastoral.deputy_designated_liaison_user_id
   * - 'year_head' -> resolve from student's year group assignment
   * - Others -> resolve via MembershipRole -> TenantMembership -> user_id
   */
  private async resolveRecipientsByRoles(
    tx: PrismaClient,
    tenantId: string,
    roleKeys: string[],
    rawSettings: unknown,
    studentId: string,
  ): Promise<string[]> {
    const settings = (rawSettings as Record<string, unknown>) ?? {};
    const pastoral = (settings?.pastoral as Record<string, unknown>) ?? {};
    const userIds: string[] = [];

    for (const roleKey of roleKeys) {
      if (roleKey === 'dlp') {
        // DLP users are those with active (non-revoked) CP access grants
        const grants = await tx.cpAccessGrant.findMany({
          where: { tenant_id: tenantId, revoked_at: null },
          select: { user_id: true },
        });
        for (const g of grants) {
          userIds.push(g.user_id);
        }
      } else if (roleKey === 'deputy_dlp') {
        const deputyDlpId =
          typeof pastoral?.deputy_designated_liaison_user_id === 'string'
            ? pastoral.deputy_designated_liaison_user_id
            : null;
        if (deputyDlpId) userIds.push(deputyDlpId);
      } else if (roleKey === 'year_head') {
        // Resolve year head: verify student has a year group, then resolve
        // users with year_head role in this tenant (same as API service pattern)
        const yearHeadIds = await this.resolveYearHeadForStudent(tx, tenantId, studentId);
        for (const id of yearHeadIds) {
          userIds.push(id);
        }
      } else {
        // Resolve from Role -> MembershipRole -> TenantMembership -> user_id
        const memberships = await tx.membershipRole.findMany({
          where: {
            tenant_id: tenantId,
            role: { role_key: roleKey },
            membership: { membership_status: 'active' },
          },
          select: {
            membership: { select: { user_id: true } },
          },
        });

        for (const mr of memberships) {
          userIds.push(mr.membership.user_id);
        }
      }
    }

    return userIds;
  }

  /**
   * Resolve year head user IDs for a student's year group.
   * First verifies the student has a year_group_id, then finds users
   * with the 'year_head' role in this tenant (generic role resolution).
   * A more granular year-group-specific assignment can be added later.
   */
  private async resolveYearHeadForStudent(
    tx: PrismaClient,
    tenantId: string,
    studentId: string,
  ): Promise<string[]> {
    // Verify student has a year group assignment
    const student = await tx.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { year_group_id: true },
    });

    if (!student?.year_group_id) {
      return [];
    }

    // Resolve users with year_head role in this tenant
    const memberships = await tx.membershipRole.findMany({
      where: {
        tenant_id: tenantId,
        role: { role_key: 'year_head' },
        membership: { membership_status: 'active' },
      },
      select: {
        membership: { select: { user_id: true } },
      },
    });

    return memberships.map((mr) => mr.membership.user_id);
  }

  // ─── Escalation config extraction ──────────────────────────────────────

  /**
   * Extract escalation timeout configuration from tenant settings.
   */
  private extractEscalationConfig(rawSettings: unknown): {
    urgent_timeout_minutes: number;
    critical_timeout_minutes: number;
  } {
    const settings = (rawSettings as Record<string, unknown>) ?? {};
    const pastoral = (settings?.pastoral as Record<string, unknown>) ?? {};
    const escalation = (pastoral?.escalation as Record<string, unknown>) ?? {};

    return {
      urgent_timeout_minutes:
        typeof escalation?.urgent_timeout_minutes === 'number'
          ? escalation.urgent_timeout_minutes
          : DEFAULT_URGENT_TIMEOUT_MINUTES,
      critical_timeout_minutes:
        typeof escalation?.critical_timeout_minutes === 'number'
          ? escalation.critical_timeout_minutes
          : DEFAULT_CRITICAL_TIMEOUT_MINUTES,
    };
  }
}
