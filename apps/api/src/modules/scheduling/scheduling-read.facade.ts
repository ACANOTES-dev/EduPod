/**
 * SchedulingReadFacade — Centralized read service for scheduling-domain configuration data.
 *
 * PURPOSE:
 * The scheduling module owns many configuration models: schedulePeriodTemplate,
 * classSchedulingRequirement, curriculumRequirement, teacherCompetency, teacherAbsence,
 * substitutionRecord, calendarSubscriptionToken, examSession, rotationConfig,
 * breakGroup, breakGroupYearGroup, and teacherSchedulingConfig. These are queried by
 * scheduling-runs, class-requirements, and period-grid modules.
 *
 * This facade provides a single, well-typed entry point for all cross-module reads
 * of these models. Internal scheduling module services may continue to use PrismaService
 * directly for their own models; this facade exists for *external* consumers.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Returns `null` when a single record is not found (callers decide whether to throw).
 * - Batch methods return arrays (empty = nothing found).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface PeriodTemplateRow {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  year_group_id: string | null;
  weekday: number;
  period_order: number;
  period_name: string | null;
  start_time: Date;
  end_time: Date;
  schedule_period_type: string;
  supervision_mode: string | null;
  break_group_id: string | null;
}

export interface ClassSchedulingRequirementRow {
  id: string;
  tenant_id: string;
  class_id: string;
  academic_year_id: string;
  periods_per_week: number;
  class_entity: {
    id: string;
    name: string;
    status: string;
    subject: { name: string; subject_type: string } | null;
    year_group: { name: string } | null;
  };
}

export interface CurriculumRequirementRow {
  id: string;
  subject_id: string;
  year_group_id: string;
  min_periods_per_week: number;
  max_periods_per_day: number | null;
  preferred_periods_per_week: number | null;
  requires_double_period: boolean;
  double_period_count: number | null;
  subject: { name: string };
  year_group: { name: string } | null;
}

export interface TeacherCompetencyRow {
  staff_profile_id: string;
  subject_id: string;
  year_group_id: string;
  is_primary: boolean;
}

export interface TeacherSchedulingConfigRow {
  staff_profile_id: string;
  max_periods_per_week: number | null;
  max_periods_per_day: number | null;
  max_supervision_duties_per_week: number | null;
}

export interface SubstitutionRecordCountRow {
  substitute_staff_id: string;
  count: number;
}

export interface BreakGroupRow {
  id: string;
  name: string;
  required_supervisor_count: number;
  year_groups: Array<{ year_group_id: string }>;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class SchedulingReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Period Templates ───────────────────────────────────────────────────────

  /**
   * Find a period template by weekday and period order. Used by cover-teacher
   * to resolve time slots for a given period.
   */
  async findPeriodTemplate(
    tenantId: string,
    academicYearId: string,
    weekday: number,
    periodOrder: number,
  ): Promise<{ start_time: Date; end_time: Date } | null> {
    return this.prisma.schedulePeriodTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        weekday,
        period_order: periodOrder,
      },
      select: { start_time: true, end_time: true },
    });
  }

  /**
   * Count teaching period templates for an academic year. Used by scheduling-runs
   * prerequisites and dashboard for total slot calculations.
   */
  async countTeachingPeriods(tenantId: string, academicYearId: string): Promise<number> {
    return this.prisma.schedulePeriodTemplate.count({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        schedule_period_type: 'teaching',
      },
    });
  }

  /**
   * Find all period templates for an academic year (for solver input assembly).
   */
  async findPeriodTemplates(
    tenantId: string,
    academicYearId: string,
  ): Promise<PeriodTemplateRow[]> {
    return this.prisma.schedulePeriodTemplate.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      orderBy: [{ weekday: 'asc' }, { period_order: 'asc' }],
    }) as unknown as Promise<PeriodTemplateRow[]>;
  }

  /**
   * Find distinct year_group_ids that have period templates configured.
   * Used by scheduler orchestration prerequisites to check coverage.
   */
  async findPeriodGridYearGroupIds(
    tenantId: string,
    academicYearId: string,
  ): Promise<Array<{ year_group_id: string | null }>> {
    return this.prisma.schedulePeriodTemplate.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        schedule_period_type: 'teaching',
      },
      select: { year_group_id: true },
      distinct: ['year_group_id'],
    });
  }

  /**
   * Find distinct teaching period slots (weekday + period_order) for slot counting.
   */
  async findDistinctTeachingSlots(
    tenantId: string,
    academicYearId: string,
  ): Promise<Array<{ weekday: number; period_order: number }>> {
    return this.prisma.schedulePeriodTemplate.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        schedule_period_type: 'teaching',
      },
      select: { weekday: true, period_order: true },
      distinct: ['weekday', 'period_order'],
    });
  }

  // ─── Class Scheduling Requirements ──────────────────────────────────────────

  /**
   * Count class scheduling requirements for an academic year. Used by
   * scheduling-runs dashboard and prerequisites.
   */
  async countClassRequirements(
    tenantId: string,
    academicYearId: string,
    opts?: { activeAcademicOnly?: boolean },
  ): Promise<number> {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
    };

    if (opts?.activeAcademicOnly) {
      where.class_entity = { status: 'active', subject: { subject_type: 'academic' } };
    }

    return this.prisma.classSchedulingRequirement.count({ where });
  }

  /**
   * Find all class scheduling requirements with class details. Used by the
   * scheduling dashboard to determine unassigned classes.
   */
  async findClassRequirementsWithDetails(
    tenantId: string,
    academicYearId: string,
    opts?: { activeAcademicOnly?: boolean },
  ): Promise<ClassSchedulingRequirementRow[]> {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
    };

    if (opts?.activeAcademicOnly) {
      where.class_entity = { status: 'active', subject: { subject_type: 'academic' } };
    }

    return this.prisma.classSchedulingRequirement.findMany({
      where,
      select: {
        id: true,
        tenant_id: true,
        class_id: true,
        academic_year_id: true,
        periods_per_week: true,
        class_entity: {
          select: {
            id: true,
            name: true,
            status: true,
            subject: { select: { name: true, subject_type: true } },
            year_group: { select: { name: true } },
          },
        },
      },
    }) as unknown as Promise<ClassSchedulingRequirementRow[]>;
  }

  // ─── Curriculum Requirements ────────────────────────────────────────────────

  /**
   * Find curriculum requirements for an academic year with subject/year group names.
   * Used by scheduler orchestration for prerequisite checks and solver input assembly.
   */
  async findCurriculumRequirements(
    tenantId: string,
    academicYearId: string,
    opts?: { yearGroupIds?: string[] },
  ): Promise<CurriculumRequirementRow[]> {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
    };

    if (opts?.yearGroupIds) {
      where.year_group_id = { in: opts.yearGroupIds };
    }

    return this.prisma.curriculumRequirement.findMany({
      where,
      include: {
        subject: { select: { name: true } },
        year_group: { select: { name: true } },
      },
    }) as unknown as Promise<CurriculumRequirementRow[]>;
  }

  /**
   * Find distinct year_group_ids that have curriculum requirements.
   */
  async findCurriculumYearGroupIds(
    tenantId: string,
    academicYearId: string,
    yearGroupIds?: string[],
  ): Promise<Array<{ year_group_id: string }>> {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
    };

    if (yearGroupIds) {
      where.year_group_id = { in: yearGroupIds };
    }

    return this.prisma.curriculumRequirement.findMany({
      where,
      select: { year_group_id: true },
      distinct: ['year_group_id'],
    }) as unknown as Promise<Array<{ year_group_id: string }>>;
  }

  // ─── Teacher Competencies ───────────────────────────────────────────────────

  /**
   * Find teacher competencies for an academic year. Used by scheduler
   * orchestration for solver input and by cover-teacher for substitute ranking.
   */
  async findTeacherCompetencies(
    tenantId: string,
    academicYearId: string,
    opts?: { subjectId?: string; yearGroupId?: string },
  ): Promise<TeacherCompetencyRow[]> {
    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
    };

    if (opts?.subjectId) where.subject_id = opts.subjectId;
    if (opts?.yearGroupId) where.year_group_id = opts.yearGroupId;

    return this.prisma.teacherCompetency.findMany({
      where,
      select: {
        staff_profile_id: true,
        subject_id: true,
        year_group_id: true,
        is_primary: true,
      },
    });
  }

  // ─── Teacher Scheduling Configs ─────────────────────────────────────────────

  /**
   * Find teacher scheduling configs for an academic year. Used by the
   * analytics efficiency dashboard and solver input assembly.
   */
  async findTeacherConfigs(
    tenantId: string,
    academicYearId: string,
  ): Promise<TeacherSchedulingConfigRow[]> {
    return this.prisma.teacherSchedulingConfig.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      select: {
        staff_profile_id: true,
        max_periods_per_week: true,
        max_periods_per_day: true,
        max_supervision_duties_per_week: true,
      },
    });
  }

  // ─── Substitution Records ───────────────────────────────────────────────────

  /**
   * Count substitution records for a tenant. Used by scheduling analytics.
   */
  async countSubstitutionRecords(tenantId: string): Promise<number> {
    return this.prisma.substitutionRecord.count({
      where: { tenant_id: tenantId },
    });
  }

  /**
   * Count recent substitution records grouped by substitute staff.
   * Used by cover-teacher ranking for fairness.
   */
  async countRecentSubstitutionsByStaff(
    tenantId: string,
    sinceDate: Date,
  ): Promise<Map<string, number>> {
    const records = await this.prisma.substitutionRecord.findMany({
      where: { tenant_id: tenantId, created_at: { gte: sinceDate } },
      select: { substitute_staff_id: true },
    });

    const map = new Map<string, number>();
    for (const r of records) {
      map.set(r.substitute_staff_id, (map.get(r.substitute_staff_id) ?? 0) + 1);
    }
    return map;
  }

  // ─── Break Groups ───────────────────────────────────────────────────────────

  /**
   * Find break groups for an academic year with year group links.
   * Used by solver input assembly.
   */
  async findBreakGroups(tenantId: string, academicYearId: string): Promise<BreakGroupRow[]> {
    return this.prisma.breakGroup.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      include: { year_groups: { select: { year_group_id: true } } },
    }) as unknown as Promise<BreakGroupRow[]>;
  }
}
