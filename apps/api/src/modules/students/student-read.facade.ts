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

import { PrismaService } from '../prisma/prisma.service';

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
}
