import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface CostBreakdown {
  period_month: number;
  period_year: number;
  period_label: string;
  gross_basic: number;
  gross_bonus: number;
  allowances_total: number;
  gross_total: number;
  headcount: number;
}

export interface DepartmentCost {
  department: string;
  staff_count: number;
  total_pay: number;
  avg_pay: number;
}

export interface VarianceItem {
  staff_profile_id: string;
  staff_name: string;
  previous_total: number;
  current_total: number;
  variance: number;
  variance_pct: number;
  reason: 'new_staff' | 'departed' | 'changed' | 'unchanged';
}

export interface StaffCostForecastPoint {
  period_label: string;
  period_month: number;
  period_year: number;
  projected_total: number;
  projected_headcount: number;
}

@Injectable()
export class PayrollAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCostDashboard(tenantId: string, months = 6) {
    const now = new Date();
    const fromDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    const runs = await this.prisma.payrollRun.findMany({
      where: {
        tenant_id: tenantId,
        status: 'finalised',
        OR: [
          { period_year: { gt: fromDate.getFullYear() } },
          {
            period_year: fromDate.getFullYear(),
            period_month: { gte: fromDate.getMonth() + 1 },
          },
        ],
      },
      orderBy: [{ period_year: 'asc' }, { period_month: 'asc' }],
    });

    const trend: CostBreakdown[] = runs.map((r) => ({
      period_month: r.period_month,
      period_year: r.period_year,
      period_label: r.period_label,
      gross_basic: Number(r.total_basic_pay),
      gross_bonus: Number(r.total_bonus_pay),
      allowances_total: 0, // will be enriched when allowances roll up into run totals
      gross_total: Number(r.total_pay),
      headcount: r.headcount,
    }));

    // Active staff count (current)
    const activeStaff = await this.prisma.staffProfile.count({
      where: { tenant_id: tenantId, employment_status: 'active' },
    });

    // Cost by department from latest run
    const latestRun = runs.at(-1);
    let departmentBreakdown: DepartmentCost[] = [];

    if (latestRun) {
      const entries = await this.prisma.payrollEntry.findMany({
        where: { payroll_run_id: latestRun.id, tenant_id: tenantId },
        include: {
          staff_profile: {
            select: { department: true },
          },
        },
      });

      const deptMap = new Map<string, { count: number; total: number }>();

      for (const entry of entries) {
        const dept = entry.staff_profile.department ?? 'Unassigned';
        const pay = entry.override_total_pay != null
          ? Number(entry.override_total_pay)
          : Number(entry.total_pay);

        const existing = deptMap.get(dept);
        if (existing) {
          existing.count++;
          existing.total += pay;
        } else {
          deptMap.set(dept, { count: 1, total: pay });
        }
      }

      departmentBreakdown = Array.from(deptMap.entries()).map(([dept, stats]) => ({
        department: dept,
        staff_count: stats.count,
        total_pay: Number(stats.total.toFixed(2)),
        avg_pay: Number((stats.total / stats.count).toFixed(2)),
      }));
    }

