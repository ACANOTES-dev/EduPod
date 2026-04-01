import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { CreateSavedReportDto, UpdateSavedReportDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { ReportsDataAccessService } from './reports-data-access.service';

export interface SavedReportRow {
  id: string;
  name: string;
  data_source: string;
  dimensions_json: unknown;
  measures_json: unknown;
  filters_json: unknown;
  chart_type: string | null;
  is_shared: boolean;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class CustomReportBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataAccess: ReportsDataAccessService,
  ) {}

  async listSavedReports(
    tenantId: string,
    userId: string,
    includeShared: boolean,
    page: number,
    pageSize: number,
  ): Promise<{ data: SavedReportRow[]; meta: { page: number; pageSize: number; total: number } }> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const where: Record<string, unknown> = {
        tenant_id: tenantId,
      };

      if (!includeShared) {
        where.OR = [{ created_by_user_id: userId }, { is_shared: true }];
      }

      const skip = (page - 1) * pageSize;

      const [reports, total] = await Promise.all([
        txClient.savedReport.findMany({
          where,
          orderBy: { updated_at: 'desc' },
          skip,
          take: pageSize,
        }),
        txClient.savedReport.count({ where }),
      ]);

      return {
        data: reports.map((r) => ({
          id: r.id,
          name: r.name,
          data_source: r.data_source,
          dimensions_json: r.dimensions_json,
          measures_json: r.measures_json,
          filters_json: r.filters_json,
          chart_type: r.chart_type,
          is_shared: r.is_shared,
          created_by_user_id: r.created_by_user_id,
          created_at: r.created_at.toISOString(),
          updated_at: r.updated_at.toISOString(),
        })),
        meta: { page, pageSize, total },
      };
    }) as unknown as {
      data: SavedReportRow[];
      meta: { page: number; pageSize: number; total: number };
    };
  }

  async getSavedReport(tenantId: string, reportId: string): Promise<SavedReportRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const report = await txClient.savedReport.findFirst({
        where: { id: reportId, tenant_id: tenantId },
      });

      if (!report) {
        throw new NotFoundException({
          code: 'SAVED_REPORT_NOT_FOUND',
          message: `Saved report with id "${reportId}" not found`,
        });
      }

      return {
        id: report.id,
        name: report.name,
        data_source: report.data_source,
        dimensions_json: report.dimensions_json,
        measures_json: report.measures_json,
        filters_json: report.filters_json,
        chart_type: report.chart_type,
        is_shared: report.is_shared,
        created_by_user_id: report.created_by_user_id,
        created_at: report.created_at.toISOString(),
        updated_at: report.updated_at.toISOString(),
      };
    }) as unknown as SavedReportRow;
  }

  async createSavedReport(
    tenantId: string,
    userId: string,
    dto: CreateSavedReportDto,
  ): Promise<SavedReportRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      // Check for name uniqueness
      const existing = await txClient.savedReport.findFirst({
        where: { tenant_id: tenantId, name: dto.name },
      });

      if (existing) {
        throw new BadRequestException({
          code: 'SAVED_REPORT_NAME_TAKEN',
          message: `A saved report named "${dto.name}" already exists`,
        });
      }

      const report = await txClient.savedReport.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          data_source: dto.data_source,
          dimensions_json: dto.dimensions_json as Prisma.InputJsonValue,
          measures_json: dto.measures_json as Prisma.InputJsonValue,
          filters_json: (dto.filters_json ?? {}) as Prisma.InputJsonValue,
          chart_type: dto.chart_type ?? null,
          is_shared: dto.is_shared ?? false,
          created_by_user_id: userId,
        },
      });

      return {
        id: report.id,
        name: report.name,
        data_source: report.data_source,
        dimensions_json: report.dimensions_json,
        measures_json: report.measures_json,
        filters_json: report.filters_json,
        chart_type: report.chart_type,
        is_shared: report.is_shared,
        created_by_user_id: report.created_by_user_id,
        created_at: report.created_at.toISOString(),
        updated_at: report.updated_at.toISOString(),
      };
    }) as unknown as SavedReportRow;
  }

  async updateSavedReport(
    tenantId: string,
    reportId: string,
    dto: UpdateSavedReportDto,
  ): Promise<SavedReportRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const existing = await txClient.savedReport.findFirst({
        where: { id: reportId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'SAVED_REPORT_NOT_FOUND',
          message: `Saved report with id "${reportId}" not found`,
        });
      }

      // Check name uniqueness if name changed
      if (dto.name && dto.name !== existing.name) {
        const nameConflict = await txClient.savedReport.findFirst({
          where: { tenant_id: tenantId, name: dto.name },
        });
        if (nameConflict) {
          throw new BadRequestException({
            code: 'SAVED_REPORT_NAME_TAKEN',
            message: `A saved report named "${dto.name}" already exists`,
          });
        }
      }

      const updated = await txClient.savedReport.update({
        where: { id: reportId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.data_source !== undefined && { data_source: dto.data_source }),
          ...(dto.dimensions_json !== undefined && {
            dimensions_json: dto.dimensions_json as Prisma.InputJsonValue,
          }),
          ...(dto.measures_json !== undefined && {
            measures_json: dto.measures_json as Prisma.InputJsonValue,
          }),
          ...(dto.filters_json !== undefined && {
            filters_json: dto.filters_json as Prisma.InputJsonValue,
          }),
          ...(dto.chart_type !== undefined && { chart_type: dto.chart_type }),
          ...(dto.is_shared !== undefined && { is_shared: dto.is_shared }),
        },
      });

      return {
        id: updated.id,
        name: updated.name,
        data_source: updated.data_source,
        dimensions_json: updated.dimensions_json,
        measures_json: updated.measures_json,
        filters_json: updated.filters_json,
        chart_type: updated.chart_type,
        is_shared: updated.is_shared,
        created_by_user_id: updated.created_by_user_id,
        created_at: updated.created_at.toISOString(),
        updated_at: updated.updated_at.toISOString(),
      };
    }) as unknown as SavedReportRow;
  }

  async deleteSavedReport(tenantId: string, reportId: string): Promise<void> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const existing = await txClient.savedReport.findFirst({
        where: { id: reportId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'SAVED_REPORT_NOT_FOUND',
          message: `Saved report with id "${reportId}" not found`,
        });
      }

      await txClient.savedReport.delete({ where: { id: reportId } });
    });
  }

  async executeReport(
    tenantId: string,
    reportId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: unknown[]; meta: { page: number; pageSize: number; total: number } }> {
    const report = await this.getSavedReport(tenantId, reportId);

    // Execute a generic count/list query based on data_source
    // Full implementation requires a query builder — returns summarised data for now
    const skip = (page - 1) * pageSize;

    let data: unknown[] = [];
    let total = 0;

    switch (report.data_source) {
      case 'students': {
        const [students, count] = await Promise.all([
          this.dataAccess.findStudents(tenantId, {
            skip,
            take: pageSize,
            select: {
              id: true,
              first_name: true,
              last_name: true,
              status: true,
              gender: true,
              nationality: true,
            },
          }),
          this.dataAccess.countStudents(tenantId),
        ]);
        data = students;
        total = count;
        break;
      }
      case 'staff': {
        const [staff, count] = await Promise.all([
          this.dataAccess.findStaffProfiles(tenantId, {
            skip,
            take: pageSize,
            select: {
              id: true,
              job_title: true,
              department: true,
              employment_status: true,
              employment_type: true,
            },
          }),
          this.dataAccess.countStaff(tenantId),
        ]);
        data = staff;
        total = count;
        break;
      }
      case 'admissions': {
        const [apps, count] = await Promise.all([
          this.dataAccess.findApplications(tenantId, {
            skip,
            take: pageSize,
            select: {
              id: true,
              student_first_name: true,
              student_last_name: true,
              status: true,
              submitted_at: true,
            },
          }),
          this.dataAccess.countApplications(tenantId),
        ]);
        data = apps;
        total = count;
        break;
      }
      default: {
        data = [];
        total = 0;
      }
    }

    return { data, meta: { page, pageSize, total } };
  }
}
