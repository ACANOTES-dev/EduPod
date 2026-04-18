import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { AudienceDefinition } from '@school/shared/inbox';

import { NotificationsService } from '../communications/notifications.service';
import { AudienceResolutionService } from '../inbox/audience/audience-resolution.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotifyOnPublishResult {
  homework_id: string;
  recipients_count: number;
  parents_count: number;
  students_count: number;
  already_notified: boolean;
}

export interface NotifyOnPublishOptions {
  /**
   * Whether to suppress parent notifications for re-notify attempts that
   * have no new recipients. Not currently used; reserved for future
   * idempotency controls.
   */
  allowResend?: boolean;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * HomeworkNotificationService — in-app notification fan-out on homework
 * publish.
 *
 * Policy:
 *   - Every published homework fires an in-app Notification to the parents
 *     of every actively enrolled student in the target class.
 *   - Students are NOT currently notified: the student user account surface
 *     is not yet live, so `class_students` resolves to zero user_ids. The
 *     service still reports `students_count: 0` so the future wiring point
 *     is explicit.
 *   - No email / SMS / WhatsApp. In-app is the only supported channel —
 *     per-message cost discipline (the paid third-party fan-out was
 *     intentionally removed). A dedicated mobile app will later convert
 *     these in-app rows into push notifications.
 *
 * The caller is HomeworkService: one call per draft → published transition,
 * and one call per re-notify endpoint invocation.
 */
@Injectable()
export class HomeworkNotificationService {
  private readonly logger = new Logger(HomeworkNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audienceResolution: AudienceResolutionService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Fire an in-app Notification row to every parent of every enrolled
   * student in the homework's class. Safe to call multiple times — each
   * call creates a fresh batch; parent clients dedupe by
   * `source_entity_id`.
   */
  async notifyOnPublish(
    tenantId: string,
    homeworkId: string,
    _opts: NotifyOnPublishOptions = {},
  ): Promise<NotifyOnPublishResult> {
    const assignment = await this.prisma.homeworkAssignment.findFirst({
      where: { id: homeworkId, tenant_id: tenantId },
      select: {
        id: true,
        class_id: true,
        subject_id: true,
        title: true,
        due_date: true,
        due_time: true,
        homework_type: true,
        class_entity: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true } },
        assigned_by: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    if (!assignment) {
      throw new NotFoundException({
        code: 'HOMEWORK_NOT_FOUND',
        message: `Homework assignment with id "${homeworkId}" not found`,
      });
    }

    const parentsAudience: AudienceDefinition = {
      provider: 'class_parents',
      params: { class_ids: [assignment.class_id] },
    };

    const resolved = await this.audienceResolution.resolve(tenantId, parentsAudience);
    const parentUserIds = resolved.user_ids;

    if (parentUserIds.length === 0) {
      this.logger.log(
        `Homework ${homeworkId} published for tenant ${tenantId}: no parent recipients resolved (empty class or no linked parents)`,
      );
      return {
        homework_id: homeworkId,
        recipients_count: 0,
        parents_count: 0,
        students_count: 0,
        already_notified: false,
      };
    }

    const teacherName = assignment.assigned_by
      ? `${assignment.assigned_by.first_name} ${assignment.assigned_by.last_name}`.trim()
      : "Your child's teacher";

    const payloadJson = {
      homework_id: assignment.id,
      title: assignment.title,
      class_id: assignment.class_entity.id,
      class_name: assignment.class_entity.name,
      subject_id: assignment.subject?.id ?? null,
      subject_name: assignment.subject?.name ?? null,
      homework_type: assignment.homework_type,
      due_date: assignment.due_date.toISOString().split('T')[0] ?? '',
      teacher_name: teacherName,
    };

    const notifications = parentUserIds.map((userId) => ({
      tenant_id: tenantId,
      recipient_user_id: userId,
      channel: 'in_app',
      template_key: 'homework_assigned',
      locale: 'en',
      payload_json: payloadJson,
      source_entity_type: 'homework_assignment',
      source_entity_id: assignment.id,
    }));

    await this.notificationsService.createBatch(tenantId, notifications);

    this.logger.log(
      `Homework ${homeworkId} notifications dispatched for tenant ${tenantId}: ${parentUserIds.length} parent in-app rows created`,
    );

    return {
      homework_id: homeworkId,
      recipients_count: parentUserIds.length,
      parents_count: parentUserIds.length,
      students_count: 0,
      already_notified: false,
    };
  }

  /**
   * Preview the recipient count without sending. Used by the frontend
   * publish/re-notify confirmation dialogs.
   */
  async previewRecipientCount(
    tenantId: string,
    homeworkId: string,
  ): Promise<{ parents_count: number; students_count: number; recipients_count: number }> {
    const assignment = await this.prisma.homeworkAssignment.findFirst({
      where: { id: homeworkId, tenant_id: tenantId },
      select: { class_id: true },
    });

    if (!assignment) {
      throw new NotFoundException({
        code: 'HOMEWORK_NOT_FOUND',
        message: `Homework assignment with id "${homeworkId}" not found`,
      });
    }

    const preview = await this.audienceResolution.previewCount(tenantId, {
      provider: 'class_parents',
      params: { class_ids: [assignment.class_id] },
    });

    return {
      parents_count: preview.count,
      students_count: 0,
      recipients_count: preview.count,
    };
  }
}
