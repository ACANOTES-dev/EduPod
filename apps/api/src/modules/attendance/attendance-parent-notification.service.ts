import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import { NotificationsService } from '../communications/notifications.service';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

/** Map attendance record status to notification template key. */
function statusToTemplateKey(status: string): string | null {
  switch (status) {
    case 'absent_unexcused':
    case 'absent_excused':
      return 'attendance.absent';
    case 'late':
      return 'attendance.late';
    case 'left_early':
      return 'attendance.left_early';
    default:
      return null;
  }
}

@Injectable()
export class AttendanceParentNotificationService {
  private readonly logger = new Logger(AttendanceParentNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  /**
   * Send immediate notifications to parents when their child is marked
   * absent, late, or left_early. Checks tenant settings, deduplicates
   * by record id, and dispatches both in-app + external (SMS/WhatsApp) notifications.
   */
  async triggerAbsenceNotification(
    tenantId: string,
    studentId: string,
    recordId: string,
    status: string,
    sessionDate: string,
  ): Promise<void> {
    // 1. Check tenant settings
    const settings = await this.settingsService.getSettings(tenantId);

    if (!settings.attendance.notifyParentOnAbsence) {
      return;
    }

    if (!settings.general.attendanceVisibleToParents) {
      return;
    }

    // 2. No notification for present status
    if (status === 'present') {
      return;
    }

    // 3. Map status to template key
    const templateKey = statusToTemplateKey(status);
    if (!templateKey) {
      return;
    }

    // 4. Deduplicate: check if a notification already exists for this record
    const existingNotification = await this.prisma.notification.findFirst({
      where: {
        tenant_id: tenantId,
        source_entity_type: 'attendance_record',
        source_entity_id: recordId,
      },
      select: { id: true },
    });

    if (existingNotification) {
      this.logger.debug(
        `Notification already exists for attendance record ${recordId}, skipping`,
      );
      return;
    }

    // 5. Find parent/guardian user(s) for the student
    const studentParents = await this.prisma.studentParent.findMany({
      where: {
        student_id: studentId,
        tenant_id: tenantId,
      },
      select: {
        parent: {
          select: {
            user_id: true,
            whatsapp_phone: true,
            phone: true,
            preferred_contact_channels: true,
          },
        },
      },
    });

    // Filter to parents that have a linked user account
    const parentUsers = studentParents
      .map((sp) => sp.parent)
      .filter((p) => p.user_id !== null);

    if (parentUsers.length === 0) {
      this.logger.debug(
        `No parent users found for student ${studentId}, skipping notification`,
      );
      return;
    }

    // 6. Get student name for the notification message
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { first_name: true, last_name: true },
    });

    if (!student) {
      this.logger.warn(
        `Student ${studentId} not found for tenant ${tenantId}, skipping notification`,
      );
      return;
    }

    const studentName = `${student.first_name} ${student.last_name}`;

    // 7. Create in-app notifications for all parent users
    const inAppNotifications = parentUsers.map((parent) => ({
      tenant_id: tenantId,
      recipient_user_id: parent.user_id as string,
      channel: 'in_app' as const,
      template_key: templateKey,
      locale: 'en',
      payload_json: {
        student_name: studentName,
        student_id: studentId,
        status,
        session_date: sessionDate,
      },
      source_entity_type: 'attendance_record',
      source_entity_id: recordId,
    }));

    await this.notificationsService.createBatch(tenantId, inAppNotifications);

    // 8. Enqueue external dispatch jobs (SMS/WhatsApp) for parents with contact channels
    for (const parent of parentUsers) {
      const hasWhatsApp = parent.whatsapp_phone !== null && parent.whatsapp_phone !== '';
      const hasPhone = parent.phone !== null && parent.phone !== '';

      if (hasWhatsApp || hasPhone) {
        try {
          await this.notificationsQueue.add(
            'communications:attendance-parent-notify',
            {
              tenant_id: tenantId,
              recipient_user_id: parent.user_id,
              student_name: studentName,
              student_id: studentId,
              status,
              session_date: sessionDate,
              template_key: templateKey,
              record_id: recordId,
              whatsapp_phone: parent.whatsapp_phone ?? null,
              phone: parent.phone ?? null,
            },
            { attempts: 3, backoff: { type: 'exponential', delay: 60_000 } },
          );
        } catch (err) {
          this.logger.error(
            `Failed to enqueue external notification for parent user ${parent.user_id}: ${String(err)}`,
          );
        }
      }
    }
  }
}
