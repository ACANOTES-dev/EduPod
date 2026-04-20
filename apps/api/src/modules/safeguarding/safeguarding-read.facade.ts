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
}
