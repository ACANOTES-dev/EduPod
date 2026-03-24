import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AttendanceAlertStatus, AttendanceAlertType } from '@prisma/client';

import { NotificationsService } from '../communications/notifications.service';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

import { AttendanceParentNotificationService } from './attendance-parent-notification.service';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ListAlertsFilters {
  status?: AttendanceAlertStatus;
  alert_type?: AttendanceAlertType;
  page?: number;
  pageSize?: number;
}

interface AlertDetailsJson {
  count: number;
  window_days: number;
  day_name?: string;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class AttendancePatternService {
  private readonly logger = new Logger(AttendancePatternService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly parentNotificationService: AttendanceParentNotificationService,
  ) {}

  /**
   * List pattern alerts with pagination and optional filters.
   */
  async listAlerts(tenantId: string, filters: ListAlertsFilters) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.alert_type) {
      where.alert_type = filters.alert_type;
    }

    const [data, total] = await Promise.all([
      this.prisma.attendancePatternAlert.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              student_number: true,
              class_homeroom_id: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.attendancePatternAlert.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  /**
   * Acknowledge an alert — sets status to 'acknowledged' and records who/when.
   */
  async acknowledgeAlert(tenantId: string, alertId: string, userId: string) {
    const alert = await this.prisma.attendancePatternAlert.findFirst({
      where: { id: alertId, tenant_id: tenantId },
    });

    if (!alert) {
      throw new NotFoundException({
        code: 'ALERT_NOT_FOUND',
        message: `Pattern alert ${alertId} not found`,
      });
    }

    return this.prisma.attendancePatternAlert.update({
      where: { id: alertId },
      data: {
        status: 'acknowledged',
        acknowledged_by: userId,
        acknowledged_at: new Date(),
      },
    });
  }

  /**
   * Resolve an alert — sets status to 'resolved'.
   */
  async resolveAlert(tenantId: string, alertId: string) {
    const alert = await this.prisma.attendancePatternAlert.findFirst({
      where: { id: alertId, tenant_id: tenantId },
    });

    if (!alert) {
      throw new NotFoundException({
        code: 'ALERT_NOT_FOUND',
        message: `Pattern alert ${alertId} not found`,
      });
    }

    return this.prisma.attendancePatternAlert.update({
      where: { id: alertId },
      data: { status: 'resolved' },
    });
  }

  /**
   * Manually notify parent about a pattern alert.
   * Used when parentNotificationMode is 'manual'.
   */
  async notifyParentManual(tenantId: string, alertId: string) {
    const alert = await this.prisma.attendancePatternAlert.findFirst({
      where: { id: alertId, tenant_id: tenantId },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_parents: {
              select: {
                parent: {
                  select: {
                    user_id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!alert) {
      throw new NotFoundException({
        code: 'ALERT_NOT_FOUND',
        message: `Pattern alert ${alertId} not found`,
      });
    }

    if (alert.parent_notified) {
      throw new ConflictException({
        code: 'ALREADY_NOTIFIED',
        message: 'Parent has already been notified about this alert',
      });
    }

    // Build notification message based on alert type
    const studentName = `${alert.student.first_name} ${alert.student.last_name}`;
    const details = alert.details_json as unknown as AlertDetailsJson;
    const message = this.buildParentMessage(
      alert.alert_type,
      studentName,
      details,
    );

    // Find parent users via StudentParent→Parent
    const parentUserIds = alert.student.student_parents
      .map((sp) => sp.parent.user_id)
      .filter((uid): uid is string => uid !== null);

    if (parentUserIds.length > 0) {
      const notifications = parentUserIds.map((userId) => ({
        tenant_id: tenantId,
        recipient_user_id: userId,
        channel: 'in_app' as const,
        template_key: `attendance.pattern.${alert.alert_type}`,
        locale: 'en',
        payload_json: {
          student_name: studentName,
          student_id: alert.student_id,
          alert_type: alert.alert_type,
          message,
          ...details,
        },
        source_entity_type: 'attendance_pattern_alert',
        source_entity_id: alert.id,
      }));

      await this.notificationsService.createBatch(tenantId, notifications);
    }

    // Update alert to mark parent as notified
    await this.prisma.attendancePatternAlert.update({
      where: { id: alertId },
      data: {
        parent_notified: true,
        parent_notified_at: new Date(),
      },
    });

    this.logger.log(
      `Manually notified ${parentUserIds.length} parent(s) for alert ${alertId}`,
    );

    return { notified: parentUserIds.length };
  }

  /**
   * Build a human-readable parent notification message based on alert type.
   */
  private buildParentMessage(
    alertType: AttendanceAlertType,
    studentName: string,
    details: AlertDetailsJson,
  ): string {
    switch (alertType) {
      case 'excessive_absences':
        return `Your child ${studentName} has been absent ${details.count} days in the past ${details.window_days} days. Please contact the school office.`;
      case 'recurring_day':
        return `Your child ${studentName} has been consistently absent on ${details.day_name ?? 'unknown'}s — ${details.count} times in the past ${details.window_days} days. Please contact the school office.`;
      case 'chronic_tardiness':
        return `Your child ${studentName} has been late ${details.count} times in the past ${details.window_days} days. Please contact the school office.`;
    }
  }
}
