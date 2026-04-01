import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PastoralConcernSeverity } from '@prisma/client';
import { Queue } from 'bullmq';

import { pastoralTenantSettingsSchema } from '@school/shared';

import { NotificationsService } from '../../communications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Minimal concern shape required for notification dispatch. */
export interface PastoralConcernForNotification {
  id: string;
  tenant_id: string;
  student_id: string;
  logged_by_user_id: string;
  category: string;
  severity: PastoralConcernSeverity;
  tier: number;
  created_at: Date;
  student?: {
    first_name: string;
    last_name: string;
    year_group_id: string | null;
  } | null;
}

/** Channels to dispatch for each severity tier. */
interface SeverityChannelConfig {
  in_app: boolean;
  email: boolean;
  push: boolean;
  whatsapp: boolean;
}

/** Escalation type for delayed timeout jobs. */
type EscalationType = 'urgent_to_critical' | 'critical_second_round';

// ─── Constants ──────────────────────────────────────────────────────────────

const SEVERITY_CHANNELS: Record<PastoralConcernSeverity, SeverityChannelConfig> = {
  routine: { in_app: true, email: false, push: false, whatsapp: false },
  elevated: { in_app: true, email: true, push: false, whatsapp: false },
  urgent: { in_app: true, email: true, push: true, whatsapp: false },
  critical: { in_app: true, email: true, push: true, whatsapp: true },
};

/** Default fallback roles for each severity when no explicit recipients are configured. */
const DEFAULT_FALLBACK_ROLES: Record<PastoralConcernSeverity, string[]> = {
  routine: [],
  elevated: ['year_head', 'pastoral_coordinator'],
  urgent: ['dlp', 'deputy_principal'],
  critical: ['dlp', 'principal'],
};

/** Template keys by severity. */
const TEMPLATE_KEYS: Record<PastoralConcernSeverity, string> = {
  routine: 'pastoral.concern_routine',
  elevated: 'pastoral.concern_elevated',
  urgent: 'pastoral.concern_urgent',
  critical: 'pastoral.concern_critical',
};

const ESCALATION_TEMPLATE_KEY = 'pastoral.concern_escalated';
const SECOND_ROUND_TEMPLATE_KEY = 'pastoral.concern_second_round';

