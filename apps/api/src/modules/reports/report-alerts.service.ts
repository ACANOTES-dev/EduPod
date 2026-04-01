import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { CreateReportAlertDto, UpdateReportAlertDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { UnifiedDashboardService } from './unified-dashboard.service';

export interface ReportAlertRow {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  check_frequency: string;
  notification_recipients_json: unknown;
  active: boolean;
  last_triggered_at: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface AlertCheckResult {
  alert_id: string;
  alert_name: string;
  metric: string;
  current_value: number;
  threshold: number;
  operator: string;
  triggered: boolean;
}

@Injectable()
export class ReportAlertsService {
  private readonly logger = new Logger(ReportAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly unifiedDashboard: UnifiedDashboardService,
  ) {}

  async list(
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: ReportAlertRow[]; meta: { page: number; pageSize: number; total: number } }> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;
      const skip = (page - 1) * pageSize;

      const [alerts, total] = await Promise.all([
        txClient.reportAlert.findMany({
          where: { tenant_id: tenantId },
          orderBy: { created_at: 'desc' },
          skip,
          take: pageSize,
        }),
        txClient.reportAlert.count({ where: { tenant_id: tenantId } }),
      ]);

      return {
        data: alerts.map((a) => this.toRow(a)),
        meta: { page, pageSize, total },
      };
    }) as unknown as {
      data: ReportAlertRow[];
      meta: { page: number; pageSize: number; total: number };
    };
  }

  async get(tenantId: string, alertId: string): Promise<ReportAlertRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const alert = await txClient.reportAlert.findFirst({
        where: { id: alertId, tenant_id: tenantId },
      });

      if (!alert) {
        throw new NotFoundException({
          code: 'REPORT_ALERT_NOT_FOUND',
          message: `Report alert with id "${alertId}" not found`,
        });
      }

      return this.toRow(alert);
    }) as unknown as ReportAlertRow;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateReportAlertDto,
  ): Promise<ReportAlertRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const alert = await txClient.reportAlert.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          metric: dto.metric,
          operator: dto.operator,
          threshold: dto.threshold,
          check_frequency: dto.check_frequency,
          notification_recipients_json: dto.notification_recipients_json as Prisma.InputJsonValue,
          active: dto.active ?? true,
          created_by_user_id: userId,
        },
      });

      return this.toRow(alert);
    }) as unknown as ReportAlertRow;
  }

  async update(
    tenantId: string,
    alertId: string,
    dto: UpdateReportAlertDto,
  ): Promise<ReportAlertRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const existing = await txClient.reportAlert.findFirst({
        where: { id: alertId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'REPORT_ALERT_NOT_FOUND',
          message: `Report alert with id "${alertId}" not found`,
        });
      }

      const updated = await txClient.reportAlert.update({
        where: { id: alertId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.metric !== undefined && { metric: dto.metric }),
          ...(dto.operator !== undefined && { operator: dto.operator }),
          ...(dto.threshold !== undefined && { threshold: dto.threshold }),
          ...(dto.check_frequency !== undefined && { check_frequency: dto.check_frequency }),
          ...(dto.notification_recipients_json !== undefined && {
            notification_recipients_json: dto.notification_recipients_json as Prisma.InputJsonValue,
          }),
          ...(dto.active !== undefined && { active: dto.active }),
        },
      });

      return this.toRow(updated);
    }) as unknown as ReportAlertRow;
  }

  async delete(tenantId: string, alertId: string): Promise<void> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const existing = await txClient.reportAlert.findFirst({
        where: { id: alertId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'REPORT_ALERT_NOT_FOUND',
          message: `Report alert with id "${alertId}" not found`,
        });
      }

      await txClient.reportAlert.delete({ where: { id: alertId } });
    });
  }

  /**
   * Called by the worker job. Checks all active daily alerts for all tenants.
   * Returns list of triggered alerts for notification dispatch.
   */
  async checkThresholds(): Promise<AlertCheckResult[]> {
    // Fetch all active alerts
    const alerts = await this.prisma.reportAlert.findMany({
      where: { active: true },
    });

    const results: AlertCheckResult[] = [];

    for (const alert of alerts) {
      try {
        const currentValue = await this.getMetricValue(alert.tenant_id, alert.metric);
        const threshold = Number(alert.threshold);
        const triggered = this.evaluate(currentValue, alert.operator, threshold);

        results.push({
          alert_id: alert.id,
          alert_name: alert.name,
          metric: alert.metric,
          current_value: currentValue,
          threshold,
          operator: alert.operator,
          triggered,
        });

        if (triggered) {
          await this.prisma.reportAlert.update({
            where: { id: alert.id },
            data: { last_triggered_at: new Date() },
          });
        }
      } catch (err) {
        // Log and continue — don't fail all alerts because one errored
        this.logger.error(
          '[checkThresholds] alert check failed',
          err instanceof Error ? err.stack : String(err),
        );
      }
    }

    return results;
  }

  private async getMetricValue(tenantId: string, metric: string): Promise<number> {
    const kpi = await this.unifiedDashboard.getKpiDashboard(tenantId);

    switch (metric) {
      case 'attendance_rate':
        return kpi.attendance_rate ?? 0;
      case 'collection_rate':
        return kpi.fee_collection_rate ?? 0;
      case 'overdue_invoice_count':
        return kpi.overdue_invoices_count;
      case 'at_risk_student_count':
        return kpi.at_risk_students_count;
      case 'average_grade':
        return kpi.average_grade ?? 0;
      case 'staff_absence_rate':
        return kpi.active_staff_count > 0
          ? 100 - (kpi.active_staff_count / Math.max(1, kpi.active_staff_count)) * 100
          : 0;
      default:
        return 0;
    }
  }

  private evaluate(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case 'lt':
        return value < threshold;
      case 'gt':
        return value > threshold;
      case 'eq':
        return Math.abs(value - threshold) < 0.001;
      default:
        return false;
    }
  }

  private toRow(a: {
    id: string;
    name: string;
    metric: string;
    operator: string;
    threshold: unknown;
    check_frequency: string;
    notification_recipients_json: unknown;
    active: boolean;
    last_triggered_at: Date | null;
    created_by_user_id: string;
    created_at: Date;
    updated_at: Date;
  }): ReportAlertRow {
    return {
      id: a.id,
      name: a.name,
      metric: a.metric,
      operator: a.operator,
      threshold: Number(a.threshold),
      check_frequency: a.check_frequency,
      notification_recipients_json: a.notification_recipients_json,
      active: a.active,
      last_triggered_at: a.last_triggered_at?.toISOString() ?? null,
      created_by_user_id: a.created_by_user_id,
      created_at: a.created_at.toISOString(),
      updated_at: a.updated_at.toISOString(),
    };
  }
}
