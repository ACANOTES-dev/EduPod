/**
 * StudentReadFacade — Centralized read service for student data.
 *
 * PURPOSE:
 * Other modules (finance, attendance, grades, behaviour, pastoral care, etc.)
 * frequently need to look up student display fields, parents, and household info.
 * Today each module queries the `students` and `student_parents` tables directly
 * via Prisma, duplicating select clauses and coupling tightly to the schema.
 *
 * This facade provides a single, well-typed entry point for all cross-module
 * student reads. It keeps select clauses in one place, so schema changes
 * propagate through a single file instead of 10+ consumer modules.
 *
 * MIGRATION PLAN:
 * 1. Phase 1 (this file): Create the facade with common read methods. Register
 *    and export from StudentsModule. No consumers migrated yet.
 * 2. Phase 2 (incremental): Module by module, replace direct `prisma.student`
 *    reads with facade calls. Each migration is a small, reviewable PR.
 * 3. Phase 3 (enforcement): Once all consumers are migrated, add a lint rule
 *    or architectural test to prevent new direct student table reads outside
 *    the students module.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Returns `null` when a record is not found (callers decide whether to throw).
 * - Batch methods return arrays (empty array = nothing found).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type StudentReader = Pick<PrismaService, 'student'>;

// ─── Common select shapes ─────────────────────────────────────────────────────

/** Minimal student fields needed for display in lists, cards, and cross-module references. */
const STUDENT_DISPLAY_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  full_name: true,
  first_name_ar: true,
  last_name_ar: true,
  student_number: true,
  gender: true,
  date_of_birth: true,
  status: true,
  year_group_id: true,
  class_homeroom_id: true,
  household_id: true,
  year_group: { select: { id: true, name: true } },
  homeroom_class: { select: { id: true, name: true } },
} as const;

/** Parent fields returned in cross-module lookups. */
const PARENT_DISPLAY_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  email: true,
  phone: true,
  is_primary_contact: true,
  is_billing_contact: true,
} as const;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface StudentDisplayRow {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string | null;
  first_name_ar: string | null;
  last_name_ar: string | null;
  student_number: string | null;
  gender: string | null;
  date_of_birth: Date;
  status: string;
  year_group_id: string | null;
  class_homeroom_id: string | null;
  household_id: string;
  year_group: { id: string; name: string } | null;
  homeroom_class: { id: string; name: string } | null;
}

export interface ParentDisplayRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
}

export interface StudentParentLink {
  student_id: string;
  parent_id: string;
  relationship_label: string | null;
  parent: ParentDisplayRow;
}

