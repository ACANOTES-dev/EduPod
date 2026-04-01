import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';

import type { AlertDetail, AlertListItem, AlertListQuery } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BehaviourAlertsService {
  private readonly logger = new Logger(BehaviourAlertsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── List Alerts ───────────────────────────────────────────────────────────

  async listAlerts(
    tenantId: string,
    userId: string,
    query: AlertListQuery,
  ): Promise<{ data: AlertListItem[]; meta: { page: number; pageSize: number; total: number } }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    type ListResult = {
      data: AlertListItem[];
      meta: { page: number; pageSize: number; total: number };
    };
    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;
      const recipientWhere: Prisma.BehaviourAlertRecipientWhereInput = {
        tenant_id: tenantId,
        recipient_id: userId,
      };

      // Filter by tab status
      if (query.status && query.status !== 'all') {
        if (query.status === 'unseen') {
          recipientWhere.status = { in: ['unseen', 'seen'] as $Enums.AlertRecipientStatus[] };
        } else if (query.status === 'acknowledged') {
          recipientWhere.status = 'acknowledged' as $Enums.AlertRecipientStatus;
        } else if (query.status === 'snoozed') {
          recipientWhere.status = 'snoozed' as $Enums.AlertRecipientStatus;
        } else if (query.status === 'resolved') {
          recipientWhere.status = {
            in: ['resolved_recipient', 'dismissed'] as $Enums.AlertRecipientStatus[],
          };
        }
      }

      if (query.alertType) {
        recipientWhere.alert = { alert_type: query.alertType as $Enums.AlertType };
      }
      if (query.severity) {
        recipientWhere.alert = {
          ...(recipientWhere.alert as Prisma.BehaviourAlertWhereInput),
          severity: query.severity as $Enums.AlertSeverity,
        };
      }

      const [total, recipients] = await Promise.all([
        tx.behaviourAlertRecipient.count({ where: recipientWhere }),
        tx.behaviourAlertRecipient.findMany({
          where: recipientWhere,
          include: {
            alert: {
              include: {
                student: { select: { id: true, first_name: true, last_name: true } },
                subject: { select: { id: true, name: true } },
                staff: {
                  select: { id: true, user: { select: { first_name: true, last_name: true } } },
                },
              },
            },
          },
          orderBy: { created_at: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);

      const data: AlertListItem[] = recipients.map((r) => ({
        id: r.alert_id,
        alert_type: r.alert.alert_type as string,
        severity: r.alert.severity as string,
        title: r.alert.title,
        description: r.alert.description,
        student_name: r.alert.student
          ? `${r.alert.student.first_name} ${r.alert.student.last_name}`
          : null,
        subject_name: r.alert.subject?.name ?? null,
        staff_name: r.alert.staff?.user
          ? `${r.alert.staff.user.first_name} ${r.alert.staff.user.last_name}`
          : null,
        my_status: r.status as string,
        created_at: r.alert.created_at.toISOString(),
        data_snapshot: r.alert.data_snapshot as Record<string, unknown>,
      }));

      return {
        data,
        meta: { page: query.page, pageSize: query.pageSize, total },
      };
    }) as Promise<ListResult>;
  }

  // ─── Get Alert Detail ──────────────────────────────────────────────────────

  async getAlert(tenantId: string, userId: string, alertId: string): Promise<AlertDetail> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;
      const alert = await tx.behaviourAlert.findFirst({
        where: { id: alertId, tenant_id: tenantId },
        include: {
          student: { select: { id: true, first_name: true, last_name: true } },
          subject: { select: { id: true, name: true } },
          staff: { select: { id: true, user: { select: { first_name: true, last_name: true } } } },
          recipients: {
            include: {
              recipient: { select: { id: true, first_name: true, last_name: true } },
            },
          },
        },
      });

      if (!alert)
        throw new NotFoundException({
          code: 'BEHAVIOUR_ALERT_NOT_FOUND',
          message: `Behaviour alert with id "${alertId}" not found`,
        });

      // Mark as seen if user is a recipient with unseen status
      const myRecipient = alert.recipients.find((r) => r.recipient_id === userId);
      if (myRecipient && myRecipient.status === 'unseen') {
        await tx.behaviourAlertRecipient.update({
          where: { id: myRecipient.id },
          data: {
            status: 'seen' as $Enums.AlertRecipientStatus,
            seen_at: new Date(),
          },
        });
      }

      return {
        id: alert.id,
        alert_type: alert.alert_type as string,
        severity: alert.severity as string,
        title: alert.title,
        description: alert.description,
        student_name: alert.student
          ? `${alert.student.first_name} ${alert.student.last_name}`
          : null,
        subject_name: alert.subject?.name ?? null,
        staff_name: alert.staff?.user
          ? `${alert.staff.user.first_name} ${alert.staff.user.last_name}`
          : null,
        my_status: (myRecipient?.status as string) ?? 'unseen',
        created_at: alert.created_at.toISOString(),
        data_snapshot: alert.data_snapshot as Record<string, unknown>,
        resolved_at: alert.resolved_at?.toISOString() ?? null,
        recipients: alert.recipients.map((r) => ({
          recipient_id: r.recipient_id,
          recipient_name: `${r.recipient.first_name} ${r.recipient.last_name}`,
          recipient_role: r.recipient_role,
          status: r.status as string,
          seen_at: r.seen_at?.toISOString() ?? null,
          acknowledged_at: r.acknowledged_at?.toISOString() ?? null,
          snoozed_until: r.snoozed_until?.toISOString() ?? null,
          resolved_at: r.resolved_at?.toISOString() ?? null,
          dismissed_at: r.dismissed_at?.toISOString() ?? null,
          dismissed_reason: r.dismissed_reason,
        })),
      };
    }) as Promise<AlertDetail>;
  }

  // ─── Badge Count ───────────────────────────────────────────────────────────

  async getBadgeCount(tenantId: string, userId: string): Promise<number> {
    return this.prisma.behaviourAlertRecipient.count({
      where: {
        tenant_id: tenantId,
        recipient_id: userId,
        status: {
          in: ['unseen', 'seen'] as $Enums.AlertRecipientStatus[],
        },
      },
    });
  }

  // ─── Status transitions ───────────────────────────────────────────────────

  async markSeen(tenantId: string, userId: string, alertId: string): Promise<void> {
    await this.updateRecipientStatus(tenantId, userId, alertId, {
      status: 'seen' as $Enums.AlertRecipientStatus,
      seen_at: new Date(),
    });
  }

  async acknowledge(tenantId: string, userId: string, alertId: string): Promise<void> {
    await this.updateRecipientStatus(tenantId, userId, alertId, {
      status: 'acknowledged' as $Enums.AlertRecipientStatus,
      acknowledged_at: new Date(),
    });
  }

  async snooze(tenantId: string, userId: string, alertId: string, until: Date): Promise<void> {
    await this.updateRecipientStatus(tenantId, userId, alertId, {
      status: 'snoozed' as $Enums.AlertRecipientStatus,
      snoozed_until: until,
    });
  }

  async resolve(tenantId: string, userId: string, alertId: string): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;
      await this.updateRecipientStatusInTx(tx, tenantId, userId, alertId, {
        status: 'resolved_recipient' as $Enums.AlertRecipientStatus,
        resolved_at: new Date(),
      });

      await this.checkAndAutoResolve(tx, tenantId, alertId);
    });
  }

  async dismiss(tenantId: string, userId: string, alertId: string, reason?: string): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;
      await this.updateRecipientStatusInTx(tx, tenantId, userId, alertId, {
        status: 'dismissed' as $Enums.AlertRecipientStatus,
        dismissed_at: new Date(),
        dismissed_reason: reason ?? null,
      });

      await this.checkAndAutoResolve(tx, tenantId, alertId);
    });
  }

  // ─── Internal: used by detect-patterns worker ──────────────────────────────

  async createAlert(
    tenantId: string,
    data: {
      alert_type: $Enums.AlertType;
      severity: $Enums.AlertSeverity;
      title: string;
      description: string;
      data_snapshot: Record<string, unknown>;
      student_id?: string;
      subject_id?: string;
      staff_id?: string;
    },
    recipientIds: Array<{ userId: string; role?: string }>,
    tx: PrismaService,
  ): Promise<string> {
    const alert = await tx.behaviourAlert.create({
      data: {
        tenant_id: tenantId,
        alert_type: data.alert_type,
        severity: data.severity,
        title: data.title,
        description: data.description,
        data_snapshot: data.data_snapshot as Prisma.InputJsonValue,
        student_id: data.student_id ?? null,
        subject_id: data.subject_id ?? null,
        staff_id: data.staff_id ?? null,
        status: 'active_alert' as $Enums.AlertStatus,
      },
    });

    if (recipientIds.length > 0) {
      await tx.behaviourAlertRecipient.createMany({
        data: recipientIds.map((r) => ({
          tenant_id: tenantId,
          alert_id: alert.id,
          recipient_id: r.userId,
          recipient_role: r.role ?? null,
          status: 'unseen' as $Enums.AlertRecipientStatus,
        })),
      });
    }

    return alert.id;
  }

  async updateAlertSnapshot(
    tenantId: string,
    alertId: string,
    snapshot: Record<string, unknown>,
    tx: PrismaService,
  ): Promise<void> {
    await tx.behaviourAlert.update({
      where: { id: alertId },
      data: {
        data_snapshot: snapshot as Prisma.InputJsonValue,
        updated_at: new Date(),
      },
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async updateRecipientStatus(
    tenantId: string,
    userId: string,
    alertId: string,
    data: Prisma.BehaviourAlertRecipientUpdateInput,
  ): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    await rlsClient.$transaction(async (txRaw) => {
      const tx = txRaw as unknown as PrismaService;
      await this.updateRecipientStatusInTx(tx, tenantId, userId, alertId, data);
    });
  }

  private async updateRecipientStatusInTx(
    tx: PrismaService,
    tenantId: string,
    userId: string,
    alertId: string,
    data: Prisma.BehaviourAlertRecipientUpdateInput,
  ): Promise<void> {
    const recipient = await tx.behaviourAlertRecipient.findFirst({
      where: {
        tenant_id: tenantId,
        alert_id: alertId,
        recipient_id: userId,
      },
    });

    if (!recipient)
      throw new NotFoundException({
        code: 'ALERT_RECIPIENT_NOT_FOUND',
        message: `Alert recipient for alert "${alertId}" and user "${userId}" not found`,
      });

    await tx.behaviourAlertRecipient.update({
      where: { id: recipient.id },
      data,
    });
  }

  private async checkAndAutoResolve(
    tx: PrismaService,
    tenantId: string,
    alertId: string,
  ): Promise<void> {
    const unresolved = await tx.behaviourAlertRecipient.count({
      where: {
        tenant_id: tenantId,
        alert_id: alertId,
        status: {
          notIn: ['resolved_recipient', 'dismissed'] as $Enums.AlertRecipientStatus[],
        },
      },
    });

    if (unresolved === 0) {
      await tx.behaviourAlert.update({
        where: { id: alertId },
        data: {
          status: 'resolved_alert' as $Enums.AlertStatus,
          resolved_at: new Date(),
        },
      });
    }
  }
}
