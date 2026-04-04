import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';

// ─── Return types ─────────────────────────────────────────────────────────────

/** Lightweight academic year projection returned by read facade. */
interface AcademicYearSummary {
  id: string;
  name: string;
  start_date: Date;
  end_date: Date;
  status: string;
}

/** Academic period with its parent year name. */
interface AcademicPeriodWithYear {
  id: string;
  academic_year_id: string;
  name: string;
  period_type: string;
  start_date: Date;
  end_date: Date;
  status: string;
  academic_year: { name: string };
}

/** Academic period without the year relation. */
interface AcademicPeriodSummary {
  id: string;
  academic_year_id: string;
  name: string;
  period_type: string;
  start_date: Date;
  end_date: Date;
  status: string;
}

/** Student summary embedded in enrolment results. */
interface EnrolmentStudentSummary {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string | null;
  student_number: string | null;
}

/** Single class-enrolment row with embedded student. */
interface ClassEnrolmentRow {
  id: string;
  class_id: string;
  student_id: string;
  status: string;
  start_date: Date;
  end_date: Date | null;
  student: EnrolmentStudentSummary;
}

/** Class summary embedded in student-enrolment results. */
interface EnrolmentClassSummary {
  id: string;
  name: string;
  academic_year_id: string;
}

/** Single class-enrolment row with embedded class info. */
interface StudentEnrolmentRow {
  id: string;
  class_id: string;
  student_id: string;
  status: string;
  start_date: Date;
  end_date: Date | null;
  class_entity: EnrolmentClassSummary;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

/**
 * Read-only facade for academic periods and class enrolments.
 * Consumers: gradebook, scheduling, reporting.
 *
 * All methods are tenant-scoped reads — no RLS transaction needed.
 */
@Injectable()
export class AcademicReadFacade {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => ClassesReadFacade))
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  // ─── Academic periods ───────────────────────────────────────────────────────

  /** Return the single active academic period for a tenant, or null. */
  async findCurrentPeriod(tenantId: string): Promise<AcademicPeriodWithYear | null> {
    return this.prisma.academicPeriod.findFirst({
      where: { tenant_id: tenantId, status: 'active' },
      include: { academic_year: { select: { name: true } } },
    });
  }

  /** Return a period by id with its parent academic year name. */
  async findPeriodById(tenantId: string, periodId: string): Promise<AcademicPeriodWithYear | null> {
    return this.prisma.academicPeriod.findFirst({
      where: { id: periodId, tenant_id: tenantId },
      include: { academic_year: { select: { name: true } } },
    });
  }

  /** Return all periods belonging to a given academic year, ordered by start date. */
  async findPeriodsForYear(tenantId: string, yearId: string): Promise<AcademicPeriodSummary[]> {
    return this.prisma.academicPeriod.findMany({
      where: { tenant_id: tenantId, academic_year_id: yearId },
      orderBy: { start_date: 'asc' },
    });
  }

  // ─── Academic years ─────────────────────────────────────────────────────────

  /** Return the single active academic year for a tenant, or null. */
  async findCurrentYear(tenantId: string): Promise<AcademicYearSummary | null> {
    return this.prisma.academicYear.findFirst({
      where: { tenant_id: tenantId, status: 'active' },
    });
  }

  /**
   * Find an academic year by ID. Returns `null` if not found.
   * Used by scheduling, scheduling-runs, and other modules to validate year references.
   */
  async findYearById(tenantId: string, yearId: string): Promise<AcademicYearSummary | null> {
    return this.prisma.academicYear.findFirst({
      where: { id: yearId, tenant_id: tenantId },
    });
  }

  /**
   * Assert that an academic year exists. Returns the ID or throws NotFoundException.
   */
  async findYearByIdOrThrow(tenantId: string, yearId: string): Promise<string> {
    const year = await this.prisma.academicYear.findFirst({
      where: { id: yearId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!year) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year "${yearId}" not found`,
      });
    }
    return year.id;
  }

  /**
   * Find all subjects for a tenant. Used by scheduling for validation.
   */
  async findSubjectByIdOrThrow(tenantId: string, subjectId: string): Promise<string> {
    const subject = await this.prisma.subject.findFirst({
      where: { id: subjectId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!subject) {
      throw new NotFoundException({
        code: 'SUBJECT_NOT_FOUND',
        message: `Subject "${subjectId}" not found`,
      });
    }
    return subject.id;
  }

  /**
   * Assert that a year group exists. Returns the ID or throws NotFoundException.
   */
  async findYearGroupByIdOrThrow(tenantId: string, yearGroupId: string): Promise<string> {
    const yg = await this.prisma.yearGroup.findFirst({
      where: { id: yearGroupId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!yg) {
      throw new NotFoundException({
        code: 'YEAR_GROUP_NOT_FOUND',
        message: `Year group "${yearGroupId}" not found`,
      });
    }
    return yg.id;
  }

  /**
   * Find year groups that have active classes for an academic year.
   * Used by scheduler prerequisites and orchestration.
   */
  async findYearGroupsWithActiveClasses(
    tenantId: string,
    academicYearId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.yearGroup.findMany({
      where: {
        tenant_id: tenantId,
        classes: {
          some: { academic_year_id: academicYearId, status: 'active' },
        },
      },
      select: { id: true, name: true },
    });
  }

  /**
   * Find all year groups for a tenant. Used by teacher competency coverage.
   */
  async findAllYearGroups(tenantId: string): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.yearGroup.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Find all year groups ordered by display_order. Used by class assignments.
   */
  async findAllYearGroupsWithOrder(
    tenantId: string,
  ): Promise<Array<{ id: string; name: string; display_order: number }>> {
    return this.prisma.yearGroup.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, name: true, display_order: true },
      orderBy: { display_order: 'asc' },
    });
  }

  /**
   * Find all subjects by IDs with name and code. Used by teacher competency coverage.
   */
  async findSubjectsByIdsWithOrder(
    tenantId: string,
    subjectIds: string[],
  ): Promise<Array<{ id: string; name: string; code: string | null }>> {
    if (subjectIds.length === 0) return [];
    return this.prisma.subject.findMany({
      where: { id: { in: subjectIds }, tenant_id: tenantId },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Return the ID of the current (active) academic year for a tenant.
   * Throws NotFoundException if no active academic year exists.
   */
  async findCurrentYearId(tenantId: string): Promise<string> {
    const year = await this.prisma.academicYear.findFirst({
      where: { tenant_id: tenantId, status: 'active' },
      select: { id: true },
    });

    if (!year) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: 'No active academic year found for this tenant',
      });
    }

    return year.id;
  }

  /**
   * Find year groups with active classes and student counts for an academic year.
   * Used by scheduler orchestration to build solver input.
   */
  async findYearGroupsWithClassesAndCounts(
    tenantId: string,
    academicYearId: string,
  ): Promise<
    Array<{
      id: string;
      name: string;
      classes: Array<{
        id: string;
        name: string;
        _count: { class_enrolments: number };
      }>;
    }>
  > {
    return this.prisma.yearGroup.findMany({
      where: {
        tenant_id: tenantId,
        classes: {
          some: { academic_year_id: academicYearId, status: 'active' },
        },
      },
      include: {
        classes: {
          where: { academic_year_id: academicYearId, status: 'active' },
          select: {
            id: true,
            name: true,
            _count: { select: { class_enrolments: { where: { status: 'active' } } } },
          },
        },
      },
    });
  }

  // ─── Class enrolments ───────────────────────────────────────────────────────

  /**
   * Return enrolled students for a class.
   * When periodId is provided, only active enrolments whose date range overlaps
   * the period's date range are returned (enrolments are year-level, not
   * period-level, so overlap filtering bridges the gap).
   * Without periodId, returns all active enrolments.
   */
  async findClassEnrolments(
    tenantId: string,
    classId: string,
    periodId?: string,
  ): Promise<ClassEnrolmentRow[]> {
    const dateFilter = periodId ? await this.buildPeriodDateFilter(tenantId, periodId) : undefined;

    return this.classesReadFacade.findEnrolmentsGeneric(
      tenantId,
      {
        class_id: classId,
        status: 'active',
        ...(dateFilter && {
          start_date: { lte: dateFilter.end_date },
          OR: [{ end_date: null }, { end_date: { gte: dateFilter.start_date } }],
        }),
      },
      {
        id: true,
        class_id: true,
        student_id: true,
        status: true,
        start_date: true,
        end_date: true,
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            full_name: true,
            student_number: true,
          },
        },
      },
      { start_date: 'asc' },
    ) as Promise<ClassEnrolmentRow[]>;
  }

  /**
   * Return all class enrolments for a student.
   * When periodId is provided, only enrolments overlapping that period are returned.
   * Without periodId, returns all active enrolments.
   */
  async findStudentEnrolments(
    tenantId: string,
    studentId: string,
    periodId?: string,
  ): Promise<StudentEnrolmentRow[]> {
    const dateFilter = periodId ? await this.buildPeriodDateFilter(tenantId, periodId) : undefined;

    return this.classesReadFacade.findEnrolmentsGeneric(
      tenantId,
      {
        student_id: studentId,
        status: 'active',
        ...(dateFilter && {
          start_date: { lte: dateFilter.end_date },
          OR: [{ end_date: null }, { end_date: { gte: dateFilter.start_date } }],
        }),
      },
      {
        id: true,
        class_id: true,
        student_id: true,
        status: true,
        start_date: true,
        end_date: true,
        class_entity: {
          select: {
            id: true,
            name: true,
            academic_year_id: true,
          },
        },
      },
      { start_date: 'asc' },
    ) as Promise<StudentEnrolmentRow[]>;
  }

  /**
   * Return the student IDs for all active enrolments in a given class.
   * Useful for bulk operations that only need IDs (e.g. attendance seeding, grade init).
   */
  async findStudentIdsForClass(tenantId: string, classId: string): Promise<string[]> {
    return this.classesReadFacade.findEnrolledStudentIds(tenantId, classId);
  }

  // ─── Year Groups ─────────────────────────────────────────────────────────

  /**
   * Find a year group by ID. Returns `null` if not found.
   * Used by finance fee-structures to validate year_group_id.
   */
  async findYearGroupById(
    tenantId: string,
    yearGroupId: string,
  ): Promise<{ id: string; name: string } | null> {
    return this.prisma.yearGroup.findFirst({
      where: { id: yearGroupId, tenant_id: tenantId },
      select: { id: true, name: true },
    });
  }

  // ─── Subjects ──────────────────────────────────────────────────────────────

  /**
   * Find a single subject by ID. Returns `null` if not found.
   * Used by gradebook rubric and homework analytics for subject validation.
   */
  async findSubjectById(
    tenantId: string,
    subjectId: string,
  ): Promise<{ id: string; name: string; code: string | null; subject_type: string } | null> {
    return this.prisma.subject.findFirst({
      where: { id: subjectId, tenant_id: tenantId },
      select: { id: true, name: true, code: true, subject_type: true },
    });
  }

  /**
   * Batch lookup of subjects by IDs. Missing IDs are silently excluded.
   * Used by behaviour-incident-analytics and gradebook analytics for subject name resolution.
   */
  async findSubjectsByIds(
    tenantId: string,
    subjectIds: string[],
  ): Promise<Array<{ id: string; name: string; code: string | null }>> {
    if (subjectIds.length === 0) return [];

    return this.prisma.subject.findMany({
      where: { id: { in: subjectIds }, tenant_id: tenantId },
      select: { id: true, name: true, code: true },
    });
  }

  /**
   * Batch lookup of academic periods by IDs, returning id + name.
   * Missing IDs are silently excluded.
   * Used by gradebook analytics for period name resolution.
   */
  async findPeriodsByIds(
    tenantId: string,
    periodIds: string[],
  ): Promise<Array<{ id: string; name: string }>> {
    if (periodIds.length === 0) return [];

    return this.prisma.academicPeriod.findMany({
      where: { id: { in: periodIds }, tenant_id: tenantId },
      select: { id: true, name: true },
    });
  }

  // ─── Academic Year by Name ──────────────────────────────────────────────────

  /**
   * Find an academic year by its name (e.g., '2024-2025').
   * Used by regulatory services for DES/October returns.
   */
  async findYearByName(
    tenantId: string,
    name: string,
  ): Promise<{
    id: string;
    name: string;
    start_date: Date;
    end_date: Date;
    status: string;
  } | null> {
    return this.prisma.academicYear.findFirst({
      where: { tenant_id: tenantId, name },
    });
  }

  // ─── Generic Subject Queries ──────────────────────────���───────────────────

  /**
   * Count subjects with an arbitrary where clause.
   * Used by regulatory DES readiness checks.
   */
  async countSubjects(tenantId: string, where?: Prisma.SubjectWhereInput): Promise<number> {
    return this.prisma.subject.count({
      where: { tenant_id: tenantId, ...where },
    });
  }

  /**
   * Generic findMany for subjects with arbitrary where/include/select/orderBy.
   * Used by regulatory DES for subject data collection with DES code mappings.
   */
  async findSubjectsGeneric(
    tenantId: string,
    options: {
      where?: Prisma.SubjectWhereInput;
      include?: Prisma.SubjectInclude;
      select?: Prisma.SubjectSelect;
      orderBy?: Prisma.SubjectOrderByWithRelationInput;
    },
  ): Promise<unknown[]> {
    return this.prisma.subject.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.include && { include: options.include }),
      ...(options.select && { select: options.select }),
      ...(options.orderBy && { orderBy: options.orderBy }),
    });
  }

  /**
   * Find the academic period that covers a given date within a specific academic year.
   * Returns `null` if no period covers the date.
   * Used by behaviour admin for resolving current period context.
   */
  async findPeriodCoveringDate(
    tenantId: string,
    academicYearId: string,
    date: Date,
  ): Promise<{ id: string } | null> {
    return this.prisma.academicPeriod.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        start_date: { lte: date },
        end_date: { gte: date },
      },
      select: { id: true },
    });
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /** Resolve a period's date range for overlap filtering. Returns null if not found. */
  private async buildPeriodDateFilter(
    tenantId: string,
    periodId: string,
  ): Promise<{ start_date: Date; end_date: Date } | null> {
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id: periodId, tenant_id: tenantId },
      select: { start_date: true, end_date: true },
    });
    return period;
  }

  // ─── Generic Methods (reports-data-access) ─────────────────────────────────

  /**
   * Generic findMany for year groups with optional select/orderBy.
   * Used by reports-data-access for year group queries.
   */
  async findYearGroupsGeneric(
    tenantId: string,
    select?: Prisma.YearGroupSelect,
    orderBy?: Prisma.YearGroupOrderByWithRelationInput,
  ): Promise<unknown[]> {
    return this.prisma.yearGroup.findMany({
      where: { tenant_id: tenantId },
      ...(select && { select }),
      ...(orderBy ? { orderBy } : { orderBy: { display_order: 'asc' } }),
    });
  }

  /**
   * Generic findMany for academic periods with optional where/select.
   * Used by reports-data-access for period queries.
   */
  async findPeriodsGeneric(
    tenantId: string,
    where?: Prisma.AcademicPeriodWhereInput,
    select?: Prisma.AcademicPeriodSelect,
  ): Promise<unknown[]> {
    return this.prisma.academicPeriod.findMany({
      where: { tenant_id: tenantId, ...where },
      ...(select && { select }),
    });
  }

  /**
   * Generic findMany for subjects with optional select.
   * Used by reports-data-access for subject queries.
   */
  async findAllSubjects(tenantId: string, select?: Prisma.SubjectSelect): Promise<unknown[]> {
    return this.prisma.subject.findMany({
      where: { tenant_id: tenantId },
      ...(select && { select }),
    });
  }
}