export interface StudentWithHousehold extends StudentDisplayRow {
  household: {
    id: string;
    household_name: string;
    primary_billing_parent_id: string | null;
  };
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class StudentReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a single student by ID with common display fields.
   * Returns `null` if not found — callers decide whether to throw.
   */
  async findById(tenantId: string, studentId: string): Promise<StudentDisplayRow | null> {
    return this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: STUDENT_DISPLAY_SELECT,
    });
  }

  /**
   * Batch lookup of students by IDs. Returns only those that exist and belong
   * to the tenant. Order is not guaranteed — callers should index by `id`
   * if positional correspondence is needed.
   */
  async findByIds(tenantId: string, studentIds: string[]): Promise<StudentDisplayRow[]> {
    if (studentIds.length === 0) return [];

    return this.prisma.student.findMany({
      where: { id: { in: studentIds }, tenant_id: tenantId },
      select: STUDENT_DISPLAY_SELECT,
    });
  }

  /**
   * Get all parents linked to a single student via the `student_parents` join table.
   * Returns parent display fields plus the relationship label from the join row.
   */
  async findParentsForStudent(tenantId: string, studentId: string): Promise<StudentParentLink[]> {
    return this.prisma.studentParent.findMany({
      where: { student_id: studentId, tenant_id: tenantId },
      select: {
        student_id: true,
        parent_id: true,
        relationship_label: true,
        parent: { select: PARENT_DISPLAY_SELECT },
      },
    });
  }

  /**
   * Batch parent lookup for multiple students. Returns all `student_parents`
   * rows for the given student IDs. Callers can group by `student_id`.
   */
  async findParentsForStudents(
    tenantId: string,
    studentIds: string[],
  ): Promise<StudentParentLink[]> {
    if (studentIds.length === 0) return [];

    return this.prisma.studentParent.findMany({
      where: { student_id: { in: studentIds }, tenant_id: tenantId },
      select: {
        student_id: true,
        parent_id: true,
        relationship_label: true,
        parent: { select: PARENT_DISPLAY_SELECT },
      },
    });
  }

  /**
   * Student with household details, including the billing parent reference.
   * Useful for finance, invoicing, and communication modules that need to
   * resolve who pays or who to contact for a student.
   */
  async findStudentWithHousehold(
    tenantId: string,
    studentId: string,
  ): Promise<StudentWithHousehold | null> {
    return this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: {
        ...STUDENT_DISPLAY_SELECT,
        household: {
          select: {
            id: true,
            household_name: true,
            primary_billing_parent_id: true,
          },
        },
      },
    });
  }

  /**
   * Assert that a student exists for the given tenant. Throws NotFoundException if not.
   */
  async existsOrThrow(tenantId: string, studentId: string): Promise<void> {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${studentId}" not found`,
      });
    }
  }

  /**
   * Batch lookup of student display names. Returns a Map of student id to "first last" string.
   * Missing IDs are silently excluded from the result.
   */
  async findDisplayNames(tenantId: string, studentIds: string[]): Promise<Map<string, string>> {
    if (studentIds.length === 0) return new Map();

    const students = await this.prisma.student.findMany({
      where: { id: { in: studentIds }, tenant_id: tenantId },
      select: { id: true, first_name: true, last_name: true },
    });

    const map = new Map<string, string>();
    for (const s of students) {
      map.set(s.id, `${s.first_name} ${s.last_name}`);
    }
    return map;
  }

  /**
   * Return active students belonging to a specific year group.
   */
  async findActiveByYearGroup(
    tenantId: string,
    yearGroupId: string,
  ): Promise<{ id: string; first_name: string; last_name: string }[]> {
    return this.prisma.student.findMany({
      where: {
        tenant_id: tenantId,
        status: 'active',
        year_group_id: yearGroupId,
      },
      select: { id: true, first_name: true, last_name: true },
      orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }],
    });
  }

  /**
   * Count students matching a filter.
   * Used by behaviour-pulse and behaviour-incident-analytics for rate calculations.
   */
  async count(
    tenantId: string,
    where?: Prisma.StudentWhereInput,
    reader?: StudentReader,
  ): Promise<number> {
    const studentReader = reader ?? this.prisma;
    return studentReader.student.count({
      where: {
        tenant_id: tenantId,
        ...where,
      },
    });
  }

  /**
   * Check whether a parent is linked to a student via the `student_parents` join table.
   * Used by parent-finance and parent-inquiries for access control.
   */
  async isParentLinked(tenantId: string, studentId: string, parentId: string): Promise<boolean> {
    const link = await this.prisma.studentParent.findFirst({
      where: { tenant_id: tenantId, student_id: studentId, parent_id: parentId },
      select: { student_id: true },
    });
    return !!link;
  }

  /**
   * Find student IDs linked to a parent (parent-oriented lookup).
   * Used by ParentReadFacade for parent-portal flows.
   */
  async findStudentIdsByParent(tenantId: string, parentId: string): Promise<string[]> {
    const links = await this.prisma.studentParent.findMany({
      where: { tenant_id: tenantId, parent_id: parentId },
      select: { student_id: true },
    });
    return links.map((l) => l.student_id);
  }

  /**
   * Find parent user IDs for a student via student_parents join.
   * Used by ParentReadFacade for notification dispatch.
   */
  async findParentIdsForStudent(
    tenantId: string,
    studentId: string,
  ): Promise<Array<{ id: string; user_id: string | null }>> {
    const links = await this.prisma.studentParent.findMany({
      where: { student_id: studentId, tenant_id: tenantId },
      include: { parent: { select: { id: true, user_id: true } } },
    });
    return links.map((l) => l.parent);
  }

  /**
   * Check if a parent-student link exists (parent-oriented).
   * Used by ParentReadFacade for authorization checks.
   */
  async isParentLinkedToStudent(
    tenantId: string,
    parentId: string,
    studentId: string,
  ): Promise<boolean> {
    const link = await this.prisma.studentParent.findFirst({
      where: { tenant_id: tenantId, parent_id: parentId, student_id: studentId },
      select: { student_id: true },
    });
    return !!link;
  }

  /**
   * Find unique parent IDs linked to given student IDs.
   * Used by ParentReadFacade for audience resolution.
   */
  async findParentIdsByStudentIds(tenantId: string, studentIds: string[]): Promise<string[]> {
    if (studentIds.length === 0) return [];
    const links = await this.prisma.studentParent.findMany({
      where: { tenant_id: tenantId, student_id: { in: studentIds } },
      select: { parent_id: true },
    });
    return [...new Set(links.map((l) => l.parent_id))];
  }

  /**
   * Find parent contacts for a student via student_parents join.
   * Used by ParentReadFacade for attendance notifications.
   */
  async findParentContactsForStudent(
    tenantId: string,
    studentId: string,
  ): Promise<
    Array<{
      parent: {
        user_id: string | null;
        whatsapp_phone: string | null;
        phone: string | null;
        preferred_contact_channels: unknown;
      };
    }>
  > {
    return this.prisma.studentParent.findMany({
      where: { student_id: studentId, tenant_id: tenantId },
      select: {
        parent: {
          select: {
            user_id: true,
            whatsapp_phone: true,
            phone: true,
            preferred_contact_channels: true,
          },
        },
      },
    });
  }

  /**
   * Find student links for a parent with student details.
   * Used by ParentReadFacade for DSAR parent data collection.
   */
  async findStudentLinksForParent(
    tenantId: string,
    parentId: string,
  ): Promise<
    Array<{
      student_id: string;
      parent_id: string;
      student: { id: string; first_name: string; last_name: string; student_number: string | null };
    }>
  > {
    return this.prisma.studentParent.findMany({
      where: { parent_id: parentId, tenant_id: tenantId },
      select: {
        student_id: true,
        parent_id: true,
        student: {
          select: { id: true, first_name: true, last_name: true, student_number: true },
        },
      },
    });
  }

  /**
   * Find students belonging to a household. Used by DSAR household traversal.
   */
  async findByHousehold(
    tenantId: string,
    householdId: string,
  ): Promise<
    Array<{ id: string; first_name: string; last_name: string; student_number: string | null }>
  > {
    return this.prisma.student.findMany({
      where: { household_id: householdId, tenant_id: tenantId },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        student_number: true,
      },
    });
  }

  /**
   * Check if a student exists for the given tenant. Returns true/false.
   * Used by compliance validateSubjectExists.
   */
  async exists(tenantId: string, studentId: string): Promise<boolean> {
    const found = await this.prisma.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      select: { id: true },
    });
    return !!found;
  }

  /**
   * Count students grouped by year_group_id. Used by behaviour comparison analytics.
   */
  async countByYearGroup(tenantId: string, status?: string): Promise<Map<string, number>> {
    const groups = await this.prisma.student.groupBy({
      by: ['year_group_id'],
      where: {
        tenant_id: tenantId,
        ...(status ? { status: status as never } : {}),
      },
      _count: true,
    });

    const map = new Map<string, number>();
    for (const g of groups) {
      if (g.year_group_id) {
        map.set(g.year_group_id, g._count);
      }
    }
    return map;
  }

  /**
   * Load all students for a tenant with id + student_number for number-based lookups.
   * Used by attendance upload for student_number resolution.
   */
  async findAllStudentNumbers(
    tenantId: string,
    limit?: number,
  ): Promise<Array<{ id: string; student_number: string | null }>> {
    return this.prisma.student.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, student_number: true },
      ...(limit ? { take: limit } : {}),
    });
  }

  /**
   * Look up students by their student numbers. Used by attendance scan for name resolution.
   */
  async findByStudentNumbers(
    tenantId: string,
    studentNumbers: string[],
  ): Promise<
    Array<{ id: string; student_number: string | null; first_name: string; last_name: string }>
  > {
    if (studentNumbers.length === 0) return [];

    return this.prisma.student.findMany({
      where: {
        tenant_id: tenantId,
        student_number: { in: studentNumbers },
      },
      select: {
        id: true,
        student_number: true,
        first_name: true,
        last_name: true,
      },
    });
  }

  /**
   * Find active student IDs, optionally filtered by a where clause.
   * Used by engagement event-participants for target resolution.
   */
  async findActiveStudentIds(
    tenantId: string,
    where?: Prisma.StudentWhereInput,
  ): Promise<string[]> {
    const students = await this.prisma.student.findMany({
      where: {
        tenant_id: tenantId,
        status: 'active',
        ...where,
      },
      select: { id: true },
    });
    return students.map((s) => s.id);
  }

  /**
   * Generic findMany for students with arbitrary where/select/include/orderBy.
   * Used by regulatory DES/October returns for data export.
   */
  async findManyGeneric(
    tenantId: string,
    options: {
      where?: Prisma.StudentWhereInput;
      select?: Prisma.StudentSelect;
      include?: Prisma.StudentInclude;
      orderBy?: Prisma.StudentOrderByWithRelationInput;
      skip?: number;
      take?: number;
    },
    reader?: StudentReader,
  ): Promise<unknown[]> {
    const studentReader = reader ?? this.prisma;
    return studentReader.student.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.include && { include: options.include }),
      ...(options.orderBy && { orderBy: options.orderBy }),
      ...(options.skip !== undefined && { skip: options.skip }),
      ...(options.take !== undefined && { take: options.take }),
    });
  }

  /**
   * Find a single student with arbitrary select/include.
   * Used by regulatory for validating individual students.
   */
  async findOneGeneric(
    tenantId: string,
    studentId: string,
    options?: {
      select?: Prisma.StudentSelect;
      include?: Prisma.StudentInclude;
    },
    reader?: StudentReader,
  ): Promise<unknown | null> {
    const studentReader = reader ?? this.prisma;
    return studentReader.student.findFirst({
      where: { id: studentId, tenant_id: tenantId },
      ...(options?.select && { select: options.select }),
      ...(options?.include && { include: options.include }),
    });
  }

  /**
   * Find a student by ID with counts of dependent records.
   * Used by imports rollback to determine if a student can be safely deleted.
   */
  async findWithDependencyCounts(studentId: string): Promise<{
    id: string;
    _count: {
      attendance_records: number;
      grades: number;
      class_enrolments: number;
      invoice_lines: number;
      report_cards: number;
    };
  } | null> {
    return this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        _count: {
          select: {
            attendance_records: true,
            grades: true,
            class_enrolments: true,
            invoice_lines: true,
            report_cards: true,
          },
        },
      },
    });
  }

  /**
   * Group students by one or more scalar fields with counts.
   * Used by reports-data-access for demographic groupings.
   */
  async groupBy<K extends Prisma.StudentScalarFieldEnum>(
    tenantId: string,
    by: K[],
    where?: Prisma.StudentWhereInput,
  ): Promise<Array<Record<string, unknown> & { _count: number }>> {
    const result = await this.prisma.student.groupBy({
      by,
      where: { tenant_id: tenantId, ...where },
      _count: true,
    });
    return result as unknown as Array<Record<string, unknown> & { _count: number }>;
  }

  // ─── Student-user resolution ────────────────────────────────────────────

  /**
   * Resolve a student record from a user's name within a tenant.
   * Used by the student dashboard — students don't have a direct user_id
   * FK; the linkage is by name convention.
   */
  async findByUserName(
    tenantId: string,
    firstName: string,
    lastName: string,
  ): Promise<{
    id: string;
    first_name: string;
    last_name: string;
    student_number: string | null;
    class_name: string | null;
    year_group_name: string | null;
  } | null> {
    const student = await this.prisma.student.findFirst({
      where: {
        tenant_id: tenantId,
        first_name: firstName,
        last_name: lastName,
        status: 'active',
      },
      include: {
        homeroom_class: { select: { name: true } },
        year_group: { select: { name: true } },
      },
    });

    if (!student) return null;

    return {
      id: student.id,
      first_name: student.first_name,
      last_name: student.last_name,
      student_number: student.student_number,
      class_name: student.homeroom_class?.name ?? null,
      year_group_name: student.year_group?.name ?? null,
    };
  }
}
