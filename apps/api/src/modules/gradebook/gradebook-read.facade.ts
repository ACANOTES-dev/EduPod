/**
 * GradebookReadFacade — Centralised read service for gradebook data.
 *
 * PURPOSE:
 * Two modules read gradebook tables directly via Prisma, duplicating select clauses
 * and coupling tightly to the schema:
 *   - early-warning/collectors/grades-signal.collector.ts
 *   - compliance/dsar-traversal.service.ts
 *
 * This facade provides a single, well-typed entry point for all cross-module gradebook
 * reads. Schema changes propagate through a single file instead of spreading across
 * multiple consumer modules.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Batch methods return arrays (empty array = nothing found).
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

// ─── Select shapes ────────────────────────────────────────────────────────────

const GRADE_SELECT = {
  id: true,
  tenant_id: true,
  assessment_id: true,
  student_id: true,
  raw_score: true,
  is_missing: true,
  comment: true,
  entered_at: true,
  ai_assisted: true,
  created_at: true,
  updated_at: true,
} as const;

const PERIOD_SNAPSHOT_SELECT = {
  id: true,
  tenant_id: true,
  student_id: true,
  class_id: true,
  subject_id: true,
  academic_period_id: true,
  computed_value: true,
  display_value: true,
  overridden_value: true,
  override_reason: true,
  snapshot_at: true,
  created_at: true,
  updated_at: true,
} as const;

const GPA_SNAPSHOT_SELECT = {
  id: true,
  tenant_id: true,
  student_id: true,
  academic_period_id: true,
  gpa_value: true,
  credit_hours_total: true,
  snapshot_at: true,
  created_at: true,
  updated_at: true,
} as const;

const RISK_ALERT_SELECT = {
  id: true,
  tenant_id: true,
  student_id: true,
  risk_level: true,
  alert_type: true,
  subject_id: true,
  trigger_reason: true,
  details_json: true,
  detected_date: true,
  status: true,
  acknowledged_by_user_id: true,
  resolved_at: true,
  created_at: true,
  updated_at: true,
} as const;

const REPORT_CARD_SELECT = {
  id: true,
  tenant_id: true,
  student_id: true,
  academic_period_id: true,
  status: true,
  template_locale: true,
  teacher_comment: true,
  principal_comment: true,
  published_at: true,
  published_by_user_id: true,
  snapshot_payload_json: true,
  created_at: true,
  updated_at: true,
} as const;

const COMPETENCY_SNAPSHOT_SELECT = {
  id: true,
  tenant_id: true,
  student_id: true,
  standard_id: true,
  academic_period_id: true,
  competency_level: true,
  score_average: true,
  computed_from_count: true,
  last_updated: true,
} as const;

const PROGRESS_REPORT_SELECT = {
  id: true,
  tenant_id: true,
  student_id: true,
  class_id: true,
  academic_period_id: true,
  generated_by_user_id: true,
  status: true,
  sent_at: true,
  created_at: true,
  updated_at: true,
  entries: {
    select: {
      id: true,
      subject_id: true,
      current_average: true,
      trend: true,
      teacher_note: true,
      created_at: true,
    },
  },
} as const;

// ─── Return types ─────────────────────────────────────────────────────────────

export interface GradeRow {
  id: string;
  tenant_id: string;
  assessment_id: string;
  student_id: string;
  raw_score: { toNumber: () => number } | null;
  is_missing: boolean;
  comment: string | null;
  entered_at: Date | null;
  ai_assisted: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PeriodSnapshotRow {
  id: string;
  tenant_id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  academic_period_id: string;
  computed_value: { toNumber: () => number };
  display_value: string;
  overridden_value: string | null;
  override_reason: string | null;
  snapshot_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface GpaSnapshotRow {
  id: string;
  tenant_id: string;
  student_id: string;
  academic_period_id: string;
  gpa_value: { toNumber: () => number };
  credit_hours_total: { toNumber: () => number };
  snapshot_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RiskAlertRow {
  id: string;
  tenant_id: string;
  student_id: string;
  risk_level: string;
  alert_type: string;
  subject_id: string | null;
  trigger_reason: string;
  details_json: unknown;
  detected_date: Date;
  status: string;
  acknowledged_by_user_id: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ReportCardRow {
  id: string;
  tenant_id: string;
  student_id: string;
  academic_period_id: string;
  status: string;
  template_locale: string;
  teacher_comment: string | null;
  principal_comment: string | null;
  published_at: Date | null;
  published_by_user_id: string | null;
  snapshot_payload_json: unknown;
  created_at: Date;
  updated_at: Date;
}

export interface CompetencySnapshotRow {
  id: string;
  tenant_id: string;
  student_id: string;
  standard_id: string;
  academic_period_id: string;
  competency_level: string;
  score_average: { toNumber: () => number };
  computed_from_count: number;
  last_updated: Date;
}

export interface ProgressReportEntryRow {
  id: string;
  subject_id: string;
  current_average: { toNumber: () => number };
  trend: string;
  teacher_note: string | null;
  created_at: Date;
}

export interface ProgressReportRow {
  id: string;
  tenant_id: string;
  student_id: string;
  class_id: string;
  academic_period_id: string;
  generated_by_user_id: string;
  status: string;
  sent_at: Date | null;
  created_at: Date;
  updated_at: Date;
  entries: ProgressReportEntryRow[];
}

// ─── Facade ───────────────────────────────────────────────────────────────────

/**
 * Read-only facade for gradebook tables used by cross-module consumers.
 * Consumers: early-warning (grades signal), compliance (DSAR traversal).
 *
 * All methods are tenant-scoped reads — no RLS transaction needed.
 */
