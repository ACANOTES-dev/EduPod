import { Injectable, Logger } from '@nestjs/common';

import type { ReportFilterDto } from '@school/shared/pastoral';

import type { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import type { SstActivityReportData } from './pastoral-report.service';

// ─── Helpers ───────────────────────────────────────────────────────────────

function defaultDateRange(filters: ReportFilterDto): { from: Date; to: Date } {
  const to = filters.to_date ? new Date(filters.to_date) : new Date();
  const from = filters.from_date
    ? new Date(filters.from_date)
    : new Date(to.getFullYear() - 1, to.getMonth(), to.getDate());
  return { from, to };
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0] ?? '';
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class PastoralReportSstActivityService {
  private readonly logger = new Logger(PastoralReportSstActivityService.name);

  constructor(private readonly eventService: PastoralEventService) {}

  // ─── Build SST Activity Report ────────────────────────────────────────────

  async build(
    db: PrismaService,
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
  ): Promise<SstActivityReportData> {
    const { from, to } = defaultDateRange(filters);

    // 1. Cases opened in period
    const casesOpened = await db.pastoralCase.count({
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
      },
    });

    // 2. Cases closed in period
    const casesClosed = await db.pastoralCase.count({
      where: {
        tenant_id: tenantId,
        closed_at: { gte: from, lte: to },
      },
    });

    // 3. All cases in period for severity breakdown
    const allCases = await db.pastoralCase.findMany({
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
      },
      select: { tier: true, created_at: true, resolved_at: true, closed_at: true },
    });

    const casesBySeverity: Record<string, number> = {};
    let totalResolutionDays = 0;
    let resolvedCount = 0;
    for (const c of allCases) {
      const key = `tier_${c.tier}`;
      casesBySeverity[key] = (casesBySeverity[key] ?? 0) + 1;

      const endDate = c.resolved_at ?? c.closed_at;
      if (endDate) {
        totalResolutionDays += Math.floor(
          (endDate.getTime() - c.created_at.getTime()) / (1000 * 60 * 60 * 24),
        );
        resolvedCount++;
      }
    }

    const avgResolutionDays =
      resolvedCount > 0 ? Math.round(totalResolutionDays / resolvedCount) : null;

    // 4. Concerns in period
    const concerns = await db.pastoralConcern.findMany({
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
        ...(filters.year_group_id ? { student: { year_group_id: filters.year_group_id } } : {}),
      },
      select: {
        category: true,
        severity: true,
        created_at: true,
        student_id: true,
        student: {
          select: {
            year_group_id: true,
            year_group: { select: { name: true } },
          },
        },
      },
    });

    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const weeklyMap: Record<string, number> = {};

    for (const concern of concerns) {
      byCategory[concern.category] = (byCategory[concern.category] ?? 0) + 1;
      const sevKey = String(concern.severity);
      bySeverity[sevKey] = (bySeverity[sevKey] ?? 0) + 1;
      const week = getISOWeek(concern.created_at);
      weeklyMap[week] = (weeklyMap[week] ?? 0) + 1;
    }

    const weeklyTrend = Object.entries(weeklyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, count]) => ({ week, count }));

    // 5. Interventions in period
    const interventions = await db.pastoralIntervention.findMany({
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
      },
      select: { status: true },
    });

    const interventionOutcomes = {
      achieved: 0,
      partially_achieved: 0,
      not_achieved: 0,
      escalated: 0,
      in_progress: 0,
    };

    for (const intervention of interventions) {
      const status = String(intervention.status);
      if (status === 'achieved') interventionOutcomes.achieved++;
      else if (status === 'partially_achieved') interventionOutcomes.partially_achieved++;
      else if (status === 'not_achieved') interventionOutcomes.not_achieved++;
      else if (status === 'escalated') interventionOutcomes.escalated++;
      else interventionOutcomes.in_progress++;
    }

    // 6. Action completion rate
    const allActions = await db.sstMeetingAction.findMany({
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
      },
      select: { status: true, due_date: true, completed_at: true },
    });

    const completedActions = allActions.filter((a) => String(a.status) === 'pc_completed').length;
    const actionCompletionRate =
      allActions.length > 0 ? Math.round((completedActions / allActions.length) * 100) : 0;
    const overdueActions = allActions.filter(
      (a) =>
        String(a.status) !== 'pc_completed' &&
        String(a.status) !== 'pc_cancelled' &&
        a.due_date < new Date(),
    ).length;

    // 7. By year group
    const yearGroupMap: Record<
      string,
      { name: string; students: Set<string>; concernCount: number }
    > = {};

    for (const concern of concerns) {
      const ygId = concern.student?.year_group_id;
      const ygName = concern.student?.year_group?.name ?? 'Unassigned';
      const key = ygId ?? 'unassigned';

      if (!yearGroupMap[key]) {
        yearGroupMap[key] = {
          name: ygName,
          students: new Set<string>(),
          concernCount: 0,
        };
      }
      yearGroupMap[key].students.add(concern.student_id);
      yearGroupMap[key].concernCount++;
    }

    const byYearGroup = Object.values(yearGroupMap).map((yg) => ({
      year_group_name: yg.name,
      student_count: yg.students.size,
      concern_count: yg.concernCount,
      concerns_per_student:
        yg.students.size > 0 ? Math.round((yg.concernCount / yg.students.size) * 100) / 100 : 0,
    }));

    const result: SstActivityReportData = {
      period: { from: toISODate(from), to: toISODate(to) },
      cases_opened: casesOpened,
      cases_closed: casesClosed,
      cases_by_severity: casesBySeverity,
      avg_resolution_days: avgResolutionDays,
      concern_volume: {
        total: concerns.length,
        by_category: byCategory,
        by_severity: bySeverity,
        weekly_trend: weeklyTrend,
      },
      intervention_outcomes: interventionOutcomes,
      action_completion_rate: actionCompletionRate,
      overdue_actions: overdueActions,
      by_year_group: byYearGroup,
    };

    // Fire audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'report_generated',
      entity_type: 'export',
      entity_id: 'report',
      student_id: null,
      actor_user_id: userId,
      tier: 1,
      payload: { report_type: 'sst_activity', requested_by: userId, filters },
      ip_address: null,
    });

    return result;
  }
}
