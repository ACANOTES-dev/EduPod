/**
 * ComplianceReadFacade — Cross-module read access to compliance data.
 *
 * PURPOSE:
 * Surfaces counts and minimally-scoped row shapes off the `compliance_requests`
 * table (which this module owns) so other modules — specifically the regulatory
 * super-hub — can render "open DSAR" badges without reaching into the owning
 * module's Prisma surface directly.
 *
 * CONVENTIONS:
 * - Every method takes `tenantId: string` as the first parameter.
 * - `tenant_id` is in every `where` clause; no RLS transaction wrapping needed
 *   for counts.
 */
import { Injectable } from '@nestjs/common';
import { ComplianceRequestStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

// Compliance requests are "open" while they are in triage, classified, or
// approved but not yet executed. `completed` and `rejected` are terminal.
const OPEN_COMPLIANCE_STATUSES: ComplianceRequestStatus[] = [
  ComplianceRequestStatus.submitted,
  ComplianceRequestStatus.classified,
  ComplianceRequestStatus.approved,
];

@Injectable()
export class ComplianceReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Count open (non-terminal) compliance / DSAR requests for the regulatory
   * super-hub GDPR tile badge.
   */
  async countOpenDsarRequests(tenantId: string): Promise<number> {
    return this.prisma.complianceRequest.count({
      where: {
        tenant_id: tenantId,
        status: { in: OPEN_COMPLIANCE_STATUSES },
      },
    });
  }
}
