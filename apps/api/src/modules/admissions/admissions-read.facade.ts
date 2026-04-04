/**
 * AdmissionsReadFacade — Centralized read-only access to admissions data.
 *
 * PURPOSE:
 * Other modules (compliance, reports, imports, early-warning) query application
 * and application note records for DSAR traversal, retention policy counts,
 * reporting dashboards, and data validation. This facade provides a single,
 * well-typed entry point for those cross-module reads.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Returns `null` when a single record is not found (callers decide whether to throw).
 * - Batch methods return arrays (empty = nothing found).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import type { ApplicationStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface ApplicationSummaryRow {
  id: string;
  tenant_id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  status: string;
  submitted_by_parent_id: string | null;
  form_definition_id: string;
  payment_status: string;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ApplicationNoteRow {
  id: string;
  tenant_id: string;
  application_id: string;
  author_user_id: string;
  note: string;
  is_internal: boolean;
  created_at: Date;
}

// ─── Select shapes ────────────────────────────────────────────────────────────

const APPLICATION_SUMMARY_SELECT = {
  id: true,
  tenant_id: true,
  application_number: true,
  student_first_name: true,
  student_last_name: true,
  status: true,
  submitted_by_parent_id: true,
  form_definition_id: true,
  payment_status: true,
  submitted_at: true,
  created_at: true,
  updated_at: true,
} as const;

const APPLICATION_NOTE_SELECT = {
  id: true,
  tenant_id: true,
  application_id: true,
  author_user_id: true,
  note: true,
  is_internal: true,
  created_at: true,
} as const;

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class AdmissionsReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a single application by ID with summary fields.
   * Returns `null` if not found.
   */
  async findById(tenantId: string, applicationId: string): Promise<ApplicationSummaryRow | null> {
    return this.prisma.application.findFirst({
      where: { id: applicationId, tenant_id: tenantId },
      select: APPLICATION_SUMMARY_SELECT,
    });
  }

  /**
   * Assert that an application exists for the given tenant. Throws NotFoundException if not.
   * Used by compliance to validate subject existence.
   */
  async existsOrThrow(tenantId: string, applicationId: string): Promise<void> {
    const found = await this.prisma.application.findFirst({
      where: { id: applicationId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!found) {
      throw new NotFoundException({
        code: 'APPLICATION_NOT_FOUND',
        message: `Application with id "${applicationId}" not found`,
      });
    }
  }

  /**
   * Find applications by parent submission or student name match.
   * Used by DSAR student data traversal to find all applications related to a student.
   */
  async findApplicationsByParentOrStudentName(
    tenantId: string,
    filters: {
      parentIds?: string[];
      studentFirstName?: string;
      studentLastName?: string;
    },
  ): Promise<ApplicationSummaryRow[]> {
    const orClauses: Record<string, unknown>[] = [];

    if (filters.parentIds && filters.parentIds.length > 0) {
      orClauses.push({ submitted_by_parent_id: { in: filters.parentIds } });
    }

    if (filters.studentFirstName && filters.studentLastName) {
      orClauses.push({
        student_first_name: filters.studentFirstName,
        student_last_name: filters.studentLastName,
      });
    }

    if (orClauses.length === 0) return [];

    return this.prisma.application.findMany({
      where: { tenant_id: tenantId, OR: orClauses },
      select: APPLICATION_SUMMARY_SELECT,
    });
  }

  /**
   * Count applications matching a status filter — used by retention policies.
   */
  async countByStatus(
    tenantId: string,
    status: ApplicationStatus,
    beforeDate?: Date,
  ): Promise<number> {
    return this.prisma.application.count({
      where: {
        tenant_id: tenantId,
        status,
        ...(beforeDate ? { updated_at: { lt: beforeDate } } : {}),
      },
    });
  }

  /**
   * Count all applications for a tenant — used by reports dashboards.
   */
  async countAll(tenantId: string): Promise<number> {
    return this.prisma.application.count({
      where: { tenant_id: tenantId },
    });
  }

  /**
   * Find all notes for an application — used by DSAR applicant data traversal.
   */
  async findNotesForApplication(
    tenantId: string,
    applicationId: string,
  ): Promise<ApplicationNoteRow[]> {
    return this.prisma.applicationNote.findMany({
      where: { application_id: applicationId, tenant_id: tenantId },
      select: APPLICATION_NOTE_SELECT,
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── Generic reporting methods ──────────────────────────────────────────────

  /**
   * Count applications with an arbitrary where clause. Used by reports-data-access.
   */
  async countApplicationsGeneric(
    tenantId: string,
    where?: Prisma.ApplicationWhereInput,
  ): Promise<number> {
    return this.prisma.application.count({
      where: { tenant_id: tenantId, ...where },
    });
  }

  /**
   * Generic findMany for applications. Used by reports-data-access.
   */
  async findApplicationsGeneric(
    tenantId: string,
    options: {
      where?: Prisma.ApplicationWhereInput;
      select?: Prisma.ApplicationSelect;
      orderBy?: Prisma.ApplicationOrderByWithRelationInput;
      skip?: number;
      take?: number;
    },
  ): Promise<unknown[]> {
    return this.prisma.application.findMany({
      where: { tenant_id: tenantId, ...options.where },
      ...(options.select && { select: options.select }),
      ...(options.orderBy && { orderBy: options.orderBy }),
      ...(options.skip !== undefined && { skip: options.skip }),
      ...(options.take !== undefined && { take: options.take }),
    });
  }
}
