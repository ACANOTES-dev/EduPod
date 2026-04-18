import { Injectable, Logger } from '@nestjs/common';

import { NotificationsService } from '../communications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

export type ExamTemplateKey =
  | 'exam.student_schedule_published'
  | 'exam.parent_schedule_published'
  | 'exam.invigilator_assigned';

interface EnqueueArgs {
  tenantId: string;
  templateKey: ExamTemplateKey;
  recipientUserIds: string[];
  payload: Record<string, unknown>;
  sourceEntityType: string;
  sourceEntityId: string;
  locale?: string;
}

/**
 * Fans out exam-publish notifications across the tenant's enabled channels.
 * Mirrors CoverNotificationsService's fan-out pattern — always queues email +
 * in_app; SMS/WhatsApp are opt-in per tenant_scheduling_settings.
 */
@Injectable()
export class ExamNotificationsService {
  private readonly logger = new Logger(ExamNotificationsService.name);

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
      this.logger.error(`[ExamNotifications.enqueue] ${args.templateKey}`, err);
    }
  }

  // ─── Convenience wrappers ────────────────────────────────────────────────

  async notifyStudentsScheduledPublished(args: {
    tenantId: string;
    sessionId: string;
    sessionName: string;
    recipientUserIds: string[];
  }) {
    await this.enqueue({
      tenantId: args.tenantId,
      templateKey: 'exam.student_schedule_published',
      recipientUserIds: args.recipientUserIds,
      payload: {
        session_name: args.sessionName,
      },
      sourceEntityType: 'exam_session',
      sourceEntityId: args.sessionId,
    });
  }

  async notifyParentsScheduledPublished(args: {
    tenantId: string;
    sessionId: string;
    sessionName: string;
    recipientUserIds: string[];
  }) {
    await this.enqueue({
      tenantId: args.tenantId,
      templateKey: 'exam.parent_schedule_published',
      recipientUserIds: args.recipientUserIds,
      payload: {
        session_name: args.sessionName,
      },
      sourceEntityType: 'exam_session',
      sourceEntityId: args.sessionId,
    });
  }

  async notifyInvigilatorsAssigned(args: {
    tenantId: string;
    sessionId: string;
    sessionName: string;
    recipientUserIds: string[];
  }) {
    await this.enqueue({
      tenantId: args.tenantId,
      templateKey: 'exam.invigilator_assigned',
      recipientUserIds: args.recipientUserIds,
      payload: {
        session_name: args.sessionName,
      },
      sourceEntityType: 'exam_session',
      sourceEntityId: args.sessionId,
    });
  }
}
