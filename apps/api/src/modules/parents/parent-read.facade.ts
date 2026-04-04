/**
 * ParentReadFacade — Centralized read-only access to parent data.
 *
 * PURPOSE:
 * Other modules (compliance, engagement, communications, pastoral, homework,
 * finance, early-warning, behaviour, attendance, imports, admissions, reports,
 * gradebook, gdpr, registration, search) frequently need to look up parent
 * records, resolve parent IDs from user IDs, and check parent-student links.
 * Today each module queries `prisma.parent` and `prisma.studentParent` directly,
 * duplicating select clauses and coupling tightly to the schema.
 *
 * This facade provides a single, well-typed entry point for all cross-module
 * parent reads. It keeps select clauses in one place, so schema changes
 * propagate through a single file instead of 15+ consumer modules.
 *
 * NOTE: The StudentReadFacade in the students module covers `studentParent`
 * reads oriented from the student side (findParentsForStudent, isParentLinked).
 * This facade covers the `parent` table itself and parent-oriented lookups
 * (resolve from userId, find by ID, find phone/contact info, etc.).
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Returns `null` when a single record is not found (callers decide whether to throw).
 * - Batch methods return arrays (empty = nothing found).
 */
import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Common select shapes ─────────────────────────────────────────────────────

/** Fields for parent display — cross-module references, DSAR, lists. */
const PARENT_SUMMARY_SELECT = {
  id: true,
  tenant_id: true,
  user_id: true,
  first_name: true,
  last_name: true,
  email: true,
  phone: true,
  whatsapp_phone: true,
  preferred_contact_channels: true,
  relationship_label: true,
  is_primary_contact: true,
  is_billing_contact: true,
  status: true,
  created_at: true,
  updated_at: true,
} as const;

/** Minimal fields for phone/contact resolution — notification dispatch. */
const PARENT_CONTACT_SELECT = {
  id: true,
  phone: true,
  whatsapp_phone: true,
  preferred_contact_channels: true,
} as const;

