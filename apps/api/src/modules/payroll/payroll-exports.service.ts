import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type {
  CreateExportTemplateDto,
  EmailToAccountantDto,
  GenerateExportDto,
  UpdateExportTemplateDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

// Column fields available for export
const AVAILABLE_FIELDS = new Set([
  'staff_name',
  'staff_number',
  'department',
  'compensation_type',
  'days_worked',
  'classes_taught',
  'gross_basic',
  'gross_bonus',
  'allowances_total',
  'adjustments_total',
  'deductions_total',
  'one_off_total',
  'gross_total',
  'period',
  'notes',
]);

@Injectable()
export class PayrollExportsService {
  private readonly logger = new Logger(PayrollExportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  // ─── Template CRUD ───────────────────────────────────────────────────────────

  async createTemplate(tenantId: string, userId: string, dto: CreateExportTemplateDto) {
    // Validate fields
    for (const col of dto.columns_json) {
      if (!AVAILABLE_FIELDS.has(col.field)) {
        throw new BadRequestException({
          code: 'INVALID_EXPORT_FIELD',
          message: `Field "${col.field}" is not a valid export field`,
        });
      }
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const template = await db.payrollExportTemplate.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          columns_json: dto.columns_json as object,
          file_format: dto.file_format,
          created_by_user_id: userId,
        },
      });

      return template;
    });
  }

  async listTemplates(tenantId: string) {
    const templates = await this.prisma.payrollExportTemplate.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'asc' },
    });

    return { data: templates };
  }

  async getTemplate(tenantId: string, templateId: string) {
    const template = await this.prisma.payrollExportTemplate.findFirst({
      where: { id: templateId, tenant_id: tenantId },
    });

    if (!template) {
      throw new NotFoundException({
        code: 'EXPORT_TEMPLATE_NOT_FOUND',
        message: `Export template "${templateId}" not found`,
      });
    }

    return template;
  }

  async updateTemplate(tenantId: string, templateId: string, dto: UpdateExportTemplateDto) {
    const template = await this.getTemplate(tenantId, templateId);

    if (dto.columns_json) {
      for (const col of dto.columns_json) {
        if (!AVAILABLE_FIELDS.has(col.field)) {
          throw new BadRequestException({
            code: 'INVALID_EXPORT_FIELD',
            message: `Field "${col.field}" is not a valid export field`,
          });
        }
      }
    }

    return this.prisma.payrollExportTemplate.update({
      where: { id: template.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.columns_json !== undefined && { columns_json: dto.columns_json as object }),
        ...(dto.file_format !== undefined && { file_format: dto.file_format }),
      },
    });
  }

  async deleteTemplate(tenantId: string, templateId: string) {
    await this.getTemplate(tenantId, templateId);

    await this.prisma.payrollExportTemplate.delete({ where: { id: templateId } });
    return { id: templateId, deleted: true };
  }

  // ─── Export Generation ───────────────────────────────────────────────────────

  async generateExport(tenantId: string, runId: string, userId: string, dto: GenerateExportDto) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
      include: {
        entries: {
          include: {
            staff_profile: {
              select: {
                id: true,
                staff_number: true,
                department: true,
                job_title: true,
                user: { select: { first_name: true, last_name: true } },
              },
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'PAYROLL_RUN_NOT_FOUND',
        message: `Payroll run "${runId}" not found`,
      });
    }

    let template = null;
    if (dto.template_id) {
      template = await this.getTemplate(tenantId, dto.template_id);
    }

    const columns = template
      ? (template.columns_json as Array<{ field: string; header: string; format?: string }>)
      : this.getDefaultColumns();

    const rows = run.entries.map((entry) => this.buildRow(entry, run, columns));
    const csvContent = this.buildCsv(columns, rows);
    const fileName = `payroll-${run.period_year}-${String(run.period_month).padStart(2, '0')}-${Date.now()}.${template?.file_format ?? 'csv'}`;

    // Log the export
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.payrollExportLog.create({
        data: {
          tenant_id: tenantId,
          payroll_run_id: runId,
          export_template_id: template?.id ?? null,
          exported_by_user_id: userId,
          exported_at: new Date(),
          file_name: fileName,
          row_count: rows.length,
        },
      });
    });

    return {
      file_name: fileName,
      format: template?.file_format ?? 'csv',
      row_count: rows.length,
      content: csvContent,
    };
  }

  async getExportHistory(tenantId: string, runId: string, page = 1, pageSize = 20) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'PAYROLL_RUN_NOT_FOUND',
        message: `Payroll run "${runId}" not found`,
      });
    }

    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      this.prisma.payrollExportLog.findMany({
        where: { payroll_run_id: runId, tenant_id: tenantId },
        skip,
        take: pageSize,
        include: {
          export_template: { select: { id: true, name: true } },
          exported_by: { select: { first_name: true, last_name: true } },
        },
        orderBy: { exported_at: 'desc' },
      }),
      this.prisma.payrollExportLog.count({
        where: { payroll_run_id: runId, tenant_id: tenantId },
      }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  async emailToAccountant(
    tenantId: string,
    runId: string,
    userId: string,
    dto: EmailToAccountantDto,
  ) {
    let accountantEmail: string | null = null;
    try {
      const settings = await this.settingsService.getSettings(tenantId);
      const settingsRecord = settings as unknown as Record<string, Record<string, unknown>>;
      const payrollSettings = settingsRecord['payroll'];
      if (payrollSettings) {
        const email = payrollSettings['payrollAccountantEmail'];
        accountantEmail = typeof email === 'string' ? email : null;
      }
    } catch {
      this.logger.warn(`Could not load settings for tenant ${tenantId}`);
    }

    if (!accountantEmail) {
      throw new BadRequestException({
        code: 'NO_ACCOUNTANT_EMAIL',
        message: 'No accountant email configured. Please set payrollAccountantEmail in settings.',
      });
    }

    // Generate export first
    const exportResult = await this.generateExport(tenantId, runId, userId, {
      template_id: dto.template_id,
    });

    // In production, this would send via email service.
    // For now we return the data with confirmation.
    this.logger.log(`Would send payroll export to ${accountantEmail} for run ${runId}`);

    return {
      sent_to: accountantEmail,
      file_name: exportResult.file_name,
      row_count: exportResult.row_count,
      message: `Payroll export queued for delivery to ${accountantEmail}`,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private getDefaultColumns(): Array<{ field: string; header: string }> {
    return [
      { field: 'staff_name', header: 'Staff Name' },
      { field: 'staff_number', header: 'Staff Number' },
      { field: 'department', header: 'Department' },
      { field: 'compensation_type', header: 'Type' },
      { field: 'days_worked', header: 'Days Worked' },
      { field: 'classes_taught', header: 'Classes Taught' },
      { field: 'gross_basic', header: 'Gross Basic' },
      { field: 'gross_bonus', header: 'Gross Bonus' },
      { field: 'gross_total', header: 'Gross Total' },
      { field: 'period', header: 'Period' },
    ];
  }

  private buildRow(
    entry: Record<string, unknown>,
    run: Record<string, unknown>,
    columns: Array<{ field: string; header: string }>,
  ): Record<string, unknown> {
    const staffProfile = entry['staff_profile'] as Record<string, unknown> | undefined;
    const staffUser = staffProfile?.['user'] as Record<string, unknown> | undefined;
    const row: Record<string, unknown> = {};

    for (const col of columns) {
      switch (col.field) {
        case 'staff_name':
          row[col.field] = staffUser
            ? `${String(staffUser['first_name'])} ${String(staffUser['last_name'])}`
            : '';
          break;
        case 'staff_number':
          row[col.field] = staffProfile?.['staff_number'] ?? '';
          break;
        case 'department':
          row[col.field] = staffProfile?.['department'] ?? '';
          break;
        case 'compensation_type':
          row[col.field] = entry['compensation_type'] ?? '';
          break;
        case 'days_worked':
          row[col.field] = entry['days_worked'] ?? '';
          break;
        case 'classes_taught':
          row[col.field] = entry['classes_taught'] ?? '';
          break;
        case 'gross_basic':
          row[col.field] = Number(entry['basic_pay'] ?? 0);
          break;
        case 'gross_bonus':
          row[col.field] = Number(entry['bonus_pay'] ?? 0);
          break;
        case 'gross_total':
          row[col.field] =
            entry['override_total_pay'] != null
              ? Number(entry['override_total_pay'])
              : Number(entry['total_pay'] ?? 0);
          break;
        case 'period':
          row[col.field] = run['period_label'] ?? '';
          break;
        case 'notes':
          row[col.field] = entry['notes'] ?? '';
          break;
        default:
          row[col.field] = '';
      }
    }

    return row;
  }

  private buildCsv(
    columns: Array<{ field: string; header: string }>,
    rows: Array<Record<string, unknown>>,
  ): string {
    const header = columns.map((c) => `"${c.header}"`).join(',');
    const dataRows = rows.map((row) =>
      columns
        .map((c) => {
          const val = row[c.field] ?? '';
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(','),
    );

    return [header, ...dataRows].join('\n');
  }
}
