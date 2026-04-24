/**
 * SafeguardingReadFacade — Cross-module read access to safeguarding data.
 *
 * PURPOSE:
 * Surfaces safeguarding SLA state and open-concern counts for the wellbeing
 * super-hub aggregator. `safeguarding` is a privileged module; full concern
 * content is NOT exposed here — only counts and minimally scoped row shapes
 * needed for pending-attention banners.
 *
 * CONVENTIONS:
 * - Every method takes `tenantId: string` as the first parameter.
 * - `tenant_id` is in every `where` clause; no RLS transaction wrapping needed
 *   for counts.
 * - Sealed concerns are excluded from all output.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface SafeguardingSlaBreachRow {
  id: string;
  concern_number: string;
  severity: string;
  status: string;
  sla_first_response_due: Date;
  created_at: Date;
}

export interface TuslaReferralRow {
  id: string;
  concern_number: string;
  student_id: string;
  concern_type: string;
  severity: string;
  status: string;
  tusla_referred_at: Date | null;
  tusla_reference_number: string | null;
  created_at: Date;
}

export interface RecentTuslaReferralRow {
  id: string;
  concern_number: string;
  severity: string;
  status: string;
  tusla_referred_at: Date | null;
  tusla_reference_number: string | null;
}

@Injectable()
export class SafeguardingReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Count safeguarding concerns whose first-response SLA has elapsed without
   * being met. Excludes sealed concerns.
   */
  async countSlaBreaches(tenantId: string): Promise<number> {
    return this.prisma.safeguardingConcern.count({
      where: {
        tenant_id: tenantId,
        sla_first_response_due: { lt: new Date() },
        sla_first_response_met_at: null,
        status: { not: 'sealed' },
      },
    });
  }

  /**
   * Find safeguarding concerns whose first-response SLA has elapsed without
   * being met, capped to the given limit. Excludes sealed concerns. Returns a
   * minimal shape (no description) — caller is responsible for permission
   * gating if it wants to link or display further.
   */
  async findSlaBreachItems(tenantId: string, limit: number): Promise<SafeguardingSlaBreachRow[]> {
    return this.prisma.safeguardingConcern.findMany({
      where: {
        tenant_id: tenantId,
        sla_first_response_due: { lt: new Date() },
        sla_first_response_met_at: null,
        status: { not: 'sealed' },
      },
      orderBy: { sla_first_response_due: 'asc' },
      take: limit,
      select: {
        id: true,
        concern_number: true,
        severity: true,
        status: true,
        sla_first_response_due: true,
        created_at: true,
      },
    }) as Promise<SafeguardingSlaBreachRow[]>;
  }

  /**
   * Count open (non-sealed, non-resolved) safeguarding concerns for the
   * Safeguarding hub tile.
   */
  async countSafeguardingHub(tenantId: string): Promise<number> {
    return this.prisma.safeguardingConcern.count({
      where: {
        tenant_id: tenantId,
        status: {
          in: ['reported', 'acknowledged', 'under_investigation', 'referred', 'sg_monitoring'],
        },
      },
    });
  }

  /**
   * Count Tusla referrals whose referral flag is set but `tusla_referred_at`
   * is still null — i.e. pending submission to Tusla.
   */
  async countPendingTuslaReferrals(tenantId: string): Promise<number> {
    return this.prisma.safeguardingConcern.count({
      where: {
        tenant_id: tenantId,
        is_tusla_referral: true,
        tusla_referred_at: null,
      },
    });
  }

  /**
   * Fetch the last N Tusla-referred concerns, newest first. Used by the
   * regulatory safeguarding hub's "recent reports" strip.
   */
  async findRecentTuslaReferrals(
    tenantId: string,
    limit: number,
  ): Promise<RecentTuslaReferralRow[]> {
    const rows = await this.prisma.safeguardingConcern.findMany({
      where: { tenant_id: tenantId, is_tusla_referral: true },
      orderBy: [{ tusla_referred_at: 'desc' }, { created_at: 'desc' }],
      take: limit,
      select: {
        id: true,
        concern_number: true,
        severity: true,
        status: true,
        tusla_referred_at: true,
        tusla_reference_number: true,
      },
    });
    return rows;
  }

  /**
   * Paginated list of Tusla-referred concerns for the regulatory
   * mandatory-reporting page. Returns minimal fields — the detail view in the
   * standalone Safeguarding module enforces stricter permission gating.
   */
  async listTuslaReferrals(
    tenantId: string,
    skip: number,
    take: number,
  ): Promise<{ rows: TuslaReferralRow[]; total: number }> {
    const where = { tenant_id: tenantId, is_tusla_referral: true };
    const [rows, total] = await Promise.all([
      this.prisma.safeguardingConcern.findMany({
        where,
        orderBy: [{ tusla_referred_at: 'desc' }, { created_at: 'desc' }],
        skip,
        take,
        select: {
          id: true,
          concern_number: true,
          student_id: true,
          concern_type: true,
          severity: true,
          status: true,
          tusla_referred_at: true,
          tusla_reference_number: true,
          created_at: true,
        },
      }),
      this.prisma.safeguardingConcern.count({ where }),
    ]);
    return { rows, total };
  }
}
