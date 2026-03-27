import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job, Queue } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import {
  SYSTEM_USER_SENTINEL,
  TenantAwareJob,
  TenantJobPayload,
} from '../../base/tenant-aware-job';
import { DISPATCH_NOTIFICATIONS_JOB } from '../communications/dispatch-notifications.processor';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface EscalationTimeoutPayload extends TenantJobPayload {
  concern_id: string;
  escalation_type: 'urgent_to_critical' | 'critical_second_round';
  original_severity: 'urgent' | 'critical';
  enqueued_at: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const ESCALATION_TIMEOUT_JOB = 'pastoral:escalation-timeout';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Default timeout in minutes for urgent escalation if tenant settings are missing */
const DEFAULT_URGENT_TIMEOUT_MINUTES = 120;

/** Default timeout in minutes for critical escalation if tenant settings are missing */
const DEFAULT_CRITICAL_TIMEOUT_MINUTES = 30;

/** Build deterministic job ID for escalation timeout (allows cancellation) */
export function buildEscalationJobId(
  tenantId: string,
  concernId: string,
  escalationType: 'urgent_to_critical' | 'critical_second_round',
): string {
  return `pastoral:escalation:${tenantId}:${concernId}:${escalationType}`;
}

// ─── Pastoral settings extraction ────────────────────────────────────────────

interface PastoralEscalationSettings {
  escalation_enabled: boolean;
  urgent_timeout_minutes: number;
  critical_timeout_minutes: number;
  escalation_urgent_recipients: string[];
  escalation_critical_recipients: string[];
}

function extractPastoralSettings(
  settingsJson: unknown,
): PastoralEscalationSettings {
  const settings = (settingsJson as Record<string, unknown>) ?? {};
  const pastoral = (settings?.pastoral as Record<string, unknown>) ?? {};
  const escalation = (pastoral?.escalation as Record<string, unknown>) ?? {};

  // Master switch — default to true if not explicitly set
  const escalationEnabled =
    typeof escalation?.enabled === 'boolean'
      ? escalation.enabled
      : true;

  const urgentTimeoutMinutes =
    typeof escalation?.urgent_timeout_minutes === 'number'
      ? escalation.urgent_timeout_minutes
      : DEFAULT_URGENT_TIMEOUT_MINUTES;

  const criticalTimeoutMinutes =
    typeof escalation?.critical_timeout_minutes === 'number'
      ? escalation.critical_timeout_minutes
      : DEFAULT_CRITICAL_TIMEOUT_MINUTES;

  // Override recipient lists — empty array means use defaults
  const urgentRecipients = Array.isArray(escalation?.urgent_recipients)
    ? (escalation.urgent_recipients as string[]).filter(
        (id): id is string => typeof id === 'string',
      )
    : [];

  const criticalRecipients = Array.isArray(escalation?.critical_recipients)
    ? (escalation.critical_recipients as string[]).filter(
        (id): id is string => typeof id === 'string',
      )
    : [];

  return {
    escalation_enabled: escalationEnabled,
    urgent_timeout_minutes: urgentTimeoutMinutes,
    critical_timeout_minutes: criticalTimeoutMinutes,
    escalation_urgent_recipients: urgentRecipients,
    escalation_critical_recipients: criticalRecipients,
  };
}

// ─── Recipient resolution for critical notifications ─────────────────────────

interface CriticalRecipientConfig {
  user_ids: string[];
  fallback_roles: string[];
}

function extractCriticalRecipients(
  settingsJson: unknown,
  overrideRecipients: string[],
): CriticalRecipientConfig {
  // If tenant has configured override recipients, use them directly
  if (overrideRecipients.length > 0) {
    return { user_ids: overrideRecipients, fallback_roles: [] };
  }

  // Fall back to notification_recipients.critical from tenant settings
  const settings = (settingsJson as Record<string, unknown>) ?? {};
  const pastoral = (settings?.pastoral as Record<string, unknown>) ?? {};
  const notifRecipients =
    (pastoral?.notification_recipients as Record<string, unknown>) ?? {};
  const criticalConfig =
    (notifRecipients?.critical as Record<string, unknown>) ?? {};

  const userIds = Array.isArray(criticalConfig?.user_ids)
    ? (criticalConfig.user_ids as string[]).filter(
        (id): id is string => typeof id === 'string',
      )
    : [];

  const fallbackRoles = Array.isArray(criticalConfig?.fallback_roles)
    ? (criticalConfig.fallback_roles as string[]).filter(
        (r): r is string => typeof r === 'string',
      )
    : ['dlp', 'principal'];

  return { user_ids: userIds, fallback_roles: fallbackRoles };
}

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PASTORAL)
export class EscalationTimeoutProcessor extends WorkerHost {
  private readonly logger = new Logger(EscalationTimeoutProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @InjectQueue(QUEUE_NAMES.PASTORAL)
    private readonly pastoralQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
    private readonly notificationsQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<EscalationTimeoutPayload>): Promise<void> {
    if (job.name !== ESCALATION_TIMEOUT_JOB) {
      return;
    }

    const { tenant_id, concern_id, escalation_type } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${ESCALATION_TIMEOUT_JOB} — concern ${concern_id}, type ${escalation_type}`,
    );

    const tenantJob = new EscalationTimeoutTenantJob(this.prisma);
    await tenantJob.execute(job.data);

    // Re-enqueue next escalation step OUTSIDE the Prisma transaction.
    // Only urgent_to_critical triggers a follow-up (critical_second_round).
    // critical_second_round terminates the chain — no further escalation.
    const followUp = tenantJob.followUpJob;
    if (followUp) {
      const jobId = buildEscalationJobId(
        tenant_id,
        concern_id,
        followUp.escalation_type,
      );

      await this.pastoralQueue.add(
        ESCALATION_TIMEOUT_JOB,
        followUp,
        {
          delay: followUp.delay_ms,
          jobId,
        },
      );

      this.logger.log(
        `Enqueued follow-up escalation ${followUp.escalation_type} for concern ${concern_id} ` +
          `with ${followUp.delay_ms / 60_000}-minute delay (jobId: ${jobId})`,
      );
    }

    // Dispatch external notification delivery for any notifications created
    const notificationIds = tenantJob.createdNotificationIds;
    if (notificationIds.length > 0) {
      await this.notificationsQueue.add(
        DISPATCH_NOTIFICATIONS_JOB,
        { tenant_id, notification_ids: notificationIds },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );

      this.logger.log(
        `Enqueued dispatch for ${notificationIds.length} notification(s) — concern ${concern_id}`,
      );
    }
  }
}

// ─── Follow-up job shape ─────────────────────────────────────────────────────

interface FollowUpJob extends EscalationTimeoutPayload {
  delay_ms: number;
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class EscalationTimeoutTenantJob extends TenantAwareJob<EscalationTimeoutPayload> {
  private readonly logger = new Logger(EscalationTimeoutTenantJob.name);

  /**
   * Set by processJob when a subsequent escalation job should be enqueued.
   * Read AFTER execute() returns so re-enqueue happens outside the transaction.
   */
  public followUpJob: FollowUpJob | null = null;

  /**
   * Notification IDs created during processing, for dispatch enqueue.
   */
  public createdNotificationIds: string[] = [];

  protected async processJob(
    data: EscalationTimeoutPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, concern_id, escalation_type } = data;

    // 1. Load tenant settings first to check escalation_enabled
    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });

    const pastoralSettings = extractPastoralSettings(tenantSettings?.settings);

    // 2. If escalation is disabled for this tenant, no-op
    if (!pastoralSettings.escalation_enabled) {
      this.logger.log(
        `Escalation disabled for tenant ${tenant_id} — skipping concern ${concern_id}`,
      );
      return;
    }

    // 3. Load the concern
    const concern = await tx.pastoralConcern.findFirst({
      where: { id: concern_id, tenant_id },
      include: {
        student: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    if (!concern) {
      this.logger.warn(
        `Concern ${concern_id} not found for tenant ${tenant_id} — skipping`,
      );
      return;
    }

    // 4. If acknowledged, terminate escalation
    if (concern.acknowledged_at !== null) {
      this.logger.log(
        `Escalation cancelled — concern ${concern_id} was acknowledged at ${concern.acknowledged_at.toISOString()}`,
      );
      return;
    }

    if (escalation_type === 'urgent_to_critical') {
      await this.handleUrgentToCritical(tx, data, concern, pastoralSettings, tenantSettings?.settings);
    } else if (escalation_type === 'critical_second_round') {
      await this.handleCriticalSecondRound(tx, data, concern, pastoralSettings, tenantSettings?.settings);
    }
  }

  /**
   * Urgent -> Critical auto-escalation:
   * - Update concern severity to critical
   * - Write pastoral_event: concern_auto_escalated
   * - Create critical-level notifications
   * - Signal follow-up job for critical_second_round
   */
  private async handleUrgentToCritical(
    tx: PrismaClient,
    data: EscalationTimeoutPayload,
    concern: {
      id: string;
      severity: string;
      category: string;
      created_at: Date;
      student_id: string;
      logged_by_user_id: string;
      student: { id: string; first_name: string; last_name: string };
    },
    pastoralSettings: PastoralEscalationSettings,
    rawSettings: unknown,
  ): Promise<void> {
    const { tenant_id, concern_id } = data;
    const now = new Date();
    const timeoutMinutes = Math.round(
      (now.getTime() - new Date(data.enqueued_at).getTime()) / 60_000,
    );

    // a. Update concern severity to critical
    await tx.pastoralConcern.update({
      where: { id: concern_id },
      data: { severity: 'critical' },
    });

    // b. Write pastoral_event: concern_auto_escalated
    await tx.pastoralEvent.create({
      data: {
        tenant_id,
        event_type: 'concern_auto_escalated',
        entity_type: 'concern',
        entity_id: concern_id,
        student_id: concern.student_id,
        actor_user_id: SYSTEM_USER_SENTINEL,
        tier: 3,
        payload: {
          concern_id,
          old_severity: 'urgent',
          new_severity: 'critical',
          reason: 'unacknowledged_timeout',
          timeout_minutes: timeoutMinutes,
        } satisfies Prisma.InputJsonValue as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Auto-escalated concern ${concern_id} from urgent to critical after ${timeoutMinutes} minutes`,
    );

