import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { PayrollAnomalyService } from './payroll-anomaly.service';
import { PayrollCalendarService } from './payroll-calendar.service';

@Injectable()
export class PayrollDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly anomalyService: PayrollAnomalyService,
    private readonly calendarService: PayrollCalendarService,
  ) {}

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

    // ─── Wave 3 — anomalies + calendar ─────────────────────────────────
    //
    // The redesigned dashboard reads `data.anomalies` and
    // `data.payroll_calendar` directly. We surface a small slice of each
    // (most recent first) so the dashboard renders without a follow-up
    // round-trip.

    type AnomalyResult = Awaited<ReturnType<PayrollAnomalyService['scanForAnomalies']>>;
    let anomalies: AnomalyResult['anomalies'] = [];
    if (latestRun?.id) {
      try {
        const scan = await this.anomalyService.scanForAnomalies(tenantId, latestRun.id);
        anomalies = scan.anomalies.slice(0, 5);
      } catch (err) {
        // Anomaly scan is best-effort: a failure must not break the dashboard.
        // eslint-disable-next-line no-console -- background fetch fallback per CLAUDE.md
        console.error('[payroll-dashboard.anomalies]', err);
        anomalies = [];
      }
    }

    let payrollCalendar: { next_pay_date: Date | null; preparation_due: boolean } = {
      next_pay_date: null,
      preparation_due: false,
    };
    try {
      const next = await this.calendarService.getNextPayDate(tenantId);
      const due = await this.calendarService.checkPreparationDeadline(tenantId);
      payrollCalendar = {
        next_pay_date:
          next && typeof next === 'object' && 'next_pay_date' in next
            ? ((next as Record<string, unknown>)['next_pay_date'] as Date | null)
            : null,
        preparation_due:
          due && typeof due === 'object' && 'preparation_due' in due
            ? Boolean((due as Record<string, unknown>)['preparation_due'])
            : false,
      };
    } catch (err) {
      // Calendar config may not exist yet for new tenants. Default values stand.
      // eslint-disable-next-line no-console -- background fetch fallback per CLAUDE.md
      console.error('[payroll-dashboard.calendar]', err);
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
      anomalies,
      payroll_calendar: payrollCalendar,
      current_draft_id: currentDraft?.id ?? null,
    };
  }
}