const PASTORAL_ESCALATION_JOB = 'pastoral:escalation-timeout';
const COMMUNICATIONS_DISPATCH_JOB = 'communications:dispatch-notifications';

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class PastoralNotificationService {
  private readonly logger = new Logger(PastoralNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
    @InjectQueue('pastoral') private readonly pastoralQueue: Queue,
  ) {}

  // ─── PUBLIC: Dispatch for New Concern ────────────────────────────────────

  /**
   * Main entry point. Called by ConcernService.create() after concern is persisted.
   * Determines severity tier, resolves recipients, sends via appropriate channels,
   * and enqueues escalation timeout jobs for urgent/critical concerns.
   */
  async dispatchForConcern(
    tenantId: string,
    concern: PastoralConcernForNotification,
    loggedByUserId: string,
  ): Promise<void> {
    try {
      const severity = concern.severity;
      const channels = SEVERITY_CHANNELS[severity];

      // Resolve recipients, excluding the author
      const recipientIds = await this.resolveRecipients(
        tenantId,
        severity,
        concern.student_id,
        loggedByUserId,
      );

      if (recipientIds.length === 0) {
        this.logger.warn(
          `No recipients resolved for concern ${concern.id} severity=${severity} — skipping notifications`,
        );
        return;
      }

      // Build notification payload variables
      const studentName = this.formatStudentName(concern);
      const templateKey = TEMPLATE_KEYS[severity];
      const payloadVariables = this.buildPayloadVariables(concern, studentName, severity);

      // Create notifications for each active channel
      await this.createNotificationsForChannels(
        tenantId,
        recipientIds,
        channels,
        templateKey,
        payloadVariables,
        concern.id,
      );

      // Enqueue dispatch jobs for external channels (email, whatsapp)
      if (channels.email || channels.whatsapp) {
        await this.enqueueDispatchJob(tenantId, concern.id, severity);
      }

      // Enqueue escalation timeout for urgent/critical
      const settings = await this.loadPastoralSettings(tenantId);
      if (severity === 'urgent') {
        const delayMinutes = settings.escalation.urgent_timeout_minutes;
        await this.enqueueEscalationTimeout(
          tenantId,
          concern.id,
          'urgent_to_critical',
          delayMinutes,
        );
      } else if (severity === 'critical') {
        const delayMinutes = settings.escalation.critical_timeout_minutes;
        await this.enqueueEscalationTimeout(
          tenantId,
          concern.id,
          'critical_second_round',
          delayMinutes,
        );
      }

      this.logger.log(
        `Dispatched ${severity} notifications for concern ${concern.id} to ${recipientIds.length} recipients`,
      );
    } catch (error: unknown) {
      // Notification dispatch is best-effort — log but do not propagate
      this.logger.error(
        `Failed to dispatch notifications for concern ${concern.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // ─── PUBLIC: Dispatch for Escalation (urgent -> critical) ─────────────

  /**
   * Called by the escalation timeout processor when an urgent concern
   * auto-escalates to critical due to non-acknowledgement.
   */
  async dispatchCriticalEscalation(
    tenantId: string,
    concern: PastoralConcernForNotification,
  ): Promise<void> {
    try {
      const recipientIds = await this.resolveRecipients(
        tenantId,
        'critical',
        concern.student_id,
        concern.logged_by_user_id,
      );

      if (recipientIds.length === 0) {
        this.logger.warn(
          `No recipients resolved for escalated concern ${concern.id} — skipping notifications`,
        );
        return;
      }

      const studentName = this.formatStudentName(concern);
      const settings = await this.loadPastoralSettings(tenantId);
      const payloadVariables = {
        ...this.buildPayloadVariables(concern, studentName, 'critical'),
        escalation_reason: `Not acknowledged within ${settings.escalation.urgent_timeout_minutes} minutes`,
      };

      // Critical channels: in_app + email + push + whatsapp
      const channels = SEVERITY_CHANNELS.critical;
      await this.createNotificationsForChannels(
        tenantId,
        recipientIds,
        channels,
        ESCALATION_TEMPLATE_KEY,
        payloadVariables,
        concern.id,
      );

      // Enqueue dispatch for external channels
      await this.enqueueDispatchJob(tenantId, concern.id, 'critical');

      // Enqueue second-round escalation timeout
      const criticalDelayMinutes = settings.escalation.critical_timeout_minutes;
      await this.enqueueEscalationTimeout(
        tenantId,
        concern.id,
        'critical_second_round',
        criticalDelayMinutes,
      );

      this.logger.log(
        `Dispatched critical escalation notifications for concern ${concern.id} to ${recipientIds.length} recipients`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to dispatch critical escalation notifications for concern ${concern.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // ─── PUBLIC: Dispatch Second-Round Critical ────────────────────────────

  /**
   * Called by the escalation timeout processor for a second round of critical
   * notifications when the concern remains unacknowledged.
   */
  async dispatchSecondRoundCritical(
    tenantId: string,
    concern: PastoralConcernForNotification,
  ): Promise<void> {
    try {
      // Second round targets the principal specifically
      const recipientIds = await this.resolveRecipients(
        tenantId,
        'critical',
        concern.student_id,
        concern.logged_by_user_id,
      );

      if (recipientIds.length === 0) {
        this.logger.warn(
          `No recipients resolved for second-round critical concern ${concern.id} — skipping`,
        );
        return;
      }

      const studentName = this.formatStudentName(concern);
      const minutesElapsed = Math.round((Date.now() - concern.created_at.getTime()) / 60_000);
      const payloadVariables = {
        ...this.buildPayloadVariables(concern, studentName, 'critical'),
        escalation_reason: `Critical concern unacknowledged for ${minutesElapsed} minutes`,
        notification_round: 2,
      };

      // Critical channels: in_app + email + push + whatsapp
      const channels = SEVERITY_CHANNELS.critical;
      await this.createNotificationsForChannels(
        tenantId,
        recipientIds,
        channels,
        SECOND_ROUND_TEMPLATE_KEY,
        payloadVariables,
        concern.id,
      );

      // Enqueue dispatch for external channels
      await this.enqueueDispatchJob(tenantId, concern.id, 'critical');

      // No further escalation — chain terminates after second round
      this.logger.log(
        `Dispatched second-round critical notifications for concern ${concern.id} to ${recipientIds.length} recipients`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to dispatch second-round critical notifications for concern ${concern.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // ─── PUBLIC: Cancel Escalation Timeout ──────────────────────────────────

  /**
   * Cancels all pending escalation timeout jobs for a concern.
   * Called when a concern is acknowledged (via ConcernService.getById).
   */
  async cancelEscalationTimeout(tenantId: string, concernId: string): Promise<void> {
    const escalationTypes: EscalationType[] = ['urgent_to_critical', 'critical_second_round'];

    for (const escalationType of escalationTypes) {
      try {
        const jobId = this.buildEscalationJobId(tenantId, concernId, escalationType);
        const job = await this.pastoralQueue.getJob(jobId);
        if (job) {
          await job.remove();
          this.logger.log(`Cancelled escalation job ${jobId} for concern ${concernId}`);
        }
      } catch (error: unknown) {
        // Best-effort cancellation — log but do not propagate
        this.logger.error(
          `Failed to cancel escalation job for concern ${concernId} type=${escalationType}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  // ─── PRIVATE: Recipient Resolution ─────────────────────────────────────

  /**
   * Resolves recipient user IDs for a given severity level.
   *
   * Algorithm:
   * 1. Read tenant_settings.pastoral.notification_recipients[severity]
   * 2. If explicit user IDs are configured, use them
   * 3. Otherwise, resolve from fallback roles
   * 4. Deduplicate
   * 5. Exclude the concern author (they don't need to be notified of their own action)
   */
  private async resolveRecipients(
    tenantId: string,
    severity: PastoralConcernSeverity,
    studentId: string,
    excludeUserId: string,
  ): Promise<string[]> {
    const settings = await this.loadPastoralSettings(tenantId);
    const recipientConfig = settings.notification_recipients;

    let explicitUserIds: string[] = [];

    // The existing schema stores urgent/critical as flat arrays of user IDs
    if (severity === 'urgent') {
      explicitUserIds = recipientConfig.urgent;
    } else if (severity === 'critical') {
      explicitUserIds = recipientConfig.critical;
    }
    // Routine and elevated don't have explicit IDs in the current schema

    let userIds: string[];

    if (explicitUserIds.length > 0) {
      userIds = explicitUserIds;
    } else {
      // Fall back to role-based resolution
      const fallbackRoles = DEFAULT_FALLBACK_ROLES[severity];
      userIds = await this.resolveUsersByRoles(tenantId, fallbackRoles, studentId);
    }

    // Deduplicate and exclude author
    const uniqueIds = [...new Set(userIds)];
    return uniqueIds.filter((id) => id !== excludeUserId);
  }

  /**
   * Resolves user IDs from role keys using the roles/membership system.
   * Handles special roles like 'dlp' (designated liaison person) which
   * are stored in CP access grants rather than the roles table.
   */
  private async resolveUsersByRoles(
    tenantId: string,
    roleKeys: string[],
    studentId: string,
  ): Promise<string[]> {
    const userIds: string[] = [];

    for (const roleKey of roleKeys) {
      const resolved = await this.resolveUsersForRole(tenantId, roleKey, studentId);
      userIds.push(...resolved);
    }

    return userIds;
  }

  /**
   * Resolves user IDs for a single role key.
   */
  private async resolveUsersForRole(
    tenantId: string,
    roleKey: string,
    studentId: string,
  ): Promise<string[]> {
    // Special pastoral settings roles
    if (roleKey === 'dlp') {
      return this.resolveDlpUsers(tenantId);
    }

    // Year head: resolve from student's year group
    if (roleKey === 'year_head') {
      return this.resolveYearHeadForStudent(tenantId, studentId);
    }

    // Generic role resolution: find users with matching role_key in this tenant
    return this.resolveUsersByRoleKey(tenantId, roleKey);
  }

  /**
   * Resolves the DLP (Designated Liaison Person) user IDs.
   * Reads from cp_access_grants (users with active CP access).
   */
  private async resolveDlpUsers(tenantId: string): Promise<string[]> {
    // DLP users are those with active (non-revoked) CP access grants
    const grants = await this.prisma.cpAccessGrant.findMany({
      where: {
        tenant_id: tenantId,
        revoked_at: null,
      },
      select: { user_id: true },
    });

    return grants.map((g) => g.user_id);
  }

  /**
   * Resolves the year head for a student's year group.
   * Looks up the student's year group, then finds users with the 'year_head'
   * role who are assigned to that year group (via role-based lookup).
   */
  private async resolveYearHeadForStudent(tenantId: string, studentId: string): Promise<string[]> {
    // Get the student's year group
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { year_group_id: true },
    });

    if (!student?.year_group_id) {
      return [];
    }

    // Fall back to finding any user with a 'year_head' role in this tenant
    // (a more granular year-group-specific assignment can be added later)
    return this.resolveUsersByRoleKey(tenantId, 'year_head');
  }

  /**
   * Resolves user IDs by looking up users who have a specific role_key
   * in this tenant via the roles -> membership_roles -> tenant_memberships chain.
   */
  private async resolveUsersByRoleKey(tenantId: string, roleKey: string): Promise<string[]> {
    const memberships = await this.prisma.membershipRole.findMany({
      where: {
        tenant_id: tenantId,
        role: {
          role_key: roleKey,
        },
        membership: {
          membership_status: 'active',
        },
      },
      select: {
        membership: {
          select: { user_id: true },
        },
      },
    });

    return memberships.map((mr) => mr.membership.user_id);
  }

  // ─── PRIVATE: Notification Creation ────────────────────────────────────

  /**
   * Creates notification records for all active channels for the given recipients.
   * Uses NotificationsService.createBatch() to insert records efficiently.
   * Deduplicates: each recipient gets at most one notification per channel.
   */
  private async createNotificationsForChannels(
    tenantId: string,
    recipientIds: string[],
    channels: SeverityChannelConfig,
    templateKey: string,
    payloadVariables: Record<string, unknown>,
    concernId: string,
  ): Promise<void> {
    const notifications: Array<{
      tenant_id: string;
      recipient_user_id: string;
      channel: string;
      template_key: string | null;
      locale: string;
      payload_json: Record<string, unknown>;
      source_entity_type: string;
      source_entity_id: string;
    }> = [];

    for (const recipientId of recipientIds) {
      // In-app notification (with priority: 'high' flag when push is active)
      // Push notifications use the in-app channel with a priority flag rather
      // than a separate channel — the frontend PWA service worker reads this
      // flag to trigger a browser push notification.
      if (channels.in_app) {
        const inAppPayload = channels.push
          ? { ...payloadVariables, priority: 'high' }
          : payloadVariables;

        notifications.push({
          tenant_id: tenantId,
          recipient_user_id: recipientId,
          channel: 'in_app',
          template_key: templateKey,
          locale: 'en',
          payload_json: inAppPayload,
          source_entity_type: 'pastoral_concern',
          source_entity_id: concernId,
        });
      }

      // Email notification
      if (channels.email) {
        notifications.push({
          tenant_id: tenantId,
          recipient_user_id: recipientId,
          channel: 'email',
          template_key: templateKey,
          locale: 'en',
          payload_json: payloadVariables,
          source_entity_type: 'pastoral_concern',
          source_entity_id: concernId,
        });
      }

      // WhatsApp notification
      if (channels.whatsapp) {
        notifications.push({
          tenant_id: tenantId,
          recipient_user_id: recipientId,
          channel: 'whatsapp',
          template_key: templateKey,
          locale: 'en',
          payload_json: payloadVariables,
          source_entity_type: 'pastoral_concern',
          source_entity_id: concernId,
        });
      }
    }

    if (notifications.length > 0) {
      await this.notificationsService.createBatch(tenantId, notifications);
    }
  }

  // ─── PRIVATE: BullMQ Job Enqueuing ─────────────────────────────────────

  /**
   * Enqueues a dispatch job on the notifications queue for external channel delivery.
   */
  private async enqueueDispatchJob(
    tenantId: string,
    concernId: string,
    severity: PastoralConcernSeverity,
  ): Promise<void> {
    const isPriority = severity === 'urgent' || severity === 'critical';
    await this.notificationsQueue.add(
      COMMUNICATIONS_DISPATCH_JOB,
      {
        tenant_id: tenantId,
        source_entity_type: 'pastoral_concern',
        source_entity_id: concernId,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        priority: isPriority ? 1 : undefined,
      },
    );
  }

  /**
   * Enqueues a delayed escalation timeout job on the pastoral queue.
   * Uses a deterministic job ID for cancellation lookup.
   * Returns the job ID.
   */
  private async enqueueEscalationTimeout(
    tenantId: string,
    concernId: string,
    escalationType: EscalationType,
    delayMinutes: number,
  ): Promise<string> {
    const jobId = this.buildEscalationJobId(tenantId, concernId, escalationType);
    const delayMs = delayMinutes * 60 * 1000;

    await this.pastoralQueue.add(
      PASTORAL_ESCALATION_JOB,
      {
        tenant_id: tenantId,
        concern_id: concernId,
        escalation_type: escalationType,
        original_severity: escalationType === 'urgent_to_critical' ? 'urgent' : 'critical',
        enqueued_at: new Date().toISOString(),
      },
      {
        jobId,
        delay: delayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    );

    this.logger.log(`Enqueued escalation timeout job ${jobId} with delay=${delayMinutes}min`);

    return jobId;
  }

  /**
   * Builds the deterministic job ID for escalation timeout jobs.
   * Pattern: pastoral:escalation:{tenantId}:{concernId}:{escalationType}
   */
  private buildEscalationJobId(
    tenantId: string,
    concernId: string,
    escalationType: EscalationType,
  ): string {
    return `pastoral:escalation:${tenantId}:${concernId}:${escalationType}`;
  }

  // ─── PRIVATE: Helpers ──────────────────────────────────────────────────

  /**
   * Loads and parses the pastoral section of tenant settings.
   * Uses the Zod schema to fill in defaults for any missing fields.
   */
  private async loadPastoralSettings(tenantId: string) {
    const record = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    const settingsJson = (record?.settings as Record<string, unknown>) ?? {};
    const pastoralRaw = (settingsJson.pastoral as Record<string, unknown>) ?? {};

    return pastoralTenantSettingsSchema.parse(pastoralRaw);
  }

  /**
   * Formats a student name for notification display.
   * Uses "First L." format (first name + last initial) for privacy.
   */
  private formatStudentName(concern: PastoralConcernForNotification): string {
    if (concern.student?.first_name) {
      const lastInitial = concern.student.last_name
        ? `${concern.student.last_name.charAt(0)}.`
        : '';
      return `${concern.student.first_name} ${lastInitial}`.trim();
    }
    return 'Student';
  }

  /**
   * Builds the template variable payload for notification rendering.
   */
  private buildPayloadVariables(
    concern: PastoralConcernForNotification,
    studentName: string,
    severity: PastoralConcernSeverity,
  ): Record<string, unknown> {
    return {
      student_name: studentName,
      category: concern.category,
      severity: severity.charAt(0).toUpperCase() + severity.slice(1),
      concern_id: concern.id,
      student_id: concern.student_id,
      concern_date: concern.created_at.toISOString(),
      concern_url: `/pastoral/concerns/${concern.id}`,
    };
  }
}