    return {
      trend,
      department_breakdown: departmentBreakdown,
      active_staff_count: activeStaff,
      latest_run_id: latestRun?.id ?? null,
    };
  }

  async getVarianceReport(tenantId: string, runId: string): Promise<{
    run_id: string;
    previous_run_id: string | null;
    items: VarianceItem[];
    summary: { total_current: number; total_previous: number; total_variance: number };
  }> {
    const currentRun = await this.prisma.payrollRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
      include: {
        entries: {
          include: {
            staff_profile: {
              select: {
                id: true,
                user: { select: { first_name: true, last_name: true } },
              },
            },
          },
        },
      },
    });

    if (!currentRun) {
      return {
        run_id: runId,
        previous_run_id: null,
        items: [],
        summary: { total_current: 0, total_previous: 0, total_variance: 0 },
      };
    }

    // Find previous finalised run
    const previousRun = await this.prisma.payrollRun.findFirst({
      where: {
        tenant_id: tenantId,
        status: 'finalised',
        OR: [
          { period_year: { lt: currentRun.period_year } },
          {
            period_year: currentRun.period_year,
            period_month: { lt: currentRun.period_month },
          },
        ],
      },
      orderBy: [{ period_year: 'desc' }, { period_month: 'desc' }],
      include: {
        entries: {
          include: {
            staff_profile: {
              select: {
                id: true,
                user: { select: { first_name: true, last_name: true } },
              },
            },
          },
        },
      },
    });

    const currentMap = new Map<string, { name: string; total: number }>();
    for (const e of currentRun.entries) {
      const total = e.override_total_pay != null ? Number(e.override_total_pay) : Number(e.total_pay);
      currentMap.set(e.staff_profile_id, {
        name: `${e.staff_profile.user.first_name} ${e.staff_profile.user.last_name}`,
        total,
      });
    }

    const previousMap = new Map<string, number>();
    if (previousRun) {
      for (const e of previousRun.entries) {
        const total = e.override_total_pay != null ? Number(e.override_total_pay) : Number(e.total_pay);
        previousMap.set(e.staff_profile_id, total);
      }
    }

    const items: VarianceItem[] = [];

    // Current run staff
    for (const [staffId, current] of currentMap.entries()) {
      const prev = previousMap.get(staffId) ?? null;
      const prevTotal = prev ?? 0;
      const variance = Number((current.total - prevTotal).toFixed(2));
      const variancePct = prevTotal > 0 ? Number(((variance / prevTotal) * 100).toFixed(1)) : 0;

      let reason: VarianceItem['reason'] = 'unchanged';
      if (prev === null) reason = 'new_staff';
      else if (Math.abs(variance) > 0.01) reason = 'changed';

      items.push({
        staff_profile_id: staffId,
        staff_name: current.name,
        previous_total: prevTotal,
        current_total: current.total,
        variance,
        variance_pct: variancePct,
        reason,
      });
    }

    // Departed staff (in previous but not current)
    if (previousRun) {
      for (const e of previousRun.entries) {
        if (!currentMap.has(e.staff_profile_id)) {
          const prevTotal = Number(e.override_total_pay ?? e.total_pay);
          items.push({
            staff_profile_id: e.staff_profile_id,
            staff_name: `${e.staff_profile.user.first_name} ${e.staff_profile.user.last_name}`,
            previous_total: prevTotal,
            current_total: 0,
            variance: Number((-prevTotal).toFixed(2)),
            variance_pct: -100,
            reason: 'departed',
          });
        }
      }
    }

    const totalCurrent = items.reduce((s, i) => s + i.current_total, 0);
    const totalPrevious = items.reduce((s, i) => s + i.previous_total, 0);

    return {
      run_id: runId,
      previous_run_id: previousRun?.id ?? null,
      items,
      summary: {
        total_current: Number(totalCurrent.toFixed(2)),
        total_previous: Number(totalPrevious.toFixed(2)),
        total_variance: Number((totalCurrent - totalPrevious).toFixed(2)),
      },
    };
  }

  async getMonthOverMonth(tenantId: string, runId: string) {
    return this.getVarianceReport(tenantId, runId);
  }

  async getStaffCostForecast(
    tenantId: string,
    months = 6,
  ): Promise<StaffCostForecastPoint[]> {
    // Base: latest finalised run's total
    const latestRun = await this.prisma.payrollRun.findFirst({
      where: { tenant_id: tenantId, status: 'finalised' },
      orderBy: [{ period_year: 'desc' }, { period_month: 'desc' }],
    });

    if (!latestRun) {
      return [];
    }

    const baseTotal = Number(latestRun.total_pay);
    const baseHeadcount = latestRun.headcount;

    // Simple linear forecast: assume same pay next N months
    // In production this would factor in departures, hires, allowance changes
    const forecast: StaffCostForecastPoint[] = [];
    let forecastYear = latestRun.period_year;
    let forecastMonth = latestRun.period_month;

    for (let i = 0; i < months; i++) {
      forecastMonth++;
      if (forecastMonth > 12) {
        forecastMonth = 1;
        forecastYear++;
      }

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      forecast.push({
        period_label: `${monthNames[forecastMonth - 1]} ${forecastYear}`,
        period_month: forecastMonth,
        period_year: forecastYear,
        projected_total: baseTotal,
        projected_headcount: baseHeadcount,
      });
    }

    return forecast;
  }
}
