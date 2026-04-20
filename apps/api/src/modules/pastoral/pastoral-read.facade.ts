import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StudentCheckinRow {
  id: string;
  tenant_id: string;
  student_id: string;
  mood_score: number;
  checkin_date: Date;
  created_at: Date;
}

export interface PastoralConcernRow {
  id: string;
  tenant_id: string;
  student_id: string;
  category: string;
  severity: string;
  follow_up_needed: boolean;
  acknowledged_at: Date | null;
  created_at: Date;
}

export interface PastoralCaseRow {
  id: string;
  tenant_id: string;
  student_id: string;
  status: string;
}

export interface PastoralReferralRow {
  id: string;
  tenant_id: string;
  student_id: string;
  referral_type: string;
  referral_body_name: string | null;
  status: string;
}

export interface CriticalIncidentAffectedRow {
  id: string;
  tenant_id: string;
  student_id: string | null;
  impact_level: string;
  wellbeing_flag_active: boolean;
}

// ─── Facade ─────────────────────────────────────────────────────────────────

/**
 * PastoralReadFacade — Read-only facade for pastoral data consumed by other
 * modules (early-warning, compliance, regulatory).
 *
 * All reads use direct Prisma queries with `tenant_id` in `where` — no RLS
 * transaction needed for reads.
 */
@Injectable()
export class PastoralReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Student Check-ins ───────────────────────────────────────────────────

  /**
   * Find recent check-ins for a student within a date range.
   * Used by early-warning wellbeing signals.
   */
  async findRecentCheckins(
    tenantId: string,
    studentId: string,
    since: Date,
  ): Promise<StudentCheckinRow[]> {
    return this.prisma.studentCheckin.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        checkin_date: { gte: since },
      },
      orderBy: { checkin_date: 'desc' },
    }) as Promise<StudentCheckinRow[]>;
  }

  // ─── Pastoral Concerns ───────────────────────────────────────────────────

  /**
   * Find pastoral concerns for a student within a date range, filtered by
   * severity or follow-up status.
   * Used by early-warning wellbeing signals.
   */
  async findRecentConcerns(
    tenantId: string,
    studentId: string,
    since: Date,
  ): Promise<PastoralConcernRow[]> {
    return this.prisma.pastoralConcern.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        created_at: { gte: since },
        OR: [{ follow_up_needed: true }, { severity: { in: ['urgent', 'critical'] } }],
      },
      orderBy: { created_at: 'desc' },
    }) as Promise<PastoralConcernRow[]>;
  }

  // ─── Pastoral Cases ──────────────────────────────────────────────────────

  /**
   * Find active pastoral cases for a student (open/active/monitoring).
   * Used by early-warning wellbeing signals.
   */
  async findActiveCases(tenantId: string, studentId: string): Promise<PastoralCaseRow[]> {
    return this.prisma.pastoralCase.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: { in: ['open', 'active', 'monitoring'] },
      },
    }) as Promise<PastoralCaseRow[]>;
  }

  // ─── Pastoral Referrals ──────────────────────────────────────────────────

  /**
   * Find active referrals for a student.
   * Used by early-warning wellbeing signals.
   */
  async findActiveReferrals(tenantId: string, studentId: string): Promise<PastoralReferralRow[]> {
    return this.prisma.pastoralReferral.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: { in: ['submitted', 'acknowledged', 'assessment_scheduled'] },
      },
    }) as Promise<PastoralReferralRow[]>;
  }

  /**
   * Find a single referral by ID. Returns `null` if not found.
   * Used by SEN professional involvement for referral validation.
   */
  async findReferralById(tenantId: string, referralId: string): Promise<{ id: string } | null> {
    return this.prisma.pastoralReferral.findFirst({
      where: { id: referralId, tenant_id: tenantId },
      select: { id: true },
    });
  }

  // ─── Critical Incident Affected ──────────────────────────────────────────

  /**
   * Find active wellbeing flags from critical incidents for a student.
   * Used by early-warning wellbeing signals.
   */
  async findActiveWellbeingFlags(
    tenantId: string,
    studentId: string,
  ): Promise<CriticalIncidentAffectedRow[]> {
    return this.prisma.criticalIncidentAffected.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        wellbeing_flag_active: true,
      },
    }) as Promise<CriticalIncidentAffectedRow[]>;
  }

  // ─── Wellbeing Dashboard Aggregator Methods ─────────────────────────────────
  //
  // Used by the wellbeing super-hub (`GET /v1/wellbeing/dashboard-summary`).

  /**
   * Count pastoral cases in an open/active/monitoring state.
   */
  async countOpenCases(tenantId: string): Promise<number> {
    return this.prisma.pastoralCase.count({
      where: { tenant_id: tenantId, status: { in: ['open', 'active', 'monitoring'] } },
    });
  }

  /**
   * Count pastoral concerns with severity `critical` that have not yet been
   * acknowledged. Used by the dashboard pending-attention banner.
   */
  async countUnacknowledgedCriticalConcerns(tenantId: string): Promise<number> {
    return this.prisma.pastoralConcern.count({
      where: {
        tenant_id: tenantId,
        severity: 'critical',
        acknowledged_at: null,
      },
    });
  }

  /**
   * Find the most recent pastoral concerns for the wellbeing dashboard
   * activity feed. Honours author masking — returns logged_by only when
   * `author_masked=false`. Named `ForFeed` to avoid colliding with the
   * student-scoped `findRecentConcerns` used by early-warning signals.
   */
  async findRecentConcernsForFeed(
    tenantId: string,
    limit: number,
  ): Promise<
    Array<{
      id: string;
      category: string;
      severity: string;
      occurred_at: Date;
      author_masked: boolean;
      logged_by: { first_name: string | null; last_name: string | null } | null;
    }>
  > {
    const rows = await this.prisma.pastoralConcern.findMany({
      where: { tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        category: true,
        severity: true,
        occurred_at: true,
        author_masked: true,
        logged_by: { select: { first_name: true, last_name: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      category: row.category,
      severity: row.severity,
      occurred_at: row.occurred_at,
      author_masked: row.author_masked,
      logged_by: row.author_masked ? null : row.logged_by,
    }));
  }

  /**
   * Count everything the Pastoral hub tile should show.
   */
  async countPastoralHub(tenantId: string): Promise<number> {
    return this.countOpenCases(tenantId);
  }
}
