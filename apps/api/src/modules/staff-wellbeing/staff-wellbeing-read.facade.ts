/**
 * StaffWellbeingReadFacade — Cross-module read access to staff-wellbeing data.
 *
 * PURPOSE:
 * Surfaces the count of active staff surveys for the wellbeing super-hub
 * aggregator's Staff Wellbeing hub tile. The full staff-wellbeing surface
 * (workload, EAP, board report) remains inside `StaffWellbeingModule`.
 *
 * An "active" survey is one whose status is `open` and whose response
 * window (window_opens_at .. window_closes_at) contains the current moment.
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StaffWellbeingReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Count staff surveys currently inside their response window with status
   * `open`. Used by the Staff Wellbeing hub tile on the wellbeing super-hub.
   */
  async countActiveSurveys(tenantId: string): Promise<number> {
    const now = new Date();
    return this.prisma.staffSurvey.count({
      where: {
        tenant_id: tenantId,
        status: 'open',
        window_opens_at: { lte: now },
        window_closes_at: { gte: now },
      },
    });
  }

  /**
   * Hub-tile count for Staff Wellbeing.
   */
  async countStaffWellbeingHub(tenantId: string): Promise<number> {
    return this.countActiveSurveys(tenantId);
  }
}