/** Minimal fields for identity resolution. */
const PARENT_ID_SELECT = {
  id: true,
  user_id: true,
} as const;

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ParentSummaryRow {
  id: string;
  tenant_id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  preferred_contact_channels: unknown;
  relationship_label: string | null;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export interface ParentContactRow {
  id: string;
  phone: string | null;
  whatsapp_phone: string | null;
  preferred_contact_channels: unknown;
}

export interface ParentIdRow {
  id: string;
  user_id: string | null;
}

export interface StudentParentLinkRow {
  student_id: string;
  parent_id: string;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class ParentReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a single parent by ID with summary fields.
   * Returns `null` if not found.
   */
  async findById(tenantId: string, parentId: string): Promise<ParentSummaryRow | null> {
    return this.prisma.parent.findFirst({
      where: { id: parentId, tenant_id: tenantId },
      select: PARENT_SUMMARY_SELECT,
    });
  }

  /**
   * Batch lookup of parents by IDs. Missing IDs are silently excluded.
   */
  async findByIds(tenantId: string, parentIds: string[]): Promise<ParentSummaryRow[]> {
    if (parentIds.length === 0) return [];

    return this.prisma.parent.findMany({
      where: { id: { in: parentIds }, tenant_id: tenantId },
      select: PARENT_SUMMARY_SELECT,
    });
  }

  /**
   * Resolve a parent record from a user ID.
   * Most cross-module consumers use this pattern: look up the parent linked
   * to the authenticated user, then proceed with parent-specific logic.
   * Returns `null` if no parent record is linked to the user at this tenant.
   */
  async findByUserId(tenantId: string, userId: string): Promise<ParentSummaryRow | null> {
    return this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
      select: PARENT_SUMMARY_SELECT,
    });
  }

  /**
   * Resolve a parent record from a user ID, requiring active status.
   * Many parent-portal endpoints require the parent to be active.
   * Returns `null` if not found or not active.
   */
  async findActiveByUserId(tenantId: string, userId: string): Promise<ParentSummaryRow | null> {
    return this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId, status: 'active' },
      select: PARENT_SUMMARY_SELECT,
    });
  }

  /**
   * Assert that a parent exists for the given tenant. Throws NotFoundException if not.
   */
  async existsOrThrow(tenantId: string, parentId: string): Promise<void> {
    const found = await this.prisma.parent.findFirst({
      where: { id: parentId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!found) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: `Parent with id "${parentId}" not found`,
      });
    }
  }

  /**
   * Find all active parent IDs for a tenant.
   * Used by audience resolution for school-wide broadcasts.
   */
  async findAllActiveIds(tenantId: string): Promise<string[]> {
    const parents = await this.prisma.parent.findMany({
      where: { tenant_id: tenantId, user_id: { not: null }, status: 'active' },
      select: { id: true },
    });
    return parents.map((p) => p.id);
  }

  /**
   * Resolve phone/contact info for a parent by user ID.
   * Used by notification dispatch to determine WhatsApp/SMS contact details.
   */
  async findContactByUserId(tenantId: string, userId: string): Promise<ParentContactRow | null> {
    return this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
      select: PARENT_CONTACT_SELECT,
    });
  }

  /**
   * Resolve parent ID from user ID (minimal select).
   * Used for checking if a user has a parent record without loading full profile.
   */
  async resolveIdByUserId(tenantId: string, userId: string): Promise<string | null> {
    const parent = await this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
      select: { id: true },
    });
    return parent?.id ?? null;
  }

  /**
   * Batch contact resolution for active parents by IDs.
   * Used by audience resolution to build notification targets.
   */
  async findActiveContactsByIds(
    tenantId: string,
    parentIds: string[],
  ): Promise<Array<{ user_id: string; preferred_contact_channels: unknown }>> {
    if (parentIds.length === 0) return [];

    const parents = await this.prisma.parent.findMany({
      where: {
        id: { in: parentIds },
        tenant_id: tenantId,
        user_id: { not: null },
        status: 'active',
      },
      select: {
        user_id: true,
        preferred_contact_channels: true,
      },
    });

    const results: Array<{ user_id: string; preferred_contact_channels: unknown }> = [];
    for (const p of parents) {
      if (p.user_id !== null) {
        results.push({
          user_id: p.user_id,
          preferred_contact_channels: p.preferred_contact_channels,
        });
      }
    }
    return results;
  }

  // ─── Student-Parent link reads (parent-oriented) ──────────────────────────

  /**
   * Get all student IDs linked to a parent.
   * Used by many parent-portal flows to determine which students a parent can access.
   */
  async findLinkedStudentIds(tenantId: string, parentId: string): Promise<string[]> {
    const links = await this.prisma.studentParent.findMany({
      where: { tenant_id: tenantId, parent_id: parentId },
      select: { student_id: true },
    });
    return links.map((l) => l.student_id);
  }

  /**
   * Get student-parent links for a student, including the parent's user_id.
   * Used by early-warning and attendance notifications to resolve parent user IDs.
   */
  async findParentUserIdsForStudent(tenantId: string, studentId: string): Promise<ParentIdRow[]> {
    const links = await this.prisma.studentParent.findMany({
      where: { student_id: studentId, tenant_id: tenantId },
      include: { parent: { select: PARENT_ID_SELECT } },
    });

    return links.map((l) => l.parent);
  }

  /**
   * Verify a specific student-parent link exists.
   * Returns `true` if the parent is linked to the student at this tenant.
   */
  async isLinkedToStudent(tenantId: string, parentId: string, studentId: string): Promise<boolean> {
    const link = await this.prisma.studentParent.findFirst({
      where: { tenant_id: tenantId, parent_id: parentId, student_id: studentId },
      select: { student_id: true },
    });
    return !!link;
  }

  /**
   * Batch parent-ID-to-student-IDs resolution from multiple students.
   * Returns parent IDs that are linked to any of the given student IDs.
   * Used by audience resolution for year-group/class-scoped broadcasts.
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
   * Get student-parent links including parent's contact details.
   * Used by attendance notification service to resolve contact info for each parent.
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
   * Get student-parent links with student details — used in DSAR parent data collection.
   * Returns student links with basic student display fields.
   */
  /**
   * Find an active parent by user ID, including the user's preferred locale.
   * Used by behaviour parent service for locale-aware rendering.
   */
  async findActiveByUserIdWithLocale(
    tenantId: string,
    userId: string,
  ): Promise<(ParentSummaryRow & { user: { preferred_locale: string | null } | null }) | null> {
    return this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId, status: 'active' },
      select: {
        ...PARENT_SUMMARY_SELECT,
        user: { select: { preferred_locale: true } },
      },
    });
  }

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
   * Find an active parent by user ID, including the user's preferred locale.
   * Used by behaviour parent service for locale-aware rendering.
   */
  async findActiveByUserIdWithLocale(
    tenantId: string,
    userId: string,
  ): Promise<(ParentSummaryRow & { user: { preferred_locale: string | null } | null }) | null> {
    return this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId, status: 'active' },
      select: {
        ...PARENT_SUMMARY_SELECT,
        user: { select: { preferred_locale: true } },
      },
    });
  }
}
