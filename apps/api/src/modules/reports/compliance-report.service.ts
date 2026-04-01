import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { CreateComplianceTemplateDto, UpdateComplianceTemplateDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { ReportsDataAccessService } from './reports-data-access.service';

export interface ComplianceTemplateRow {
  id: string;
  name: string;
  country_code: string;
  fields_json: unknown;
  created_at: string;
  updated_at: string;
}

export interface PopulatedComplianceReport {
  template: ComplianceTemplateRow;
  data: Record<string, unknown>;
  gaps: string[];
}

@Injectable()
export class ComplianceReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataAccess: ReportsDataAccessService,
  ) {}

  async listTemplates(tenantId: string): Promise<ComplianceTemplateRow[]> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const templates = await txClient.complianceReportTemplate.findMany({
        where: { tenant_id: tenantId },
        orderBy: { name: 'asc' },
      });

      return templates.map((t) => this.toRow(t));
    }) as unknown as ComplianceTemplateRow[];
  }

  async getTemplate(tenantId: string, templateId: string): Promise<ComplianceTemplateRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const template = await txClient.complianceReportTemplate.findFirst({
        where: { id: templateId, tenant_id: tenantId },
      });

      if (!template) {
        throw new NotFoundException({
          code: 'COMPLIANCE_TEMPLATE_NOT_FOUND',
          message: `Compliance template with id "${templateId}" not found`,
        });
      }

      return this.toRow(template);
    }) as unknown as ComplianceTemplateRow;
  }

  async createTemplate(
    tenantId: string,
    dto: CreateComplianceTemplateDto,
  ): Promise<ComplianceTemplateRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const template = await txClient.complianceReportTemplate.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          country_code: dto.country_code,
          fields_json: dto.fields_json as Prisma.InputJsonValue,
        },
      });

      return this.toRow(template);
    }) as unknown as ComplianceTemplateRow;
  }

  async updateTemplate(
    tenantId: string,
    templateId: string,
    dto: UpdateComplianceTemplateDto,
  ): Promise<ComplianceTemplateRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const existing = await txClient.complianceReportTemplate.findFirst({
        where: { id: templateId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'COMPLIANCE_TEMPLATE_NOT_FOUND',
          message: `Compliance template with id "${templateId}" not found`,
        });
      }

      const updated = await txClient.complianceReportTemplate.update({
        where: { id: templateId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.country_code !== undefined && { country_code: dto.country_code }),
          ...(dto.fields_json !== undefined && {
            fields_json: dto.fields_json as Prisma.InputJsonValue,
          }),
        },
      });

      return this.toRow(updated);
    }) as unknown as ComplianceTemplateRow;
  }

  async deleteTemplate(tenantId: string, templateId: string): Promise<void> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const existing = await txClient.complianceReportTemplate.findFirst({
        where: { id: templateId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'COMPLIANCE_TEMPLATE_NOT_FOUND',
          message: `Compliance template with id "${templateId}" not found`,
        });
      }

      await txClient.complianceReportTemplate.delete({ where: { id: templateId } });
    });
  }

  async autoPopulate(tenantId: string, templateId: string): Promise<PopulatedComplianceReport> {
    const template = await this.getTemplate(tenantId, templateId);
    const fields = template.fields_json as Array<{ key: string; label: string; data_type: string }>;

    const data: Record<string, unknown> = {};
    const gaps: string[] = [];

    // Auto-populate known field keys via data access facade (cross-module reads)
    const [activeStudents, activeStaff, attendanceStats] = await Promise.all([
      this.dataAccess.countStudents(tenantId, { status: 'active' }),
      this.dataAccess.countStaff(tenantId, { employment_status: 'active' }),
      this.dataAccess.groupAttendanceRecordsBy(tenantId, ['status']),
    ]);

    const typedAttStats = attendanceStats as Array<{ status: string; _count: number }>;
    const totalAtt = typedAttStats.reduce((s, g) => s + g._count, 0);
    const presentAtt = typedAttStats
      .filter((g) => g.status === 'present' || g.status === 'late')
      .reduce((s, g) => s + g._count, 0);
    const attendanceRate = totalAtt > 0 ? (presentAtt / totalAtt) * 100 : 0;

    const autoPopulateMap: Record<string, unknown> = {
      active_student_count: activeStudents,
      active_staff_count: activeStaff,
      school_attendance_rate: Number(attendanceRate.toFixed(2)),
    };

    for (const field of fields) {
      if (field.key in autoPopulateMap) {
        data[field.key] = autoPopulateMap[field.key];
      } else {
        gaps.push(field.key);
      }
    }

    return { template, data, gaps };
  }

  private toRow(t: {
    id: string;
    name: string;
    country_code: string;
    fields_json: unknown;
    created_at: Date;
    updated_at: Date;
  }): ComplianceTemplateRow {
    return {
      id: t.id,
      name: t.name,
      country_code: t.country_code,
      fields_json: t.fields_json,
      created_at: t.created_at.toISOString(),
      updated_at: t.updated_at.toISOString(),
    };
  }
}
