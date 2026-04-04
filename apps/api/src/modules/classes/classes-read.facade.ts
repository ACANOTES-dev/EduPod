/**
 * ClassesReadFacade — Centralized read service for class and class-enrolment data.
 *
 * PURPOSE:
 * Other modules (gradebook, attendance, scheduling, finance, reports) frequently
 * need to look up class details, enrolled students, and enrolment counts. Today
 * each module queries `prisma.class` and `prisma.classEnrolment` directly,
 * duplicating select clauses and coupling tightly to the schema.
 *
 * This facade provides a single, well-typed entry point for all cross-module
 * class reads. It keeps select clauses in one place, so schema changes
 * propagate through a single file instead of many consumer modules.
 *
 * NOTE: The AcademicReadFacade in the academics module covers some enrolment
 * patterns (findClassEnrolments, findStudentEnrolments, findStudentIdsForClass).
 * This facade covers the `class` table itself and additional enrolment patterns
 * not present there (counts, student details, batch counts by class IDs).
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Returns `null` when a single record is not found (callers decide whether to throw).
 * - Batch methods return arrays or Maps (empty = nothing found).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import type { ClassStatus, Prisma, SubjectType } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

// ─── Common select shapes ─────────────────────────────────────────────────────

/** Fields for a class staff assignment — cross-module scheduling, reporting. */
const CLASS_STAFF_SELECT = {
  class_id: true,
  staff_profile_id: true,
  assignment_role: true,
  tenant_id: true,
} as const;

/** Fields for a class summary — display lists, cross-module references, dashboards. */
const CLASS_SUMMARY_SELECT = {
  id: true,
  name: true,
  year_group_id: true,
  subject_id: true,
  academic_year_id: true,
  status: true,
  tenant_id: true,
  year_group: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
} as const;

/** Student fields included when returning enrolments with student details. */
const ENROLMENT_STUDENT_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  student_number: true,
  year_group: { select: { id: true, name: true } },
  homeroom_class: { select: { id: true, name: true } },
} as const;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ClassSummaryRow {
  id: string;
  name: string;
  year_group_id: string | null;
  subject_id: string | null;
  academic_year_id: string;
  status: string;
  tenant_id: string;
  year_group: { id: string; name: string } | null;
  subject: { id: string; name: string } | null;
}

export interface ClassStaffRow {
  class_id: string;
  staff_profile_id: string;
  assignment_role: string;
  tenant_id: string;
}

