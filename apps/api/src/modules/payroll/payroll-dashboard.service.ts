import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PayrollDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(tenantId: string) {
    // Get latest run (any status except cancelled)
    const latestRun = await this.prisma.payrollRun.findFirst({
      where: {
        tenant_id: tenantId,
        status: { not: 'cancelled' },
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        period_label: true,
        period_month: true,
        period_year: true,
        status: true,
        total_basic_pay: true,
        total_bonus_pay: true,
        total_pay: true,
        headcount: true,
        created_at: true,
        finalised_at: true,
      },
    });

    // Get stats from latest finalised run
    const latestFinalised = await this.prisma.payrollRun.findFirst({
      where: {
        tenant_id: tenantId,
        status: 'finalised',
      },
      orderBy: { finalised_at: 'desc' },
      select: {
        id: true,
        period_label: true,
        period_month: true,
        period_year: true,
        total_basic_pay: true,
        total_bonus_pay: true,
        total_pay: true,
        headcount: true,
        finalised_at: true,
      },
    });

    // Cost trend: last 6 finalised runs
    const costTrendRuns = await this.prisma.payrollRun.findMany({
      where: {
        tenant_id: tenantId,
        status: 'finalised',
      },
      orderBy: [{ period_year: 'desc' }, { period_month: 'desc' }],
      take: 6,
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

    // Reverse to chronological order
    costTrendRuns.reverse();

    // Incomplete entries from current draft run
    let incompleteEntries: Array<Record<string, unknown>> = [];
    const currentDraft = await this.prisma.payrollRun.findFirst({
      where: {
        tenant_id: tenantId,
        status: 'draft',
      },
      orderBy: { created_at: 'desc' },
    });

    if (currentDraft) {
      const entries = await this.prisma.payrollEntry.findMany({
        where: {
          tenant_id: tenantId,
          payroll_run_id: currentDraft.id,
          OR: [
            { compensation_type: 'salaried', days_worked: null },
            { compensation_type: 'per_class', classes_taught: null },
          ],
        },
        include: {
          staff_profile: {
            select: {
              id: true,
              staff_number: true,
              user: {
                select: {
                  first_name: true,
                  last_name: true,
                },
              },
            },
          },
        },
        take: 20,
      });

      incompleteEntries = entries.map((e) => ({
        id: e.id,
        staff_name: `${e.staff_profile.user.first_name} ${e.staff_profile.user.last_name}`,
        staff_number: e.staff_profile.staff_number,
        compensation_type: e.compensation_type,
        missing_field: e.compensation_type === 'salaried' ? 'days_worked' : 'classes_taught',
      }));
    }

    return {
      latest_run: latestRun
        ? {
            ...latestRun,
            total_basic_pay: Number(latestRun.total_basic_pay),
            total_bonus_pay: Number(latestRun.total_bonus_pay),
            total_pay: Number(latestRun.total_pay),
          }
        : null,
      latest_finalised: latestFinalised
        ? {
            ...latestFinalised,
            total_basic_pay: Number(latestFinalised.total_basic_pay),
            total_bonus_pay: Number(latestFinalised.total_bonus_pay),
            total_pay: Number(latestFinalised.total_pay),
          }
        : null,
      cost_trend: costTrendRuns.map((r) => ({
        period_month: r.period_month,
        period_year: r.period_year,
        period_label: r.period_label,
        total_basic_pay: Number(r.total_basic_pay),
        total_bonus_pay: Number(r.total_bonus_pay),
        total_pay: Number(r.total_pay),
        headcount: r.headcount,
      })),
      incomplete_entries: incompleteEntries,
      current_draft_id: currentDraft?.id ?? null,
    };
  }
}
