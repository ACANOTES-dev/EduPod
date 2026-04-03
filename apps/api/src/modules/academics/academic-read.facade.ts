import { Injectable, NotFoundException } from '@nestjs/common';

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
  constructor(private readonly prisma: PrismaService) {}

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

    return this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        status: 'active',
        ...(dateFilter && {
          start_date: { lte: dateFilter.end_date },
          OR: [{ end_date: null }, { end_date: { gte: dateFilter.start_date } }],
        }),
      },
      orderBy: { start_date: 'asc' },
      include: {
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
    });
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

    return this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: 'active',
        ...(dateFilter && {
          start_date: { lte: dateFilter.end_date },
          OR: [{ end_date: null }, { end_date: { gte: dateFilter.start_date } }],
        }),
      },
      orderBy: { start_date: 'asc' },
      include: {
        class_entity: {
          select: {
            id: true,
            name: true,
            academic_year_id: true,
          },
        },
      },
    });
  }

  /**
   * Return the student IDs for all active enrolments in a given class.
   * Useful for bulk operations that only need IDs (e.g. attendance seeding, grade init).
   */
  async findStudentIdsForClass(tenantId: string, classId: string): Promise<string[]> {
    const enrolments = await this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        status: 'active',
      },
      select: { student_id: true },
    });

    return enrolments.map((e) => e.student_id);
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
}
