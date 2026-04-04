import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Facade ─────────────────────────────────────────────────────────────────

/**
 * WebsiteReadFacade — Read-only facade for website data consumed by other
 * modules (compliance/retention-policies).
 *
 * All reads use direct Prisma queries with `tenant_id` in `where` — no RLS
 * transaction needed for reads.
 */
@Injectable()
export class WebsiteReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Count contact form submissions before a cutoff date.
   * Used by retention-policies to determine purgeable records.
   */
  async countSubmissionsBeforeDate(tenantId: string, cutoffDate: Date): Promise<number> {
    return this.prisma.contactFormSubmission.count({
      where: {
        tenant_id: tenantId,
        created_at: { lt: cutoffDate },
      },
    });
  }
}