export interface ClassEnrolmentWithStudentRow {
  id: string;
  class_id: string;
  student_id: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    student_number: string | null;
    year_group: { id: string; name: string } | null;
    homeroom_class: { id: string; name: string } | null;
  };
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class ClassesReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a single class by ID with summary fields and related year group / subject.
   * Returns `null` if not found — callers decide whether to throw.
   */
  async findById(tenantId: string, classId: string): Promise<ClassSummaryRow | null> {
    return this.prisma.class.findFirst({
      where: { id: classId, tenant_id: tenantId },
      select: CLASS_SUMMARY_SELECT,
    });
  }

  /**
   * Assert that a class exists for the given tenant. Throws NotFoundException if not.
   * Useful as a guard at the top of service methods that require a valid class reference.
   */
  async existsOrThrow(tenantId: string, classId: string): Promise<void> {
    const found = await this.prisma.class.findFirst({
      where: { id: classId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!found) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${classId}" not found`,
      });
    }
  }

  /**
   * Find all classes belonging to a specific year group, ordered by name.
   * Returns an empty array if none exist.
   */
  async findByYearGroup(tenantId: string, yearGroupId: string): Promise<ClassSummaryRow[]> {
    return this.prisma.class.findMany({
      where: { tenant_id: tenantId, year_group_id: yearGroupId },
      select: CLASS_SUMMARY_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Return the IDs of all actively enrolled students in a class.
   * Useful when only student IDs are needed (e.g., filtering, permission checks).
   */
  async findEnrolledStudentIds(tenantId: string, classId: string): Promise<string[]> {
    const enrolments = await this.prisma.classEnrolment.findMany({
      where: { tenant_id: tenantId, class_id: classId, status: 'active' },
      select: { student_id: true },
    });

    return enrolments.map((e) => e.student_id);
  }

  /**
   * Count the number of actively enrolled students in a class.
   */
  async countEnrolledStudents(tenantId: string, classId: string): Promise<number> {
    return this.prisma.classEnrolment.count({
      where: { tenant_id: tenantId, class_id: classId, status: 'active' },
    });
  }

  /**
   * Return active enrolments for a class with nested student display fields.
   * Includes year group and homeroom class on each student for context.
   * Ordered by student first_name ascending.
   */
  async findEnrolledStudentsWithDetails(
    tenantId: string,
    classId: string,
  ): Promise<ClassEnrolmentWithStudentRow[]> {
    return this.prisma.classEnrolment.findMany({
      where: { tenant_id: tenantId, class_id: classId, status: 'active' },
      select: {
        id: true,
        class_id: true,
        student_id: true,
        student: { select: ENROLMENT_STUDENT_SELECT },
      },
      orderBy: { student: { first_name: 'asc' } },
    });
  }

  /**
   * Batch count of active enrolments grouped by class ID.
   * Returns a Map where keys are class IDs and values are student counts.
   * Classes with zero enrolments are included with count 0 if they appear in the input.
   * Used by grade publishing readiness dashboard and class list views.
   */
  async findEnrolmentCountsByClasses(
    tenantId: string,
    classIds: string[],
  ): Promise<Map<string, number>> {
    if (classIds.length === 0) return new Map();

    const groups = await this.prisma.classEnrolment.groupBy({
      by: ['class_id'],
      where: { tenant_id: tenantId, class_id: { in: classIds }, status: 'active' },
      _count: { student_id: true },
    });

    const map = new Map<string, number>();
    // Seed all requested IDs with 0 so callers don't need null checks
    for (const id of classIds) {
      map.set(id, 0);
    }
    for (const g of groups) {
      map.set(g.class_id, g._count.student_id);
    }
    return map;
  }

  // ─── Class Staff ──────────────────────────────────────────────────────────

  /**
   * Return all staff assignments for a given class.
   * Used by scheduling, reports, compliance, early-warning.
   */
  async findStaffByClass(tenantId: string, classId: string): Promise<ClassStaffRow[]> {
    return this.prisma.classStaff.findMany({
      where: { tenant_id: tenantId, class_id: classId },
      select: CLASS_STAFF_SELECT,
    });
  }

  /**
   * Return all staff assignments across multiple classes in batch.
   * Used by scheduling and gradebook analytics.
   */
  async findStaffByClasses(tenantId: string, classIds: string[]): Promise<ClassStaffRow[]> {
    if (classIds.length === 0) return [];

    return this.prisma.classStaff.findMany({
      where: { tenant_id: tenantId, class_id: { in: classIds } },
      select: CLASS_STAFF_SELECT,
    });
  }

  /**
   * Return all classes assigned to a staff member.
   * Used by early-warning routing, engagement conferences, behaviour scope.
   */
  async findClassesByStaff(tenantId: string, staffProfileId: string): Promise<ClassStaffRow[]> {
    return this.prisma.classStaff.findMany({
      where: { tenant_id: tenantId, staff_profile_id: staffProfileId },
      select: CLASS_STAFF_SELECT,
    });
  }

  /**
   * Return class IDs where a staff member is assigned (any role).
   * Used by scope/permission services that need a set of class IDs for a teacher.
   */
  async findClassIdsByStaff(tenantId: string, staffProfileId: string): Promise<string[]> {
    const rows = await this.prisma.classStaff.findMany({
      where: { tenant_id: tenantId, staff_profile_id: staffProfileId },
      select: { class_id: true },
    });
    return rows.map((r) => r.class_id);
  }

  /**
   * Return staff assignments for all classes in a year group.
   * Used by early-warning routing to find year-group-level staff.
   */
  async findStaffByYearGroup(tenantId: string, yearGroupId: string): Promise<ClassStaffRow[]> {
    return this.prisma.classStaff.findMany({
      where: {
        tenant_id: tenantId,
        class_entity: { year_group_id: yearGroupId },
      },
      select: CLASS_STAFF_SELECT,
    });
  }

  /**
   * Check if a staff member is assigned to a specific class.
   * Used by attendance session service for authorisation checks.
   */
  async isStaffAssignedToClass(
    tenantId: string,
    staffProfileId: string,
    classId: string,
  ): Promise<boolean> {
    const row = await this.prisma.classStaff.findFirst({
      where: { tenant_id: tenantId, staff_profile_id: staffProfileId, class_id: classId },
      select: { class_id: true },
    });
    return row !== null;
  }

  /**
   * Count of staff assignments for a class — used by reports.
   */
  async countStaffByClass(tenantId: string, classId: string): Promise<number> {
    return this.prisma.classStaff.count({
      where: { tenant_id: tenantId, class_id: classId },
    });
  }

  // ─── Additional Class Queries ─────────────────────────────────────────────

  /**
   * Find all classes for a given academic year.
   * Used by scheduling and reports.
   */
  async findByAcademicYear(tenantId: string, academicYearId: string): Promise<ClassSummaryRow[]> {
    return this.prisma.class.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      select: CLASS_SUMMARY_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Find all class IDs for a given academic year (lightweight).
   * Used by scheduling-run when only IDs are needed.
   */
  async findIdsByAcademicYear(tenantId: string, academicYearId: string): Promise<string[]> {
    const rows = await this.prisma.class.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Find classes by a list of IDs, returning id + name only.
   * Used by school-closures to resolve scope entity names.
   */
  async findNamesByIds(
    tenantId: string,
    classIds: string[],
  ): Promise<Array<{ id: string; name: string }>> {
    if (classIds.length === 0) return [];

    return this.prisma.class.findMany({
      where: { id: { in: classIds }, tenant_id: tenantId },
      select: { id: true, name: true },
    });
  }

  /**
   * Find class IDs belonging to a specific year group.
   * Used by school-closures to resolve affected classes for year-group scope.
   */
  async findIdsByYearGroup(tenantId: string, yearGroupId: string): Promise<string[]> {
    const rows = await this.prisma.class.findMany({
      where: { tenant_id: tenantId, year_group_id: yearGroupId },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /**
   * Find a class's year_group_id by its ID. Returns null if not found or no year group.
   * Used by school-closures for scope resolution.
   */
  async findYearGroupId(tenantId: string, classId: string): Promise<string | null> {
    const row = await this.prisma.class.findFirst({
      where: { id: classId, tenant_id: tenantId },
      select: { year_group_id: true },
    });
    return row?.year_group_id ?? null;
  }

  /**
   * Count classes for a given academic year with optional status and subject type filter.
   * Used by class-requirements and scheduling-prerequisites dashboards.
   */
  async countByAcademicYear(
    tenantId: string,
    academicYearId: string,
    opts?: { status?: string; subjectType?: string },
  ): Promise<number> {
    const where: Prisma.ClassWhereInput = {
      tenant_id: tenantId,
      academic_year_id: academicYearId,
    };
    if (opts?.status) where.status = opts.status as ClassStatus;
    if (opts?.subjectType) where.subject = { subject_type: opts.subjectType as SubjectType };

    return this.prisma.class.count({ where });
  }

  /**
   * Find active academic classes without a teacher/homeroom assignment.
   * Used by scheduling-prerequisites to check teacher coverage.
   */
  async findClassesWithoutTeachers(
    tenantId: string,
    academicYearId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.class.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        status: 'active',
        subject: { subject_type: 'academic' },
        class_staff: {
          none: { assignment_role: { in: ['teacher', 'homeroom'] } },
        },
      },
      select: { id: true, name: true },
    });
  }

  /**
   * Return class IDs for a student's active enrolments.
   * Used by timetables to build a student's schedule.
   */
  async findClassIdsForStudent(tenantId: string, studentId: string): Promise<string[]> {
    const enrolments = await this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: 'active',
      },
      select: { class_id: true },
    });
    return enrolments.map((e) => e.class_id);
  }

  /**
   * Find active enrolments for students across other classes (excluding a specific class).
   * Used by conflict detection to check student double-booking.
   */
  async findOtherClassEnrolmentsForStudents(
    tenantId: string,
    studentIds: string[],
    excludeClassId: string,
  ): Promise<Array<{ class_id: string; student_id: string }>> {
    if (studentIds.length === 0) return [];

    return this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        student_id: { in: studentIds },
        class_id: { not: excludeClassId },
        status: 'active',
      },
      select: { class_id: true, student_id: true },
    });
  }

  /**
   * Count active enrolments across all classes for a tenant.
   * Used by reports data access.
   */
  async countEnrolments(tenantId: string, classId?: string): Promise<number> {
    return this.prisma.classEnrolment.count({
      where: {
        tenant_id: tenantId,
        status: 'active',
        ...(classId ? { class_id: classId } : {}),
      },
    });
  }

  /**
   * Find active enrolments for a class with student details and optional date-range overlap filtering.
   * Used by AcademicReadFacade delegation and report-card/gradebook consumers.
   */
  async findClassEnrolmentsWithStudents(
    tenantId: string,
    classId: string,
    dateFilter?: { start_date: Date; end_date: Date },
  ): Promise<
    Array<{
      id: string;
      class_id: string;
      student_id: string;
      status: string;
      start_date: Date;
      end_date: Date | null;
      student: {
        id: string;
        first_name: string;
        last_name: string;
        full_name: string | null;
        student_number: string | null;
      };
    }>
  > {
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
   * Find active enrolments for a student with class details and optional date-range overlap filtering.
   * Used by AcademicReadFacade delegation and gradebook consumers.
   */
  /**
   * Find all enrolments for a student — returns class_entity with id and name.
   * Used by DSAR traversal to list all classes a student has been enrolled in.
   */
  async findEnrolmentsForStudent(
    tenantId: string,
    studentId: string,
  ): Promise<
    Array<{
      id: string;
      class_id: string;
      student_id: string;
      status: string;
      class_entity: { id: string; name: string };
    }>
  > {
    return this.prisma.classEnrolment.findMany({
      where: { student_id: studentId, tenant_id: tenantId },
      include: {
        class_entity: {
          select: { id: true, name: true },
        },
      },
    });
  }

  /**
   * Find active enrolments for a student with class details and optional date-range overlap filtering.
   * Used by AcademicReadFacade delegation and gradebook consumers.
   */
  async findStudentEnrolmentsWithClasses(
    tenantId: string,
    studentId: string,
    dateFilter?: { start_date: Date; end_date: Date },
  ): Promise<
    Array<{
      id: string;
      class_id: string;
      student_id: string;
      status: string;
      start_date: Date;
      end_date: Date | null;
      class_entity: {
        id: string;
        name: string;
        academic_year_id: string;
      };
    }>
  > {
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
   * Find all active class enrolments for classes in a given academic year.
   * Returns class_id + student_id pairs. Used by scheduler orchestration
   * for student overlap computation.
   */
  async findEnrolmentPairsForAcademicYear(
    tenantId: string,
    academicYearId: string,
  ): Promise<Array<{ class_id: string; student_id: string }>> {
    return this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        status: 'active',
        class_entity: { academic_year_id: academicYearId, status: 'active' },
      },
      select: { class_id: true, student_id: true },
    });
  }

  // ─── Generic reporting methods ──────────────────────────────────────────────

  /**
   * Count classes with an arbitrary where clause.
   * Used by reports-data-access for dashboard analytics.
   */
  async countClassesGeneric(tenantId: string, where?: Prisma.ClassWhereInput): Promise<number> {
    return this.prisma.class.count({
      where: { tenant_id: tenantId, ...where },
    });
  }

  /**
   * Generic findMany for classes with arbitrary where/select.
   * Used by reports-data-access for analytics and dashboard tables.
   */
  async findClassesGeneric(
    tenantId: string,
    where?: Prisma.ClassWhereInput,
    select?: Prisma.ClassSelect,
  ): Promise<unknown[]> {
    return this.prisma.class.findMany({
      where: { tenant_id: tenantId, ...where },
      ...(select && { select }),
    });
  }

  /**
   * Generic findMany for class staff with arbitrary where/select.
   * Used by reports-data-access for staff-class analytics.
   */
  async findClassStaffGeneric(
    tenantId: string,
    where?: Prisma.ClassStaffWhereInput,
    select?: Prisma.ClassStaffSelect,
  ): Promise<unknown[]> {
    return this.prisma.classStaff.findMany({
      where: { tenant_id: tenantId, ...where },
      ...(select && { select }),
    });
  }

  /**
   * Count class staff with an arbitrary where clause.
   * Used by reports-data-access for analytics.
   */
  async countClassStaffGeneric(
    tenantId: string,
    where?: Prisma.ClassStaffWhereInput,
  ): Promise<number> {
    return this.prisma.classStaff.count({
      where: { tenant_id: tenantId, ...where },
    });
  }

  /**
   * Count class enrolments with an arbitrary where clause.
   * Used by reports-data-access for analytics.
   */
  async countEnrolmentsGeneric(
    tenantId: string,
    where?: Prisma.ClassEnrolmentWhereInput,
  ): Promise<number> {
    return this.prisma.classEnrolment.count({
      where: { tenant_id: tenantId, ...where },
    });
  }

  /**
   * Generic findMany for class enrolments with arbitrary where/select/orderBy.
   * Used by reports-data-access for analytics.
   */
  async findEnrolmentsGeneric(
    tenantId: string,
    where?: Prisma.ClassEnrolmentWhereInput,
    select?: Prisma.ClassEnrolmentSelect,
    orderBy?: Prisma.ClassEnrolmentOrderByWithRelationInput,
  ): Promise<unknown[]> {
    return this.prisma.classEnrolment.findMany({
      where: { tenant_id: tenantId, ...where },
      ...(select && { select }),
      ...(orderBy && { orderBy }),
    });
  }

  /**
   * Find active homeroom classes (subject_id IS NULL) for an academic year.
   * Used by attendance upload template generation and validation.
   */
  async findActiveHomeroomClasses(
    tenantId: string,
    academicYearId: string,
  ): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.class.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        subject_id: null,
        status: 'active',
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Find a class by ID with its academic year dates. Used by attendance session creation
   * to validate that session_date falls within the academic year range.
   */
  async findByIdWithAcademicYear(
    tenantId: string,
    classId: string,
  ): Promise<{
    id: string;
    academic_year_id: string;
    year_group_id: string | null;
    academic_year: { start_date: Date; end_date: Date };
  } | null> {
    return this.prisma.class.findFirst({
      where: { id: classId, tenant_id: tenantId },
      select: {
        id: true,
        academic_year_id: true,
        year_group_id: true,
        academic_year: {
          select: { start_date: true, end_date: true },
        },
      },
    });
  }

  /**
   * Find enrolled students in a class with student_number for attendance views.
   * Returns student detail records ordered by last_name.
   */
  async findEnrolledStudentsWithNumber(
    tenantId: string,
    classId: string,
  ): Promise<
    Array<{
      student: {
        id: string;
        first_name: string;
        last_name: string;
        student_number: string | null;
      };
    }>
  > {
    return this.prisma.classEnrolment.findMany({
      where: { tenant_id: tenantId, class_id: classId, status: 'active' },
      select: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_number: true,
          },
        },
      },
      orderBy: { student: { last_name: 'asc' } },
    });
  }

  /**
   * Find classes with year group name and active enrolment count.
   * Used by regulatory DES File C generation.
   */
  async findClassesWithYearGroupAndEnrolmentCount(
    tenantId: string,
    academicYearId: string,
  ): Promise<unknown[]> {
    return this.prisma.class.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearId },
      include: {
        year_group: { select: { name: true } },
        _count: { select: { class_enrolments: { where: { status: 'active' } } } },
      },
      orderBy: { name: 'asc' },
    });
  }
}
