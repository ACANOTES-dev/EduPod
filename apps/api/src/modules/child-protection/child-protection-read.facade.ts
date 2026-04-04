/**
 * ChildProtectionReadFacade — Centralized read-only access to child protection data.
 *
 * PURPOSE:
 * Other modules (compliance, pastoral, early-warning, reports, safeguarding)
 * need to check CP access grants, look up CP records for students, and determine
 * DLP user lists. Today each module queries `prisma.cpAccessGrant` and
 * `prisma.cpRecord` directly, duplicating the grant-checking pattern.
 *
 * This facade provides a single, well-typed entry point for all cross-module
 * child protection reads.
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

export interface CpAccessGrantRow {
  id: string;
  tenant_id: string;
  user_id: string;
  granted_by_user_id: string;
  granted_at: Date;
  revoked_at: Date | null;
}

export interface CpRecordRow {
  id: string;
  tenant_id: string;
  student_id: string;
  concern_id: string | null;
  record_type: string;
  logged_by_user_id: string;
  narrative: string;
  created_at: Date;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class ChildProtectionReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  // ─── CP Access Grants ─────────────────────────────────────────────────────

  /**
   * Check whether a user has an active (non-revoked) CP access grant.
   * This is the single most common cross-module check — used by pastoral concern
   * access, author masking, DSAR queries, safeguarding break-glass, and concern queries.
   */
  async hasActiveCpAccess(tenantId: string, userId: string): Promise<boolean> {
    const grant = await this.prisma.cpAccessGrant.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        revoked_at: null,
      },
      select: { id: true },
    });

    return !!grant;
  }

  /**
   * Find the first active CP access grant for a user.
   * Used by safeguarding break-glass to include grant ID in the response.
   */
  async findActiveGrantForUser(tenantId: string, userId: string): Promise<CpAccessGrantRow | null> {
    return this.prisma.cpAccessGrant.findFirst({
      where: {
        tenant_id: tenantId,
        user_id: userId,
        revoked_at: null,
      },
      select: {
        id: true,
        tenant_id: true,
        user_id: true,
        granted_by_user_id: true,
        granted_at: true,
        revoked_at: true,
      },
    });
  }

  /**
   * Resolve all user IDs with active CP access grants for a tenant.
   * These are the DLP (Designated Liaison Person) users.
   * Used by pastoral notification service for DLP notifications.
   */
  async findDlpUserIds(tenantId: string): Promise<string[]> {
    const grants = await this.prisma.cpAccessGrant.findMany({
      where: {
        tenant_id: tenantId,
        revoked_at: null,
      },
      select: { user_id: true },
    });

    return grants.map((g) => g.user_id);
  }

  /**
   * Find the fallback CP access grant (the oldest active grant).
   * Used by pastoral DSAR service when the preferred user lacks CP access.
   */
  async findFallbackGrantUserId(tenantId: string): Promise<string | null> {
    const grant = await this.prisma.cpAccessGrant.findFirst({
      where: { tenant_id: tenantId, revoked_at: null },
      orderBy: { granted_at: 'asc' },
      select: { user_id: true },
    });

    return grant?.user_id ?? null;
  }

  // ─── CP Records ───────────────────────────────────────────────────────────

  /**
   * Find all CP records for a student — used by DSAR student data collection
   * and early-warning/reports consumers.
   */
  async findRecordsForStudent(tenantId: string, studentId: string): Promise<CpRecordRow[]> {
    return this.prisma.cpRecord.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: {
        id: true,
        tenant_id: true,
        student_id: true,
        concern_id: true,
        record_type: true,
        logged_by_user_id: true,
        narrative: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /**
   * Count CP records for a student — used by early-warning signal collectors.
   */
  async countRecordsForStudent(tenantId: string, studentId: string): Promise<number> {
    return this.prisma.cpRecord.count({
      where: { tenant_id: tenantId, student_id: studentId },
    });
  }
}
