/**
 * EarlyWarningReadFacade — Cross-module read access to early-warning data.
 *
 * PURPOSE:
 * Surfaces at-risk student counts for the wellbeing super-hub aggregator.
 * The full early-warning surface (risk profiles, signals, interventions)
 * stays behind `EarlyWarningService`; this facade exposes only aggregate
 * counts.
 */
import { Injectable } from '@nestjs/common';

import { AcademicReadFacade } from '../academics/academic-read.facade';
import { PrismaService } from '../prisma/prisma.service';

export interface AtRiskCounts {
  amber: number;
  red: number;
  total: number;
}

@Injectable()
export class EarlyWarningReadFacade {
  constructor(
    private readonly prisma: PrismaService,
    private readonly academics: AcademicReadFacade,
  ) {}

  /**
   * Count students in amber/red risk tiers, scoped to the tenant's active
   * academic year. Returns zeros when no active year exists so fresh tenants
   * contribute zero to the dashboard rather than erroring.
   */
  async getAtRiskCounts(tenantId: string): Promise<AtRiskCounts> {
    const activeYear = await this.academics.findCurrentYear(tenantId);

    if (!activeYear) {
      return { amber: 0, red: 0, total: 0 };
    }

    const rows = await this.prisma.studentRiskProfile.groupBy({
      by: ['risk_tier'],
      where: {
        tenant_id: tenantId,
        academic_year_id: activeYear.id,
        risk_tier: { in: ['amber', 'red'] },
      },
      _count: { _all: true },
    });

    let amber = 0;
    let red = 0;
    for (const row of rows) {
      if (row.risk_tier === 'amber') amber = row._count._all;
      else if (row.risk_tier === 'red') red = row._count._all;
    }

    return { amber, red, total: amber + red };
  }

  /**
   * Count students in any non-green tier (yellow/amber/red) for the
   * Early-Warnings hub tile. Falls back to zero when no active academic year
   * exists.
   */
  async countEarlyWarningHub(tenantId: string): Promise<number> {
    const activeYear = await this.academics.findCurrentYear(tenantId);

    if (!activeYear) return 0;

    return this.prisma.studentRiskProfile.count({
      where: {
        tenant_id: tenantId,
        academic_year_id: activeYear.id,
        risk_tier: { in: ['yellow', 'amber', 'red'] },
      },
    });
  }
}