@Injectable()
export class GradebookReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Class Subject Grade Configs ─────────────────────────────────────────────

  /**
   * Find class-subject grade configs for a set of class IDs.
   * Used by curriculum-requirements to determine which subjects are assigned to which classes.
   */
  async findClassSubjectConfigs(
    tenantId: string,
    classIds: string[],
  ): Promise<
    Array<{
      class_id: string;
      subject_id: string;
      subject: { id: string; name: string };
      class_name: string;
    }>
  > {
    if (classIds.length === 0) return [];

    const configs = await this.prisma.classSubjectGradeConfig.findMany({
      where: {
        tenant_id: tenantId,
        class_id: { in: classIds },
      },
      include: {
        subject: { select: { id: true, name: true } },
        class_entity: { select: { id: true, name: true } },
      },
    });

    return configs.map((c) => ({
      class_id: c.class_id,
      subject_id: c.subject_id,
      subject: c.subject,
      class_name: c.class_entity.name,
    }));
  }

  // ─── Assessment Counts ──────────────────────────────────────────────────────

  /**
   * Count assessments for a given academic period filtered by status.
   * Used by academic period pre-closure validation (DZ-06).
   */
  async countAssessmentsByPeriodAndStatus(
    tenantId: string,
    periodId: string,
    statuses: string[],
  ): Promise<number> {
    return this.prisma.assessment.count({
      where: {
        tenant_id: tenantId,
        academic_period_id: periodId,
        status: { in: statuses as ('draft' | 'open' | 'closed' | 'locked')[] },
      },
    });
  }

  // ─── Grades ─────────────────────────────────────────────────────────────────

  /**
   * All grade rows for a student. Used by DSAR and early-warning consumers.
   */
  async findGradesForStudent(tenantId: string, studentId: string): Promise<GradeRow[]> {
    return this.prisma.grade.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: GRADE_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Grades entered within the last `dayWindow` days.
   * Used by the early-warning grades-signal collector for time-windowed scoring.
   */
  async findRecentGrades(
    tenantId: string,
    studentId: string,
    dayWindow: number,
  ): Promise<GradeRow[]> {
    const since = new Date();
    since.setDate(since.getDate() - dayWindow);

    return this.prisma.grade.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        created_at: { gte: since },
      },
      select: GRADE_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── Period Grade Snapshots ──────────────────────────────────────────────────

  /**
   * All period grade snapshots for a student. Used by DSAR and early-warning.
   */
  async findPeriodSnapshotsForStudent(
    tenantId: string,
    studentId: string,
  ): Promise<PeriodSnapshotRow[]> {
    return this.prisma.periodGradeSnapshot.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: PERIOD_SNAPSHOT_SELECT,
      orderBy: { snapshot_at: 'desc' },
    });
  }

  // ─── GPA Snapshots ──────────────────────────────────────────────────────────

  /**
   * All GPA snapshots for a student. Used by DSAR.
   */
  async findGpaSnapshotsForStudent(tenantId: string, studentId: string): Promise<GpaSnapshotRow[]> {
    return this.prisma.gpaSnapshot.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: GPA_SNAPSHOT_SELECT,
      orderBy: { snapshot_at: 'desc' },
    });
  }

  // ─── Academic Risk Alerts ────────────────────────────────────────────────────

  /**
   * Active and acknowledged risk alerts for a student.
   * Excludes resolved alerts — those are historical and not actionable.
   * Used by early-warning (active only).
   */
  async findRiskAlertsForStudent(tenantId: string, studentId: string): Promise<RiskAlertRow[]> {
    return this.prisma.studentAcademicRiskAlert.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: { in: ['active', 'acknowledged'] },
      },
      select: RISK_ALERT_SELECT,
      orderBy: [{ detected_date: 'desc' }, { created_at: 'desc' }],
    });
  }

  /**
   * ALL risk alerts for a student — no status filter.
   * Used by DSAR traversal, which must return the complete data picture.
   */
  async findAllRiskAlertsForStudent(tenantId: string, studentId: string): Promise<RiskAlertRow[]> {
    return this.prisma.studentAcademicRiskAlert.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
      },
      select: RISK_ALERT_SELECT,
      orderBy: [{ detected_date: 'desc' }, { created_at: 'desc' }],
    });
  }

  // ─── Report Cards ────────────────────────────────────────────────────────────

  /**
   * All report cards for a student. Used by DSAR.
   */
  async findReportCardsForStudent(tenantId: string, studentId: string): Promise<ReportCardRow[]> {
    return this.prisma.reportCard.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: REPORT_CARD_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── Competency Snapshots ────────────────────────────────────────────────────

  /**
   * All competency snapshots for a student. Used by DSAR.
   */
  async findCompetencySnapshotsForStudent(
    tenantId: string,
    studentId: string,
  ): Promise<CompetencySnapshotRow[]> {
    return this.prisma.studentCompetencySnapshot.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: COMPETENCY_SNAPSHOT_SELECT,
      orderBy: { last_updated: 'desc' },
    });
  }

  // ─── Progress Reports ────────────────────────────────────────────────────────

  /**
   * All progress reports (with entries) for a student. Used by DSAR.
   */
  async findProgressReportsForStudent(
    tenantId: string,
    studentId: string,
  ): Promise<ProgressReportRow[]> {
    return this.prisma.progressReport.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: PROGRESS_REPORT_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Count NL query history records before a cutoff date.
   * Used by retention policies for purgeable record counts.
   */
  async countNlQueryHistoryBeforeDate(tenantId: string, cutoffDate: Date): Promise<number> {
    return this.prisma.nlQueryHistory.count({
      where: {
        tenant_id: tenantId,
        created_at: { lt: cutoffDate },
      },
    });
  }

  // ─── Generic Methods (reports-data-access + gradebook internal) ───────────

  /**
   * Generic findMany for grades with arbitrary where/select/orderBy.
   * Used by reports-data-access for grade analytics.
   */
  async findGradesGeneric(
    tenantId: string,
    options: {
      where?: Prisma.GradeWhereInput;
      select?: Prisma.GradeSelect;
      orderBy?: Prisma.GradeOrderByWithRelationInput;
    },
  ): Promise<unknown[]> {
    return this.prisma.grade.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.orderBy && { orderBy: options.orderBy }),
    });
  }

  /**
   * Group grades by scalar fields with counts and optional aggregations.
   * Used by reports-data-access for grade analytics.
   */
  async groupGradesBy<K extends Prisma.GradeScalarFieldEnum>(
    tenantId: string,
    by: K[],
    where?: Prisma.GradeWhereInput,
    options?: { _avg?: Prisma.GradeAvgAggregateInputType },
  ): Promise<Array<Record<string, unknown>>> {
    const result = await this.prisma.grade.groupBy({
      by,
      where: { tenant_id: tenantId, ...where },
      ...(options?._avg && { _avg: options._avg }),
      _count: true,
    });
    return result as unknown as Array<Record<string, unknown>>;
  }

  /**
   * Aggregate grade scores (avg). Converts Prisma Decimal to plain number.
   * Used by reports-data-access for grade analytics.
   */
  async aggregateGrades(
    tenantId: string,
    where?: Prisma.GradeWhereInput,
  ): Promise<{ _avg: { raw_score: number | null } }> {
    const result = await this.prisma.grade.aggregate({
      where: { tenant_id: tenantId, ...where },
      _avg: { raw_score: true },
    });
    return {
      _avg: { raw_score: result._avg.raw_score !== null ? Number(result._avg.raw_score) : null },
    };
  }

  /**
   * Generic findMany for assessments with arbitrary where/select.
   * Used by reports-data-access for assessment analytics.
   */
  async findAssessmentsGeneric(
    tenantId: string,
    options: {
      where?: Prisma.AssessmentWhereInput;
      select?: Prisma.AssessmentSelect;
    },
  ): Promise<unknown[]> {
    return this.prisma.assessment.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
    });
  }

  /**
   * Count assessments matching an arbitrary filter.
   * Used by reports-data-access for assessment counts.
   */
  async countAssessments(tenantId: string, where?: Prisma.AssessmentWhereInput): Promise<number> {
    return this.prisma.assessment.count({
      where: { tenant_id: tenantId, ...where },
    });
  }

  /**
   * Generic findMany for period grade snapshots with arbitrary where/select/orderBy.
   * Used by reports-data-access for grade analytics.
   */
  async findPeriodSnapshotsGeneric(
    tenantId: string,
    options: {
      where?: Prisma.PeriodGradeSnapshotWhereInput;
      select?: Prisma.PeriodGradeSnapshotSelect;
      orderBy?: Prisma.PeriodGradeSnapshotOrderByWithRelationInput;
    },
  ): Promise<unknown[]> {
    return this.prisma.periodGradeSnapshot.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.orderBy && { orderBy: options.orderBy }),
    });
  }

  /**
   * Generic findMany for GPA snapshots with arbitrary where/select.
   * Used by reports-data-access for GPA analytics.
   */
  async findGpaSnapshotsGeneric(
    tenantId: string,
    where?: Prisma.GpaSnapshotWhereInput,
    select?: Prisma.GpaSnapshotSelect,
  ): Promise<unknown[]> {
    return this.prisma.gpaSnapshot.findMany({
      where: { tenant_id: tenantId, ...where },
      ...(select && { select }),
    });
  }

  /**
   * Count student academic risk alerts matching an arbitrary filter.
   * Used by reports-data-access for risk alert counts.
   */
  async countRiskAlerts(
    tenantId: string,
    where?: Prisma.StudentAcademicRiskAlertWhereInput,
  ): Promise<number> {
    return this.prisma.studentAcademicRiskAlert.count({
      where: { tenant_id: tenantId, ...where },
    });
  }

  /**
   * Generic findMany for student academic risk alerts.
   * Used by reports-data-access for risk alert data queries.
   */
  async findRiskAlertsGeneric(
    tenantId: string,
    options: {
      where?: Prisma.StudentAcademicRiskAlertWhereInput;
      select?: Prisma.StudentAcademicRiskAlertSelect;
      orderBy?: Prisma.StudentAcademicRiskAlertOrderByWithRelationInput;
      take?: number;
    },
  ): Promise<unknown[]> {
    return this.prisma.studentAcademicRiskAlert.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.orderBy && { orderBy: options.orderBy }),
      ...(options.take !== undefined && { take: options.take }),
    });
  }

  /**
   * Generic findMany for report cards with arbitrary where/select/orderBy.
   * Used by reports-data-access for report card analytics.
   */
  async findReportCardsGeneric(
    tenantId: string,
    where?: Prisma.ReportCardWhereInput,
    select?: Prisma.ReportCardSelect,
    orderBy?: Prisma.ReportCardOrderByWithRelationInput,
  ): Promise<unknown[]> {
    return this.prisma.reportCard.findMany({
      where: { tenant_id: tenantId, ...where },
      ...(select && { select }),
      ...(orderBy && { orderBy }),
    });
  }
}
