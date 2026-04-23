import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Read-only facade for cross-module consumers (e.g. WellbeingAggregateService)
 * to look up aggregated SEN data without depending on SenProfileService.
 */
@Injectable()
export class SenReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Count everything the SEN hub tile should show: total active SEN profiles
   * for the tenant. Used by the wellbeing dashboard hub_counts.
   */
  async countSenHub(tenantId: string): Promise<number> {
    return this.prisma.senProfile.count({
      where: { tenant_id: tenantId, is_active: true },
    });
  }
}
