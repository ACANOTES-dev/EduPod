import { Injectable, Logger } from '@nestjs/common';

import { NotificationsService } from '../communications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export type CoverTemplateKey =
  | 'absence.self_reported_confirmation'
  | 'absence.admin_notice'
  | 'absence.cancelled'
  | 'substitution.offer_received'
  | 'substitution.offer_nominated'
  | 'substitution.admin_offer_dispatched'
  | 'substitution.accepted'
  | 'substitution.declined'
  | 'substitution.cascade_exhausted'
  | 'substitution.offer_revoked'
  | 'substitution.nominated_rejected'
  | 'leave.request_submitted'
  | 'leave.request_approved'
  | 'leave.request_rejected';

const ADMIN_ROLE_KEYS = ['school_owner', 'school_principal', 'school_vice_principal'] as const;

interface EnqueueArgs {
  tenantId: string;
  templateKey: CoverTemplateKey;
  recipientUserIds: string[];
  payload: Record<string, unknown>;
  sourceEntityType: string;
  sourceEntityId: string;
  locale?: string;
}

/**
 * Fans out cover-related notifications across the tenant's enabled channels.
 * Always queues email + in_app; SMS and WhatsApp are opt-in per
 * tenant_scheduling_settings (defaults off).
 */
@Injectable()
export class CoverNotificationsService {
  private readonly logger = new Logger(CoverNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Channel enablement ───────────────────────────────────────────────────

  private async getChannels(tenantId: string): Promise<string[]> {
    const settings = await this.prisma.tenantSchedulingSettings.findFirst({
      where: { tenant_id: tenantId },
    });
    const channels: string[] = ['in_app', 'email'];
    if (settings?.sms_enabled) channels.push('sms');
    if (settings?.whatsapp_enabled) channels.push('whatsapp');
    return channels;
  }

  // ─── Admin recipient lookup ──────────────────────────────────────────────

  async resolveAdminUserIds(tenantId: string): Promise<string[]> {
    // RBAC module does not expose a public facade for "users with role keys X"
    // lookup. This direct access is a deliberate exception for admin broadcast
    // fan-out. If RBAC grows a UsersByRole facade in future, migrate here.
    // eslint-disable-next-line school/no-cross-module-prisma-access
    const memberships = await this.prisma.membershipRole.findMany({
      where: {
        tenant_id: tenantId,
        role: {
          tenant_id: tenantId,
          role_key: { in: ADMIN_ROLE_KEYS as unknown as string[] },
        },
        membership: {
          tenant_id: tenantId,
          membership_status: 'active',
        },
      },
      include: { membership: true },
    });
    const userIds = new Set<string>();
    for (const m of memberships) {
      if (m.membership?.user_id) userIds.add(m.membership.user_id);
    }
    return [...userIds];
  }

  // ─── Dispatch ─────────────────────────────────────────────────────────────

  async enqueue(args: EnqueueArgs) {
    if (args.recipientUserIds.length === 0) return;
    const channels = await this.getChannels(args.tenantId);
    const locale = args.locale ?? 'en';

    const rows = [];
    for (const userId of args.recipientUserIds) {
      for (const channel of channels) {
        rows.push({
          tenant_id: args.tenantId,
          recipient_user_id: userId,
          channel,
          template_key: args.templateKey,
          locale,
          payload_json: args.payload,
          source_entity_type: args.sourceEntityType,
          source_entity_id: args.sourceEntityId,
        });
      }
    }

    try {
      await this.notificationsService.createBatch(args.tenantId, rows);
    } catch (err) {
      this.logger.error(`[CoverNotifications.enqueue] ${args.templateKey}`, err);
    }
  }

  // ─── Convenience wrappers for each state transition ──────────────────────

  async notifySelfReportedAbsence(args: {
    tenantId: string;
    absenceId: string;
    reporterUserId: string;
    reporterName: string;
    dateFrom: string;
    dateTo: string | null;
    nominatedSubstituteName: string | null;
  }) {
    await this.enqueue({
      tenantId: args.tenantId,
      templateKey: 'absence.self_reported_confirmation',
      recipientUserIds: [args.reporterUserId],
      payload: {
        date_from: args.dateFrom,
        date_to: args.dateTo,
        nominated_substitute: args.nominatedSubstituteName,
      },
      sourceEntityType: 'teacher_absence',
      sourceEntityId: args.absenceId,
    });

    const adminIds = await this.resolveAdminUserIds(args.tenantId);
    await this.enqueue({
      tenantId: args.tenantId,
      templateKey: 'absence.admin_notice',
      recipientUserIds: adminIds,
      payload: {
        reporter_name: args.reporterName,
        date_from: args.dateFrom,
        date_to: args.dateTo,
        nominated_substitute: args.nominatedSubstituteName,
        source: 'self_reported',
      },
      sourceEntityType: 'teacher_absence',
      sourceEntityId: args.absenceId,
    });
  }

  async notifyOffersDispatched(args: {
    tenantId: string;
    absenceId: string;
    reporterName: string;
    offers: Array<{
      offer_id: string;
      candidate_user_id: string;
      is_nomination: boolean;
      absence_date: string;
      class_name: string | null;
      subject_name: string | null;
    }>;
  }) {
    for (const offer of args.offers) {
      await this.enqueue({
        tenantId: args.tenantId,
        templateKey: offer.is_nomination
          ? 'substitution.offer_nominated'
          : 'substitution.offer_received',
        recipientUserIds: [offer.candidate_user_id],
        payload: {
          reporter_name: args.reporterName,
          absence_date: offer.absence_date,
          class_name: offer.class_name,
          subject_name: offer.subject_name,
        },
        sourceEntityType: 'substitution_offer',
        sourceEntityId: offer.offer_id,
      });
    }

    if (args.offers.length > 0) {
      const adminIds = await this.resolveAdminUserIds(args.tenantId);
      await this.enqueue({
        tenantId: args.tenantId,
        templateKey: 'substitution.admin_offer_dispatched',
        recipientUserIds: adminIds,
        payload: {
          reporter_name: args.reporterName,
          offers_count: args.offers.length,
        },
        sourceEntityType: 'teacher_absence',
        sourceEntityId: args.absenceId,
      });
    }
  }

  async notifyOfferAccepted(args: {
    tenantId: string;
    offerId: string;
    reporterUserId: string;
    reporterName: string;
    substituteName: string;
    absenceDate: string;
  }) {
    const adminIds = await this.resolveAdminUserIds(args.tenantId);
    await this.enqueue({
      tenantId: args.tenantId,
      templateKey: 'substitution.accepted',
      recipientUserIds: [...new Set([args.reporterUserId, ...adminIds])],
      payload: {
        reporter_name: args.reporterName,
        substitute_name: args.substituteName,
        absence_date: args.absenceDate,
      },
      sourceEntityType: 'substitution_offer',
      sourceEntityId: args.offerId,
    });
  }

  async notifyOfferDeclined(args: {
    tenantId: string;
    offerId: string;
    declinerName: string;
    isNomination: boolean;
  }) {
    const adminIds = await this.resolveAdminUserIds(args.tenantId);
    await this.enqueue({
      tenantId: args.tenantId,
      templateKey: args.isNomination ? 'substitution.nominated_rejected' : 'substitution.declined',
      recipientUserIds: adminIds,
      payload: { decliner_name: args.declinerName },
      sourceEntityType: 'substitution_offer',
      sourceEntityId: args.offerId,
    });
  }

  async notifyCascadeExhausted(args: {
    tenantId: string;
    absenceId: string;
    reporterName: string;
    affectedSlots: number;
  }) {
    const adminIds = await this.resolveAdminUserIds(args.tenantId);
    await this.enqueue({
      tenantId: args.tenantId,
      templateKey: 'substitution.cascade_exhausted',
      recipientUserIds: adminIds,
      payload: {
        reporter_name: args.reporterName,
        affected_slots: args.affectedSlots,
      },
      sourceEntityType: 'teacher_absence',
      sourceEntityId: args.absenceId,
    });
  }

  async notifyOfferRevoked(args: {
    tenantId: string;
    offerId: string;
    candidateUserId: string;
    reason: 'absence_cancelled' | 'sibling_accepted';
  }) {
    await this.enqueue({
      tenantId: args.tenantId,
      templateKey: 'substitution.offer_revoked',
      recipientUserIds: [args.candidateUserId],
      payload: { reason: args.reason },
      sourceEntityType: 'substitution_offer',
      sourceEntityId: args.offerId,
    });
  }

  async notifyAbsenceCancelled(args: {
    tenantId: string;
    absenceId: string;
    reporterName: string;
    confirmedSubUserIds: string[];
  }) {
    const adminIds = await this.resolveAdminUserIds(args.tenantId);
    const recipients = [...new Set([...adminIds, ...args.confirmedSubUserIds])];
    await this.enqueue({
      tenantId: args.tenantId,
      templateKey: 'absence.cancelled',
      recipientUserIds: recipients,
      payload: { reporter_name: args.reporterName },
      sourceEntityType: 'teacher_absence',
      sourceEntityId: args.absenceId,
    });
  }

  async notifyLeaveSubmitted(args: {
    tenantId: string;
    requestId: string;
    requesterName: string;
    leaveLabel: string;
    dateFrom: string;
    dateTo: string;
  }) {
    const adminIds = await this.resolveAdminUserIds(args.tenantId);
    await this.enqueue({
      tenantId: args.tenantId,
      templateKey: 'leave.request_submitted',
      recipientUserIds: adminIds,
      payload: {
        requester_name: args.requesterName,
        leave_label: args.leaveLabel,
        date_from: args.dateFrom,
        date_to: args.dateTo,
      },
      sourceEntityType: 'leave_request',
      sourceEntityId: args.requestId,
    });
  }

  async notifyLeaveDecision(args: {
    tenantId: string;
    requestId: string;
    requesterUserId: string;
    approved: boolean;
    reviewerName: string;
    reviewNotes: string | null;
  }) {
    await this.enqueue({
      tenantId: args.tenantId,
      templateKey: args.approved ? 'leave.request_approved' : 'leave.request_rejected',
      recipientUserIds: [args.requesterUserId],
      payload: {
        reviewer_name: args.reviewerName,
        review_notes: args.reviewNotes,
      },
      sourceEntityType: 'leave_request',
      sourceEntityId: args.requestId,
    });
  }
}
