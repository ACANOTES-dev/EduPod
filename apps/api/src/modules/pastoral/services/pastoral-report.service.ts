import { Injectable, Logger } from '@nestjs/common';
import type { ReportFilterDto } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StudentPastoralSummaryData {
  student: {
    id: string;
    full_name: string;
    student_number: string;
    year_group: string;
    class_name: string;
  };
  concerns: Array<{
    id: string;
    date: string;
    category: string;
    severity: string;
    tier: number;
    narrative: string;
    versions: Array<{
      version: number;
      text: string;
      amended_at: string;
      amended_by: string;
      reason: string;
    }>;
    logged_by: string;
    actions_taken: string | null;
  }>;
  cases: Array<{
    id: string;
    status: string;
    case_owner: string;
    opened_at: string;
    review_date: string | null;
    linked_concern_count: number;
  }>;
  interventions: Array<{
    id: string;
    type: string;
    continuum_level: number;
    status: string;
    target_outcomes: string;
    outcome: string | null;
    start_date: string;
    end_date: string | null;
  }>;
  referrals: Array<{
    id: string;
    referral_type: string;
    status: string;
    submitted_at: string | null;
    wait_days: number | null;
  }>;
  has_cp_records: boolean;
}

export interface SstActivityReportData {
  period: { from: string; to: string };
  cases_opened: number;
  cases_closed: number;
  cases_by_severity: Record<string, number>;
  avg_resolution_days: number | null;
  concern_volume: {
    total: number;
    by_category: Record<string, number>;
    by_severity: Record<string, number>;
    weekly_trend: Array<{ week: string; count: number }>;
  };
  intervention_outcomes: {
    achieved: number;
    partially_achieved: number;
    not_achieved: number;
    escalated: number;
    in_progress: number;
  };
  action_completion_rate: number;
  overdue_actions: number;
  by_year_group: Array<{
    year_group_name: string;
    student_count: number;
    concern_count: number;
    concerns_per_student: number;
  }>;
}

export interface SafeguardingComplianceReportData {
  period: { from: string; to: string };
  concern_counts: {
    tier_1: number;
    tier_2: number;
    tier_3: number | null;
  };
  mandated_reports: {
    total: number;
    by_status: Record<string, number>;
  } | null;
  training_compliance: {
    dlp_name: string;
    dlp_training_date: string | null;
    deputy_dlp_name: string;
    deputy_dlp_training_date: string | null;
    staff_trained_count: number;
    staff_total_count: number;
    staff_compliance_rate: number;
    non_compliant_staff: Array<{ name: string; user_id: string }>;
  };
  child_safeguarding_statement: {
    last_review_date: string | null;
    next_review_due: string | null;
    board_signed_off: boolean;
  };
  active_cp_cases: number | null;
}

export interface WellbeingProgrammeReportData {
  period: { from: string; to: string };
  intervention_coverage_percent: number;
  continuum_distribution: { level_1: number; level_2: number; level_3: number };
  referral_rate: number;
  concern_to_case_conversion_rate: number;
  intervention_type_distribution: Record<string, number>;
  by_year_group: Array<{
    year_group_name: string;
    intervention_count: number;
    student_count: number;
  }>;
}

export interface DesInspectionReportData {
  period: { from: string; to: string };
  pastoral_care_policy_summary: string;
  sst_composition: Array<{ user_name: string; role: string | null }>;
  meeting_frequency: { total_meetings: number; average_per_month: number };
  concern_logging: { total: number; by_category: Record<string, number> };
  intervention_quality: {
    with_measurable_targets_percent: number;
    with_documented_outcomes_percent: number;
  };
  referral_pathways: { total: number; by_type: Record<string, number> };
  continuum_coverage: { level_1: number; level_2: number; level_3: number };
  staff_engagement: { distinct_staff_logging_concerns: number };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

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

/**
 * Returns the ISO week string (YYYY-Www) for a given date.
 */
function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1, Sun=7)
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Calculates the number of months between two dates (inclusive of partial).
 */
