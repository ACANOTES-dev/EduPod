import { Injectable, NotFoundException } from '@nestjs/common';

import type {
  CostTrendPoint,
  YtdStaffSummary,
  BonusAnalysisItem,
  StaffPaymentHistoryItem,
} from '@school/shared';

import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

@Injectable()
export class PayrollReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfRenderingService: PdfRenderingService,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  async getCostTrend(tenantId: string, year?: number): Promise<CostTrendPoint[]> {
    const currentYear = year ?? new Date().getFullYear();

    const runs = await this.prisma.payrollRun.findMany({
      where: {
        tenant_id: tenantId,
        status: 'finalised',
        period_year: currentYear,
      },
      orderBy: [{ period_year: 'asc' }, { period_month: 'asc' }],
      select: {
        period_month: true,
        period_year: true,
        period_label: true,
        total_basic_pay: true,
        total_bonus_pay: true,
        total_pay: true,
        headcount: true,
      },
    });

    return runs.map((r) => ({
      period_month: r.period_month,
      period_year: r.period_year,
      period_label: r.period_label,
      total_basic_pay: Number(r.total_basic_pay),
      total_bonus_pay: Number(r.total_bonus_pay),
      total_pay: Number(r.total_pay),
      headcount: r.headcount,
    }));
  }

  async getYtdSummary(
    tenantId: string,
    year?: number,
    page = 1,
    pageSize = 20,
  ): Promise<{ data: YtdStaffSummary[]; meta: { page: number; pageSize: number; total: number } }> {
    const currentYear = year ?? new Date().getFullYear();

    // Get all finalised entries for the year
    const entries = await this.prisma.payrollEntry.findMany({
      where: {
        tenant_id: tenantId,
        payroll_run: {
          status: 'finalised',
          period_year: currentYear,
        },
      },
      include: {
        staff_profile: {
          select: {
            id: true,
            user: {
              select: {
                first_name: true,
                last_name: true,
              },
            },
          },
        },
      },
    });

    // Aggregate per staff
    const staffMap = new Map<
      string,
      {
        staff_profile_id: string;
        staff_name: string;
        compensation_type: string;
        ytd_basic: number;
        ytd_bonus: number;
        ytd_total: number;
      }
    >();

    for (const entry of entries) {
      const key = entry.staff_profile_id;
      const existing = staffMap.get(key);

      if (existing) {
        existing.ytd_basic += Number(entry.basic_pay);
        existing.ytd_bonus += Number(entry.bonus_pay);
        existing.ytd_total += Number(entry.total_pay);
      } else {
        staffMap.set(key, {
          staff_profile_id: entry.staff_profile_id,
          staff_name: `${entry.staff_profile.user.first_name} ${entry.staff_profile.user.last_name}`,
          compensation_type: entry.compensation_type,
          ytd_basic: Number(entry.basic_pay),
          ytd_bonus: Number(entry.bonus_pay),
          ytd_total: Number(entry.total_pay),
        });
      }
    }

    const allStaff = Array.from(staffMap.values()).map((s) => ({
      ...s,
      ytd_basic: Number(s.ytd_basic.toFixed(2)),
      ytd_bonus: Number(s.ytd_bonus.toFixed(2)),
      ytd_total: Number(s.ytd_total.toFixed(2)),
    }));

    // Sort by ytd_total descending
    allStaff.sort((a, b) => b.ytd_total - a.ytd_total);

    const total = allStaff.length;
    const skip = (page - 1) * pageSize;
    const data = allStaff.slice(skip, skip + pageSize);

    return { data, meta: { page, pageSize, total } };
  }

  async getBonusAnalysis(tenantId: string, year?: number): Promise<BonusAnalysisItem[]> {
    const currentYear = year ?? new Date().getFullYear();

    const entries = await this.prisma.payrollEntry.findMany({
      where: {
        tenant_id: tenantId,
        payroll_run: {
          status: 'finalised',
          period_year: currentYear,
        },
        bonus_pay: { gt: 0 },
      },
      include: {
        staff_profile: {
          select: {
            id: true,
            user: {
              select: {
                first_name: true,
                last_name: true,
              },
            },
          },
        },
      },
    });

    // Aggregate per staff
    const staffMap = new Map<
      string,
      {
        staff_profile_id: string;
        staff_name: string;
        compensation_type: string;
        months_with_bonus: number;
        total_bonus_amount: number;
      }
    >();

    for (const entry of entries) {
      const key = entry.staff_profile_id;
      const existing = staffMap.get(key);

      if (existing) {
        existing.months_with_bonus++;
        existing.total_bonus_amount += Number(entry.bonus_pay);
      } else {
        staffMap.set(key, {
          staff_profile_id: entry.staff_profile_id,
          staff_name: `${entry.staff_profile.user.first_name} ${entry.staff_profile.user.last_name}`,
          compensation_type: entry.compensation_type,
          months_with_bonus: 1,
          total_bonus_amount: Number(entry.bonus_pay),
        });
      }
    }

    return Array.from(staffMap.values())
      .map((s) => ({
        ...s,
        total_bonus_amount: Number(s.total_bonus_amount.toFixed(2)),
        avg_bonus_per_month: Number((s.total_bonus_amount / s.months_with_bonus).toFixed(2)),
      }))
      .sort((a, b) => b.total_bonus_amount - a.total_bonus_amount);
  }

  async getMonthlySummary(tenantId: string, runId: string) {
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
                user: {
                  select: {
                    first_name: true,
                    last_name: true,
                  },
                },
              },
            },
          },
          orderBy: { created_at: 'asc' },
        },
      },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'PAYROLL_RUN_NOT_FOUND',
        message: `Payroll run with id "${runId}" not found`,
      });
    }

    return {
      run: {
        id: run.id,
        period_label: run.period_label,
        period_month: run.period_month,
        period_year: run.period_year,
        total_working_days: run.total_working_days,
        status: run.status,
        total_basic_pay: Number(run.total_basic_pay),
        total_bonus_pay: Number(run.total_bonus_pay),
        total_pay: Number(run.total_pay),
        headcount: run.headcount,
      },
      entries: run.entries.map((e) => ({
        id: e.id,
        staff_name: `${e.staff_profile.user.first_name} ${e.staff_profile.user.last_name}`,
        staff_number: e.staff_profile.staff_number,
        department: e.staff_profile.department,
        job_title: e.staff_profile.job_title,
        compensation_type: e.compensation_type,
        days_worked: e.days_worked,
        classes_taught: e.classes_taught,
        basic_pay: Number(e.basic_pay),
        bonus_pay: Number(e.bonus_pay),
        total_pay: Number(e.total_pay),
      })),
    };
  }

  async exportMonthlySummary(tenantId: string, runId: string, format: string) {
    const summary = await this.getMonthlySummary(tenantId, runId);

    if (format === 'csv') {
      return this.generateMonthlySummaryCsv(summary);
    }

    // PDF: wrap data in simple HTML table
    const branding = await this.tenantReadFacade.findBranding(tenantId);

    const pdfBranding = {
      school_name: branding?.school_name_display ?? 'School',
      school_name_ar: branding?.school_name_ar ?? undefined,
      logo_url: branding?.logo_url ?? undefined,
    };

    const html = this.generateMonthlySummaryHtml(summary, pdfBranding.school_name);

    return {
      format: 'pdf',
      html,
      data: summary,
    };
  }

  async exportYtdSummary(tenantId: string, year: number | undefined, format: string) {
    const currentYear = year ?? new Date().getFullYear();
    const result = await this.getYtdSummary(tenantId, currentYear, 1, 10000);

    if (format === 'csv') {
      return this.generateYtdSummaryCsv(result.data, currentYear);
    }

    return {
      format: 'pdf',
      data: result.data,
      year: currentYear,
    };
  }

  async getStaffPaymentHistory(
    tenantId: string,
    staffProfileId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{
    data: StaffPaymentHistoryItem[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const skip = (page - 1) * pageSize;

    const [entries, total] = await Promise.all([
      this.prisma.payrollEntry.findMany({
        where: {
          tenant_id: tenantId,
          staff_profile_id: staffProfileId,
          payroll_run: {
            status: 'finalised',
          },
        },
        skip,
        take: pageSize,
        orderBy: {
          payroll_run: { period_year: 'desc' },
        },
        include: {
          payroll_run: {
            select: {
              period_label: true,
              period_month: true,
              period_year: true,
            },
          },
          payslip: {
            select: { id: true },
          },
        },
      }),
      this.prisma.payrollEntry.count({
        where: {
          tenant_id: tenantId,
          staff_profile_id: staffProfileId,
          payroll_run: {
            status: 'finalised',
          },
        },
      }),
    ]);

    const data: StaffPaymentHistoryItem[] = entries.map((e) => ({
      payroll_entry_id: e.id,
      period_label: e.payroll_run.period_label,
      period_month: e.payroll_run.period_month,
      period_year: e.payroll_run.period_year,
      basic_pay: Number(e.basic_pay),
      bonus_pay: Number(e.bonus_pay),
      total_pay: Number(e.total_pay),
      payslip_id: e.payslip?.id ?? null,
    }));

    return { data, meta: { page, pageSize, total } };
  }

  private generateMonthlySummaryCsv(summary: {
    run: Record<string, unknown>;
    entries: Array<Record<string, unknown>>;
  }): { format: string; content: string; filename: string } {
    const headers = [
      'Staff Name',
      'Staff Number',
      'Department',
      'Job Title',
      'Compensation Type',
      'Days Worked',
      'Classes Taught',
      'Basic Pay',
      'Bonus Pay',
      'Total Pay',
    ];

    const rows = summary.entries.map((e) =>
      [
        e['staff_name'],
        e['staff_number'] ?? '',
        e['department'] ?? '',
        e['job_title'] ?? '',
        e['compensation_type'],
        e['days_worked'] ?? '',
        e['classes_taught'] ?? '',
        e['basic_pay'],
        e['bonus_pay'],
        e['total_pay'],
      ].join(','),
    );

    const content = [headers.join(','), ...rows].join('\n');
    const run = summary.run;
    const filename = `payroll-summary-${run['period_year']}-${String(run['period_month']).padStart(2, '0')}.csv`;

    return { format: 'csv', content, filename };
  }

  private generateYtdSummaryCsv(
    data: YtdStaffSummary[],
    year: number,
  ): { format: string; content: string; filename: string } {
    const headers = [
      'Staff Name',
      'Staff Profile ID',
      'Compensation Type',
      'YTD Basic',
      'YTD Bonus',
      'YTD Total',
    ];

    const rows = data.map((s) =>
      [
        s.staff_name,
        s.staff_profile_id,
        s.compensation_type,
        s.ytd_basic,
        s.ytd_bonus,
        s.ytd_total,
      ].join(','),
    );

    const content = [headers.join(','), ...rows].join('\n');
    return { format: 'csv', content, filename: `payroll-ytd-${year}.csv` };
  }

  private generateMonthlySummaryHtml(
    summary: { run: Record<string, unknown>; entries: Array<Record<string, unknown>> },
    schoolName: string,
  ): string {
    const run = summary.run;
    const rows = summary.entries
      .map(
        (e) => `
      <tr>
        <td>${String(e['staff_name'] ?? '')}</td>
        <td>${String(e['staff_number'] ?? '')}</td>
        <td>${String(e['department'] ?? '')}</td>
        <td>${String(e['compensation_type'] ?? '')}</td>
        <td style="text-align:right">${String(e['days_worked'] ?? '')}</td>
        <td style="text-align:right">${String(e['classes_taught'] ?? '')}</td>
        <td style="text-align:right">${String(e['basic_pay'] ?? '0')}</td>
        <td style="text-align:right">${String(e['bonus_pay'] ?? '0')}</td>
        <td style="text-align:right">${String(e['total_pay'] ?? '0')}</td>
      </tr>`,
      )
      .join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { font-size: 18px; }
    h2 { font-size: 14px; color: #555; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
    th { background-color: #f4f4f4; }
  </style>
</head>
<body>
  <h1>${schoolName} - Payroll Summary</h1>
  <h2>${String(run['period_label'])} (${String(run['period_month'])}/${String(run['period_year'])})</h2>
  <table>
    <thead>
      <tr>
        <th>Staff Name</th>
        <th>Staff Number</th>
        <th>Department</th>
        <th>Type</th>
        <th>Days Worked</th>
        <th>Classes Taught</th>
        <th>Basic Pay</th>
        <th>Bonus Pay</th>
        <th>Total Pay</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="6"><strong>Total</strong></td>
        <td style="text-align:right"><strong>${String(run['total_basic_pay'])}</strong></td>
        <td style="text-align:right"><strong>${String(run['total_bonus_pay'])}</strong></td>
        <td style="text-align:right"><strong>${String(run['total_pay'])}</strong></td>
      </tr>
    </tfoot>
  </table>
</body>
</html>`;
  }
}
