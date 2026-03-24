import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { CreateBoardReportDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { AiReportNarratorService } from './ai-report-narrator.service';
import { UnifiedDashboardService } from './unified-dashboard.service';

export interface BoardReportRow {
  id: string;
  title: string;
  academic_period_id: string | null;
  report_type: string;
  sections_json: unknown;
  generated_at: string;
  generated_by_user_id: string;
  file_url: string | null;
  created_at: string;
}

@Injectable()
export class BoardReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly unifiedDashboard: UnifiedDashboardService,
    private readonly aiNarrator: AiReportNarratorService,
  ) {}

  async listBoardReports(
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: BoardReportRow[]; meta: { page: number; pageSize: number; total: number } }> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;
      const skip = (page - 1) * pageSize;

      const [reports, total] = await Promise.all([
        txClient.boardReport.findMany({
          where: { tenant_id: tenantId },
          orderBy: { generated_at: 'desc' },
          skip,
          take: pageSize,
        }),
        txClient.boardReport.count({ where: { tenant_id: tenantId } }),
      ]);

      return {
        data: reports.map((r) => this.toRow(r)),
        meta: { page, pageSize, total },
      };
    }) as unknown as { data: BoardReportRow[]; meta: { page: number; pageSize: number; total: number } };
  }

  async getBoardReport(tenantId: string, reportId: string): Promise<BoardReportRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const report = await txClient.boardReport.findFirst({
        where: { id: reportId, tenant_id: tenantId },
      });

      if (!report) {
        throw new NotFoundException({
          code: 'BOARD_REPORT_NOT_FOUND',
          message: `Board report with id "${reportId}" not found`,
        });
      }

      return this.toRow(report);
    }) as unknown as BoardReportRow;
  }

  async generateBoardReport(
    tenantId: string,
    userId: string,
    dto: CreateBoardReportDto,
  ): Promise<BoardReportRow & { executive_summary: string | null }> {
    // Collect data for requested sections
    const kpiData = await this.unifiedDashboard.getKpiDashboard(tenantId);

    // Generate AI executive summary
    let executiveSummary: string | null = null;
    try {
      executiveSummary = await this.aiNarrator.generateNarrative(
        { kpis: kpiData, sections: dto.sections_json, report_type: dto.report_type },
        'board_report',
      );
    } catch {
      // AI is best-effort; don't fail the report generation
      executiveSummary = null;
    }

    const sectionsJson = JSON.parse(JSON.stringify({
      sections: dto.sections_json,
      kpi_snapshot: kpiData,
      executive_summary: executiveSummary,
    })) as Prisma.InputJsonValue;

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const report = await (prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      return txClient.boardReport.create({
        data: {
          tenant_id: tenantId,
          title: dto.title,
          academic_period_id: dto.academic_period_id ?? null,
          report_type: dto.report_type,
          sections_json: sectionsJson,
          generated_at: new Date(),
          generated_by_user_id: userId,
          file_url: null,
        },
      });
    }) as unknown as Promise<{
      id: string;
      title: string;
      academic_period_id: string | null;
      report_type: string;
      sections_json: unknown;
      generated_at: Date;
      generated_by_user_id: string;
      file_url: string | null;
      created_at: Date;
    }>);

    return {
      ...this.toRow(report),
      executive_summary: executiveSummary,
    };
  }

  async deleteBoardReport(tenantId: string, reportId: string): Promise<void> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const existing = await txClient.boardReport.findFirst({
        where: { id: reportId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'BOARD_REPORT_NOT_FOUND',
          message: `Board report with id "${reportId}" not found`,
        });
      }

      await txClient.boardReport.delete({ where: { id: reportId } });
    });
  }

  private toRow(r: {
    id: string;
    title: string;
    academic_period_id: string | null;
    report_type: string;
    sections_json: unknown;
    generated_at: Date;
    generated_by_user_id: string;
    file_url: string | null;
    created_at: Date;
  }): BoardReportRow {
    return {
      id: r.id,
      title: r.title,
      academic_period_id: r.academic_period_id,
      report_type: r.report_type,
      sections_json: r.sections_json,
      generated_at: r.generated_at.toISOString(),
      generated_by_user_id: r.generated_by_user_id,
      file_url: r.file_url,
      created_at: r.created_at.toISOString(),
    };
  }
}