function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth()) +
    1;
  return Math.max(months, 1);
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class PastoralReportService {
  private readonly logger = new Logger(PastoralReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── CP Access Check ───────────────────────────────────────────────────────

  private async hasCpAccess(
    db: PrismaService,
    tenantId: string,
    userId: string,
  ): Promise<boolean> {
    const grant = await db.cpAccessGrant.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        revoked_at: null,
      },
    });
    return grant !== null;
  }

  // ─── Student Summary ──────────────────────────────────────────────────────

  async getStudentSummary(
    tenantId: string,
    userId: string,
    studentId: string,
    options: { include_resolved?: boolean },
  ): Promise<StudentPastoralSummaryData> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const result = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 1. Check CP access
      const cpAccess = await this.hasCpAccess(db, tenantId, userId);

      // 2. Fetch student with year group and class
      const student = await db.student.findFirst({
        where: { id: studentId, tenant_id: tenantId },
        include: {
          year_group: { select: { name: true } },
          homeroom_class: { select: { name: true } },
        },
      });

      if (!student) {
        return {
          student: {
            id: studentId,
            full_name: 'Unknown',
            student_number: '',
            year_group: '',
            class_name: '',
          },
          concerns: [],
          cases: [],
          interventions: [],
          referrals: [],
          has_cp_records: false,
        };
      }

      // 3. Concerns — filter by tier based on CP access
      const tierFilter = cpAccess ? {} : { tier: { in: [1, 2] } };
      const concerns = await db.pastoralConcern.findMany({
        where: { tenant_id: tenantId, student_id: studentId, ...tierFilter },
        include: {
          logged_by: { select: { first_name: true, last_name: true } },
          versions: {
            orderBy: { version_number: 'asc' },
            include: {
              amended_by: { select: { first_name: true, last_name: true } },
            },
          },
        },
        orderBy: { occurred_at: 'desc' },
      });

      // 4. Cases
      const caseWhere: Record<string, unknown> = {
        tenant_id: tenantId,
        student_id: studentId,
      };
      if (!options.include_resolved) {
        caseWhere['status'] = { notIn: ['resolved', 'closed'] };
      }

      const cases = await db.pastoralCase.findMany({
        where: caseWhere,
        include: {
          owner: { select: { first_name: true, last_name: true } },
          concerns: { select: { id: true } },
        },
        orderBy: { created_at: 'desc' },
      });

      // 5. Interventions
      const interventions = await db.pastoralIntervention.findMany({
        where: { tenant_id: tenantId, student_id: studentId },
        orderBy: { created_at: 'desc' },
      });

      // 6. Referrals
      const referrals = await db.pastoralReferral.findMany({
        where: { tenant_id: tenantId, student_id: studentId },
        orderBy: { created_at: 'desc' },
      });

      // 7. CP record existence check
      let hasCpRecords = false;
      if (cpAccess) {
        const cpCount = await db.cpRecord.count({
          where: { tenant_id: tenantId, student_id: studentId },
        });
        hasCpRecords = cpCount > 0;
      }

      return {
        student: {
          id: student.id,
          full_name:
            student.full_name ??
            `${student.first_name} ${student.last_name}`,
          student_number: student.student_number ?? '',
          year_group: student.year_group?.name ?? '',
          class_name: student.homeroom_class?.name ?? '',
        },
        concerns: concerns.map((c) => ({
          id: c.id,
          date: c.occurred_at.toISOString(),
          category: c.category,
          severity: String(c.severity),
          tier: c.tier,
          narrative:
            c.versions.length > 0
              ? (c.versions[c.versions.length - 1]?.narrative ?? '')
              : '',
          versions: c.versions.map((v) => ({
            version: v.version_number,
            text: v.narrative,
            amended_at: v.created_at.toISOString(),
            amended_by: `${v.amended_by.first_name} ${v.amended_by.last_name}`,
            reason: v.amendment_reason ?? '',
          })),
          logged_by: `${c.logged_by.first_name} ${c.logged_by.last_name}`,
          actions_taken: c.actions_taken,
        })),
        cases: cases.map((cs) => ({
          id: cs.id,
          status: String(cs.status),
          case_owner: cs.owner
            ? `${cs.owner.first_name} ${cs.owner.last_name}`
            : 'Unknown',
          opened_at: cs.created_at.toISOString(),
          review_date: cs.next_review_date
            ? toISODate(cs.next_review_date)
            : null,
          linked_concern_count: cs.concerns.length,
        })),
        interventions: interventions.map((i) => ({
          id: i.id,
          type: i.intervention_type,
          continuum_level: i.continuum_level,
          status: String(i.status),
          target_outcomes:
            typeof i.target_outcomes === 'object'
              ? JSON.stringify(i.target_outcomes)
              : String(i.target_outcomes),
          outcome: i.outcome_notes,
          start_date: i.created_at.toISOString(),
          end_date: i.updated_at.toISOString(),
        })),
        referrals: referrals.map((r) => {
          let waitDays: number | null = null;
          if (r.submitted_at && r.status === 'submitted') {
            const now = new Date();
            waitDays = Math.floor(
              (now.getTime() - r.submitted_at.getTime()) / (1000 * 60 * 60 * 24),
            );
          }
          return {
            id: r.id,
            referral_type: r.referral_type,
            status: String(r.status),
            submitted_at: r.submitted_at
              ? r.submitted_at.toISOString()
              : null,
            wait_days: waitDays,
          };
        }),
        has_cp_records: hasCpRecords,
      };
    });

    // Fire audit event (non-blocking)
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'student_summary_accessed',
      entity_type: 'export',
      entity_id: studentId,
      student_id: studentId,
      actor_user_id: userId,
      tier: 1,
      payload: { student_id: studentId, requested_by: userId },
      ip_address: null,
    });

    return result as StudentPastoralSummaryData;
  }

  // ─── SST Activity Report ──────────────────────────────────────────────────

  async getSstActivity(
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
  ): Promise<SstActivityReportData> {
    const { from, to } = defaultDateRange(filters);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const result = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

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
          ...(filters.year_group_id
            ? { student: { year_group_id: filters.year_group_id } }
            : {}),
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
        byCategory[concern.category] =
          (byCategory[concern.category] ?? 0) + 1;
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
        else if (status === 'partially_achieved')
          interventionOutcomes.partially_achieved++;
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

      const completedActions = allActions.filter(
        (a) => String(a.status) === 'pc_completed',
      ).length;
      const actionCompletionRate =
        allActions.length > 0
          ? Math.round((completedActions / allActions.length) * 100)
          : 0;
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
          yg.students.size > 0
            ? Math.round((yg.concernCount / yg.students.size) * 100) / 100
            : 0,
      }));

      return {
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
    });

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

    return result as SstActivityReportData;
  }

  // ─── Safeguarding Compliance Report ────────────────────────────────────────

  async getSafeguardingCompliance(
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
  ): Promise<SafeguardingComplianceReportData> {
    const { from, to } = defaultDateRange(filters);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const result = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 1. CP access check
      const cpAccess = await this.hasCpAccess(db, tenantId, userId);

      // 2. Concern counts by tier
      const tier1Count = await db.pastoralConcern.count({
        where: { tenant_id: tenantId, tier: 1, created_at: { gte: from, lte: to } },
      });
      const tier2Count = await db.pastoralConcern.count({
        where: { tenant_id: tenantId, tier: 2, created_at: { gte: from, lte: to } },
      });
      let tier3Count: number | null = null;
      if (cpAccess) {
        tier3Count = await db.pastoralConcern.count({
          where: { tenant_id: tenantId, tier: 3, created_at: { gte: from, lte: to } },
        });
      }

      // 3. Mandated reports (CP access only)
      let mandatedReports: { total: number; by_status: Record<string, number> } | null =
        null;
      if (cpAccess) {
        const cpRecords = await db.cpRecord.findMany({
          where: {
            tenant_id: tenantId,
            created_at: { gte: from, lte: to },
            mandated_report_status: { not: null },
          },
          select: { mandated_report_status: true },
        });

        const byStatus: Record<string, number> = {};
        for (const rec of cpRecords) {
          const status = String(rec.mandated_report_status);
          byStatus[status] = (byStatus[status] ?? 0) + 1;
        }

        mandatedReports = {
          total: cpRecords.length,
          by_status: byStatus,
        };
      }

      // 4. Training compliance — use placeholders as training data may not be available
      const staffTotal = await db.staffProfile.count({
        where: { tenant_id: tenantId },
      });

      const trainingCompliance = {
        dlp_name: 'Not configured',
        dlp_training_date: null as string | null,
        deputy_dlp_name: 'Not configured',
        deputy_dlp_training_date: null as string | null,
        staff_trained_count: 0,
        staff_total_count: staffTotal,
        staff_compliance_rate: 0,
        non_compliant_staff: [] as Array<{ name: string; user_id: string }>,
      };

      // 5. Child safeguarding statement — placeholders
      const childSafeguardingStatement = {
        last_review_date: null as string | null,
        next_review_due: null as string | null,
        board_signed_off: false,
      };

      // 6. Active CP cases (CP access only)
      let activeCpCases: number | null = null;
      if (cpAccess) {
        activeCpCases = await db.pastoralCase.count({
          where: {
            tenant_id: tenantId,
            tier: 3,
            status: { in: ['open', 'active', 'monitoring'] },
          },
        });
      }

      return {
        period: { from: toISODate(from), to: toISODate(to) },
        concern_counts: {
          tier_1: tier1Count,
          tier_2: tier2Count,
          tier_3: tier3Count,
        },
        mandated_reports: mandatedReports,
        training_compliance: trainingCompliance,
        child_safeguarding_statement: childSafeguardingStatement,
        active_cp_cases: activeCpCases,
      };
    });

    // Fire audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'report_generated',
      entity_type: 'export',
      entity_id: 'report',
      student_id: null,
      actor_user_id: userId,
      tier: 1,
      payload: {
        report_type: 'safeguarding_compliance',
        requested_by: userId,
        filters,
      },
      ip_address: null,
    });

    return result as SafeguardingComplianceReportData;
  }

  // ─── Wellbeing Programme Report ────────────────────────────────────────────

  async getWellbeingProgramme(
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
  ): Promise<WellbeingProgrammeReportData> {
    const { from, to } = defaultDateRange(filters);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const result = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const yearGroupFilter = filters.year_group_id
        ? { student: { year_group_id: filters.year_group_id } }
        : {};

      // 1. Total students
      const totalStudents = await db.student.count({
        where: {
          tenant_id: tenantId,
          ...(filters.year_group_id
            ? { year_group_id: filters.year_group_id }
            : {}),
        },
      });

      // 2. Students with Level 2+ interventions
      const level2PlusInterventions = await db.pastoralIntervention.findMany({
        where: {
          tenant_id: tenantId,
          continuum_level: { gte: 2 },
          created_at: { gte: from, lte: to },
          ...yearGroupFilter,
        },
        select: { student_id: true },
      });

      const uniqueStudentsWithInterventions = new Set(
        level2PlusInterventions.map((i) => i.student_id),
      );

      const interventionCoveragePercent =
        totalStudents > 0
          ? Math.round(
              (uniqueStudentsWithInterventions.size / totalStudents) * 100 * 100,
            ) / 100
          : 0;

      // 3. Continuum distribution
      const allInterventions = await db.pastoralIntervention.findMany({
        where: {
          tenant_id: tenantId,
          created_at: { gte: from, lte: to },
          ...yearGroupFilter,
        },
        select: {
          continuum_level: true,
          intervention_type: true,
          student_id: true,
          student: {
            select: {
              year_group_id: true,
              year_group: { select: { name: true } },
            },
          },
        },
      });

      const continuumDistribution = { level_1: 0, level_2: 0, level_3: 0 };
      const interventionTypeMap: Record<string, number> = {};

      for (const intervention of allInterventions) {
        if (intervention.continuum_level === 1) continuumDistribution.level_1++;
        else if (intervention.continuum_level === 2)
          continuumDistribution.level_2++;
        else if (intervention.continuum_level === 3)
          continuumDistribution.level_3++;

        interventionTypeMap[intervention.intervention_type] =
          (interventionTypeMap[intervention.intervention_type] ?? 0) + 1;
      }

      // 4. Referral rate
      const referralCount = await db.pastoralReferral.count({
        where: {
          tenant_id: tenantId,
          created_at: { gte: from, lte: to },
          ...(filters.year_group_id
            ? { student: { year_group_id: filters.year_group_id } }
            : {}),
        },
      });

      const referralRate =
        totalStudents > 0
          ? Math.round((referralCount / totalStudents) * 100 * 100) / 100
          : 0;

      // 5. Concern-to-case conversion rate
      const concernTotal = await db.pastoralConcern.count({
        where: {
          tenant_id: tenantId,
          created_at: { gte: from, lte: to },
          ...(filters.year_group_id
            ? { student: { year_group_id: filters.year_group_id } }
            : {}),
        },
      });
      const concernsWithCase = await db.pastoralConcern.count({
        where: {
          tenant_id: tenantId,
          created_at: { gte: from, lte: to },
          case_id: { not: null },
          ...(filters.year_group_id
            ? { student: { year_group_id: filters.year_group_id } }
            : {}),
        },
      });
      const conversionRate =
        concernTotal > 0
          ? Math.round((concernsWithCase / concernTotal) * 100 * 100) / 100
          : 0;

      // 6. By year group
      const yearGroupInterventionMap: Record<
        string,
        { name: string; students: Set<string>; count: number }
      > = {};

      for (const intervention of allInterventions) {
        const ygId = intervention.student?.year_group_id;
        const ygName = intervention.student?.year_group?.name ?? 'Unassigned';
        const key = ygId ?? 'unassigned';

        if (!yearGroupInterventionMap[key]) {
          yearGroupInterventionMap[key] = {
            name: ygName,
            students: new Set<string>(),
            count: 0,
          };
        }
        yearGroupInterventionMap[key].students.add(intervention.student_id);
        yearGroupInterventionMap[key].count++;
      }

      const byYearGroup = Object.values(yearGroupInterventionMap).map((yg) => ({
        year_group_name: yg.name,
        intervention_count: yg.count,
        student_count: yg.students.size,
      }));

      return {
        period: { from: toISODate(from), to: toISODate(to) },
        intervention_coverage_percent: interventionCoveragePercent,
        continuum_distribution: continuumDistribution,
        referral_rate: referralRate,
        concern_to_case_conversion_rate: conversionRate,
        intervention_type_distribution: interventionTypeMap,
        by_year_group: byYearGroup,
      };
    });

    // Fire audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'report_generated',
      entity_type: 'export',
      entity_id: 'report',
      student_id: null,
      actor_user_id: userId,
      tier: 1,
      payload: {
        report_type: 'wellbeing_programme',
        requested_by: userId,
        filters,
      },
      ip_address: null,
    });

    return result as WellbeingProgrammeReportData;
  }

  // ─── DES Inspection Report ─────────────────────────────────────────────────

  async getDesInspection(
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
  ): Promise<DesInspectionReportData> {
    const { from, to } = defaultDateRange(filters);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const result = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 1. SST composition
      const sstMembers = await db.sstMember.findMany({
        where: { tenant_id: tenantId, active: true },
        include: {
          user: { select: { first_name: true, last_name: true } },
        },
      });

      const sstComposition = sstMembers.map((m) => ({
        user_name: `${m.user.first_name} ${m.user.last_name}`,
        role: m.role_description,
      }));

      // 2. Meeting frequency
      const meetings = await db.sstMeeting.findMany({
        where: {
          tenant_id: tenantId,
          scheduled_at: { gte: from, lte: to },
        },
        select: { id: true },
      });

      const totalMeetings = meetings.length;
      const months = monthsBetween(from, to);
      const averagePerMonth =
        Math.round((totalMeetings / months) * 100) / 100;

      // 3. Concern logging
      const concerns = await db.pastoralConcern.findMany({
        where: {
          tenant_id: tenantId,
          created_at: { gte: from, lte: to },
        },
        select: {
          category: true,
          logged_by_user_id: true,
        },
      });

      const concernByCategory: Record<string, number> = {};
      const distinctStaffSet = new Set<string>();
      for (const c of concerns) {
        concernByCategory[c.category] =
          (concernByCategory[c.category] ?? 0) + 1;
        distinctStaffSet.add(c.logged_by_user_id);
      }

      // 4. Intervention quality
      const interventions = await db.pastoralIntervention.findMany({
        where: {
          tenant_id: tenantId,
          created_at: { gte: from, lte: to },
        },
        select: {
          target_outcomes: true,
          outcome_notes: true,
          continuum_level: true,
        },
      });

      let withMeasurableTargets = 0;
      let withDocumentedOutcomes = 0;

      for (const intervention of interventions) {
        // Check target_outcomes for measurable targets
        if (intervention.target_outcomes) {
          const outcomes = intervention.target_outcomes as Record<string, unknown>;
          if (
            typeof outcomes === 'object' &&
            outcomes !== null &&
            'measurable_target' in outcomes
          ) {
            withMeasurableTargets++;
          }
        }

        if (
          intervention.outcome_notes &&
          String(intervention.outcome_notes).trim().length > 0
        ) {
          withDocumentedOutcomes++;
        }
      }

      const interventionTotal = interventions.length;
      const measurablePercent =
        interventionTotal > 0
          ? Math.round((withMeasurableTargets / interventionTotal) * 100)
          : 0;
      const documentedPercent =
        interventionTotal > 0
          ? Math.round((withDocumentedOutcomes / interventionTotal) * 100)
          : 0;

      // 5. Referral pathways
      const referrals = await db.pastoralReferral.findMany({
        where: {
          tenant_id: tenantId,
          created_at: { gte: from, lte: to },
        },
        select: { referral_type: true },
      });

      const referralByType: Record<string, number> = {};
      for (const r of referrals) {
        referralByType[r.referral_type] =
          (referralByType[r.referral_type] ?? 0) + 1;
      }

      // 6. Continuum coverage
      const continuumCoverage = { level_1: 0, level_2: 0, level_3: 0 };
      for (const intervention of interventions) {
        if (intervention.continuum_level === 1) continuumCoverage.level_1++;
        else if (intervention.continuum_level === 2)
          continuumCoverage.level_2++;
        else if (intervention.continuum_level === 3)
          continuumCoverage.level_3++;
      }

      return {
        period: { from: toISODate(from), to: toISODate(to) },
        pastoral_care_policy_summary:
          'Pastoral care policy as per school guidelines. Please refer to the school policy document.',
        sst_composition: sstComposition,
        meeting_frequency: {
          total_meetings: totalMeetings,
          average_per_month: averagePerMonth,
        },
        concern_logging: {
          total: concerns.length,
          by_category: concernByCategory,
        },
        intervention_quality: {
          with_measurable_targets_percent: measurablePercent,
          with_documented_outcomes_percent: documentedPercent,
        },
        referral_pathways: {
          total: referrals.length,
          by_type: referralByType,
        },
        continuum_coverage: continuumCoverage,
        staff_engagement: {
          distinct_staff_logging_concerns: distinctStaffSet.size,
        },
      };
    });

    // Fire audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'report_generated',
      entity_type: 'export',
      entity_id: 'report',
      student_id: null,
      actor_user_id: userId,
      tier: 1,
      payload: {
        report_type: 'des_inspection',
        requested_by: userId,
        filters,
      },
      ip_address: null,
    });

    return result as DesInspectionReportData;
  }
}
