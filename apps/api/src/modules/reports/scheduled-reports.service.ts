import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateScheduledReportDto,
  UpdateScheduledReportDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

export interface ScheduledReportRow {
  id: string;
  name: string;
  report_type: string;
  parameters_json: unknown;
  schedule_cron: string;
  recipient_emails: unknown;
  format: string;
  active: boolean;
  last_sent_at: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ScheduledReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: ScheduledReportRow[]; meta: { page: number; pageSize: number; total: number } }> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;
      const skip = (page - 1) * pageSize;

      const [reports, total] = await Promise.all([
        txClient.scheduledReport.findMany({
          where: { tenant_id: tenantId },
          orderBy: { created_at: 'desc' },
          skip,
          take: pageSize,
        }),
        txClient.scheduledReport.count({ where: { tenant_id: tenantId } }),
      ]);

      return {
        data: reports.map((r) => this.toRow(r)),
        meta: { page, pageSize, total },
      };
    }) as unknown as { data: ScheduledReportRow[]; meta: { page: number; pageSize: number; total: number } };
  }

  async get(tenantId: string, reportId: string): Promise<ScheduledReportRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const report = await txClient.scheduledReport.findFirst({
        where: { id: reportId, tenant_id: tenantId },
      });

      if (!report) {
        throw new NotFoundException({
          code: 'SCHEDULED_REPORT_NOT_FOUND',
          message: `Scheduled report with id "${reportId}" not found`,
        });
      }

      return this.toRow(report);
    }) as unknown as ScheduledReportRow;
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateScheduledReportDto,
  ): Promise<ScheduledReportRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const report = await txClient.scheduledReport.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          report_type: dto.report_type,
          parameters_json: dto.parameters_json as Prisma.InputJsonValue,
          schedule_cron: dto.schedule_cron,
          recipient_emails: dto.recipient_emails as Prisma.InputJsonValue,
          format: dto.format,
          active: dto.active ?? true,
          created_by_user_id: userId,
        },
      });

      return this.toRow(report);
    }) as unknown as ScheduledReportRow;
  }

  async update(
    tenantId: string,
    reportId: string,
    dto: UpdateScheduledReportDto,
  ): Promise<ScheduledReportRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const existing = await txClient.scheduledReport.findFirst({
        where: { id: reportId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'SCHEDULED_REPORT_NOT_FOUND',
          message: `Scheduled report with id "${reportId}" not found`,
        });
      }

      const updated = await txClient.scheduledReport.update({
        where: { id: reportId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.report_type !== undefined && { report_type: dto.report_type }),
          ...(dto.parameters_json !== undefined && { parameters_json: dto.parameters_json as Prisma.InputJsonValue }),
          ...(dto.schedule_cron !== undefined && { schedule_cron: dto.schedule_cron }),
          ...(dto.recipient_emails !== undefined && { recipient_emails: dto.recipient_emails as Prisma.InputJsonValue }),
          ...(dto.format !== undefined && { format: dto.format }),
          ...(dto.active !== undefined && { active: dto.active }),
        },
      });

      return this.toRow(updated);
    }) as unknown as ScheduledReportRow;
  }

  async delete(tenantId: string, reportId: string): Promise<void> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const existing = await txClient.scheduledReport.findFirst({
        where: { id: reportId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'SCHEDULED_REPORT_NOT_FOUND',
          message: `Scheduled report with id "${reportId}" not found`,
        });
      }

      await txClient.scheduledReport.delete({ where: { id: reportId } });
    });
  }

  /**
   * Called by the worker job `reports:scheduled-delivery`.
   * Returns all active scheduled reports that are due based on cron expression.
   * Actual cron evaluation happens in the worker — this just returns active ones.
   */
  async getDueReports(): Promise<ScheduledReportRow[]> {
    const reports = await this.prisma.scheduledReport.findMany({
      where: { active: true },
    });

    return reports.map((r) => this.toRow(r));
  }

  async markSent(reportId: string): Promise<void> {
    await this.prisma.scheduledReport.update({
      where: { id: reportId },
      data: { last_sent_at: new Date() },
    });
  }

  private toRow(r: {
    id: string;
    name: string;
    report_type: string;
    parameters_json: unknown;
    schedule_cron: string;
    recipient_emails: unknown;
    format: string;
    active: boolean;
    last_sent_at: Date | null;
    created_by_user_id: string;
    created_at: Date;
    updated_at: Date;
  }): ScheduledReportRow {
    return {
      id: r.id,
      name: r.name,
      report_type: r.report_type,
      parameters_json: r.parameters_json,
      schedule_cron: r.schedule_cron,
      recipient_emails: r.recipient_emails,
      format: r.format,
      active: r.active,
      last_sent_at: r.last_sent_at?.toISOString() ?? null,
      created_by_user_id: r.created_by_user_id,
      created_at: r.created_at.toISOString(),
      updated_at: r.updated_at.toISOString(),
    };
  }
}
