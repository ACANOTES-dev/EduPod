import { Injectable } from '@nestjs/common';

import type { ReportFilterDto } from '@school/shared/pastoral';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralReportDesInspectionService } from './pastoral-report-des-inspection.service';
import { PastoralReportSafeguardingService } from './pastoral-report-safeguarding.service';
import { PastoralReportSstActivityService } from './pastoral-report-sst-activity.service';
import { PastoralReportStudentSummaryService } from './pastoral-report-student-summary.service';
import { PastoralReportWellbeingService } from './pastoral-report-wellbeing.service';

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

// ─── Service (thin delegate) ───────────────────────────────────────────────

@Injectable()
export class PastoralReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentSummaryService: PastoralReportStudentSummaryService,
    private readonly sstActivityService: PastoralReportSstActivityService,
    private readonly safeguardingService: PastoralReportSafeguardingService,
    private readonly wellbeingService: PastoralReportWellbeingService,
    private readonly desInspectionService: PastoralReportDesInspectionService,
  ) {}

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

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return this.studentSummaryService.build(db, tenantId, userId, studentId, options);
    }) as Promise<StudentPastoralSummaryData>;
  }

  // ─── SST Activity Report ──────────────────────────────────────────────────

  async getSstActivity(
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
  ): Promise<SstActivityReportData> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return this.sstActivityService.build(db, tenantId, userId, filters);
    }) as Promise<SstActivityReportData>;
  }

  // ─── Safeguarding Compliance Report ────────────────────────────────────────

  async getSafeguardingCompliance(
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
  ): Promise<SafeguardingComplianceReportData> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return this.safeguardingService.build(db, tenantId, userId, filters);
    }) as Promise<SafeguardingComplianceReportData>;
  }

  // ─── Wellbeing Programme Report ────────────────────────────────────────────

  async getWellbeingProgramme(
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
  ): Promise<WellbeingProgrammeReportData> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return this.wellbeingService.build(db, tenantId, userId, filters);
    }) as Promise<WellbeingProgrammeReportData>;
  }

  // ─── DES Inspection Report ─────────────────────────────────────────────────

  async getDesInspection(
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
  ): Promise<DesInspectionReportData> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return this.desInspectionService.build(db, tenantId, userId, filters);
    }) as Promise<DesInspectionReportData>;
  }
}
