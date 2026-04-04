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
}