    // c. Resolve critical-level recipients and create notifications
    // Use configured override recipients if provided, otherwise fall back to defaults
    const recipients = await this.resolveCriticalRecipients(
      tx,
      tenant_id,
      rawSettings,
      concern.logged_by_user_id,
      pastoralSettings.escalation_critical_recipients,
    );

    const notificationPayload: Prisma.InputJsonValue = {
      concern_id,
      category: concern.category,
      severity: 'critical',
      student_name: `${concern.student.first_name} ${concern.student.last_name}`,
      escalated_from: 'urgent',
      reason: 'unacknowledged_timeout',
    };

    const notifIds = await this.createMultiChannelNotifications(
      tx,
      tenant_id,
      recipients,
      'pastoral.concern_escalated',
      notificationPayload,
      'pastoral_concern',
      concern_id,
      now,
      ['in_app', 'email', 'whatsapp'],
    );

    this.createdNotificationIds = notifIds;

    // d. Signal follow-up job for critical_second_round
    this.followUpJob = {
      tenant_id,
      concern_id,
      escalation_type: 'critical_second_round',
      original_severity: 'urgent',
      enqueued_at: now.toISOString(),
      delay_ms: pastoralSettings.critical_timeout_minutes * 60 * 1000,
    };
  }

  /**
   * Critical second round:
   * - Re-check acknowledgement (may have been acknowledged between first and second round)
   * - Write pastoral_event: critical_concern_unacknowledged
   * - Send second-round notifications to principal (or configured override recipients)
   * - Terminate chain (no further automatic escalation)
   */
  private async handleCriticalSecondRound(
    tx: PrismaClient,
    data: EscalationTimeoutPayload,
    concern: {
      id: string;
      severity: string;
      category: string;
      created_at: Date;
      student_id: string;
      logged_by_user_id: string;
      acknowledged_at: Date | null;
      student: { id: string; first_name: string; last_name: string };
    },
    pastoralSettings: PastoralEscalationSettings,
    rawSettings: unknown,
  ): Promise<void> {
    const { tenant_id, concern_id } = data;
    const now = new Date();

    // Re-check acknowledgement — may have been acknowledged between rounds
    if (concern.acknowledged_at !== null) {
      this.logger.log(
        `Second-round escalation cancelled — concern ${concern_id} was acknowledged between rounds`,
      );
      return;
    }

    const minutesElapsed = Math.round(
      (now.getTime() - concern.created_at.getTime()) / 60_000,
    );

    // a. Write pastoral_event: critical_concern_unacknowledged
    await tx.pastoralEvent.create({
      data: {
        tenant_id,
        event_type: 'critical_concern_unacknowledged',
        entity_type: 'concern',
        entity_id: concern_id,
        student_id: concern.student_id,
        actor_user_id: SYSTEM_USER_SENTINEL,
        tier: 3,
        payload: {
          concern_id,
          severity: 'critical',
          minutes_elapsed: minutesElapsed,
          notification_round: 2,
        } satisfies Prisma.InputJsonValue as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Critical concern ${concern_id} unacknowledged after ${minutesElapsed} minutes — second-round notification`,
    );

    // b. Resolve recipients for second-round notification
    // Use configured critical override recipients if provided, otherwise fall back to principal
    let recipients: string[];
    if (pastoralSettings.escalation_critical_recipients.length > 0) {
      recipients = [...new Set(pastoralSettings.escalation_critical_recipients)];
    } else {
      recipients = await this.resolvePrincipalRecipient(
        tx,
        tenant_id,
        rawSettings,
      );
    }

    if (recipients.length === 0) {
      this.logger.warn(
        `No principal recipient found for second-round notification — concern ${concern_id}`,
      );
      return;
    }

    const notificationPayload: Prisma.InputJsonValue = {
      concern_id,
      category: concern.category,
      severity: 'critical',
      student_name: `${concern.student.first_name} ${concern.student.last_name}`,
      notification_round: 2,
      minutes_elapsed: minutesElapsed,
    };

    // c. Create second-round notifications (all channels for critical)
    const notifIds = await this.createMultiChannelNotifications(
      tx,
      tenant_id,
      recipients,
      'pastoral.critical_unacknowledged',
      notificationPayload,
      'pastoral_concern',
      concern_id,
      now,
      ['in_app', 'email', 'whatsapp'],
    );

    this.createdNotificationIds = notifIds;

    // d. Chain terminates — no followUpJob set
  }

  // ─── Recipient resolution helpers ────────────────────────────────────────

  /**
   * Resolve critical-level recipients from tenant settings.
   * If escalation override recipients are configured, use those first.
   * Otherwise, if explicit user_ids are configured in notification_recipients, use those.
   * Otherwise, fall back to role-based resolution (dlp + principal).
   * Excludes the concern author from the recipient list.
   */
  private async resolveCriticalRecipients(
    tx: PrismaClient,
    tenantId: string,
    rawSettings: unknown,
    excludeUserId: string,
    overrideRecipients: string[],
  ): Promise<string[]> {
    const config = extractCriticalRecipients(rawSettings, overrideRecipients);
    let recipientIds: string[] = [];

    if (config.user_ids.length > 0) {
      recipientIds = [...config.user_ids];
    } else {
      recipientIds = await this.resolveRecipientsByRoles(
        tx,
        tenantId,
        config.fallback_roles,
        rawSettings,
      );
    }

    // Deduplicate and exclude the author
    const unique = [...new Set(recipientIds)].filter(
      (id) => id !== excludeUserId,
    );

    return unique;
  }

  /**
   * Resolve principal recipient for second-round critical notification.
   * If no principal found, fall back to DLP (re-notify the DLP per spec).
   */
  private async resolvePrincipalRecipient(
    tx: PrismaClient,
    tenantId: string,
    rawSettings: unknown,
  ): Promise<string[]> {
    // Try to find principal by role
    const principalUsers = await this.resolveRecipientsByRoles(
      tx,
      tenantId,
      ['principal'],
      rawSettings,
    );

    if (principalUsers.length > 0) {
      return principalUsers;
    }

    // If no principal found, fall back to DLP via cpAccessGrant
    return this.resolveRecipientsByRoles(tx, tenantId, ['dlp'], rawSettings);
  }

  /**
   * Resolve user IDs from role keys.
   * Special role keys:
   * - 'dlp' -> cpAccessGrant (users with active CP access)
   * - 'deputy_dlp' -> tenant_settings.pastoral.deputy_designated_liaison_user_id
   * Other role keys resolve via MembershipRole -> TenantMembership -> user_id.
   */
  private async resolveRecipientsByRoles(
    tx: PrismaClient,
    tenantId: string,
    roleKeys: string[],
    rawSettings: unknown,
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
        // Deputy DLP from pastoral settings
        const deputyDlpId =
          typeof pastoral?.deputy_designated_liaison_user_id === 'string'
            ? pastoral.deputy_designated_liaison_user_id
            : null;
        if (deputyDlpId) userIds.push(deputyDlpId);
      } else {
        // Resolve from Role -> MembershipRole -> TenantMembership
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

  // ─── Notification creation helper ────────────────────────────────────────

  /**
   * Create multi-channel notification records for a list of recipients.
   * Returns the IDs of non-in_app notifications (for dispatch enqueue).
   */
  private async createMultiChannelNotifications(
    tx: PrismaClient,
    tenantId: string,
    recipientUserIds: string[],
    templateKey: string,
    payloadJson: Prisma.InputJsonValue,
    sourceEntityType: string,
    sourceEntityId: string,
    now: Date,
    channels: Array<'in_app' | 'email' | 'whatsapp'>,
  ): Promise<string[]> {
    const externalNotifIds: string[] = [];

    for (const userId of recipientUserIds) {
      for (const channel of channels) {
        const isInApp = channel === 'in_app';

        // For urgent/critical, in_app notifications get priority flag for PWA push
        const enrichedPayload =
          isInApp && channels.includes('whatsapp')
            ? { ...(payloadJson as Record<string, unknown>), priority: 'high' }
            : payloadJson;

        const notification = await tx.notification.create({
          data: {
            tenant_id: tenantId,
            recipient_user_id: userId,
            channel,
            template_key: templateKey,
            locale: 'en',
            status: isInApp ? 'delivered' : 'queued',
            payload_json: enrichedPayload as Prisma.InputJsonValue,
            source_entity_type: sourceEntityType,
            source_entity_id: sourceEntityId,
            delivered_at: isInApp ? now : undefined,
          },
        });

        if (!isInApp) {
          externalNotifIds.push(notification.id);
        }
      }
    }

    this.logger.log(
      `Created ${recipientUserIds.length * channels.length} notification(s) ` +
        `across ${channels.length} channel(s) for ${recipientUserIds.length} recipient(s)`,
    );

    return externalNotifIds;
  }
}
