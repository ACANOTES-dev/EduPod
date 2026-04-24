import { Injectable } from '@nestjs/common';

import type { RegulatoryGdprDashboard } from '@school/shared/regulatory';

import { ComplianceReadFacade } from '../compliance/compliance-read.facade';
import { RetentionPoliciesService } from '../compliance/retention-policies.service';
import { GdprReadFacade } from '../gdpr/gdpr-read.facade';

const RECENT_DSAR_LIMIT = 5;

// Anonymise subject IDs on the dashboard so the hub can render recent
// activity without exposing the full UUID.
function anonymiseSubjectId(subjectId: string): string {
  return subjectId.slice(0, 8);
}

@Injectable()
export class RegulatoryGdprService {
  constructor(
    private readonly complianceReadFacade: ComplianceReadFacade,
    private readonly gdprReadFacade: GdprReadFacade,
    private readonly retentionPoliciesService: RetentionPoliciesService,
  ) {}

  /**
   * Composite read that powers the GDPR / Privacy sub-hub dashboard. Runs
   * every source in parallel so the page loads in one round trip.
   */
  async getDashboard(tenantId: string): Promise<RegulatoryGdprDashboard> {
    const [
      openDsarCount,
      overdueDsarCount,
      activePrivacyNotice,
      itemsPastRetention,
      dpaStatus,
      recentDsars,
    ] = await Promise.all([
      this.complianceReadFacade.countOpenDsarRequests(tenantId),
      this.complianceReadFacade.countOverdueDsarRequests(tenantId),
      this.gdprReadFacade.findActivePrivacyNoticeVersion(tenantId),
      this.retentionPoliciesService.countItemsPastRetention(tenantId),
      this.gdprReadFacade.findDpaAcceptanceStatus(tenantId),
      this.complianceReadFacade.findRecentDsarRequests(tenantId, RECENT_DSAR_LIMIT),
    ]);

    return {
      open_dsar_count: openDsarCount,
      overdue_dsar_count: overdueDsarCount,
      active_privacy_notice_version: activePrivacyNotice?.version_number ?? null,
      active_privacy_notice_effective_date:
        activePrivacyNotice?.effective_date.toISOString() ?? null,
      data_items_past_retention_count: itemsPastRetention,
      active_dpa_accepted: dpaStatus.accepted,
      active_dpa_version: dpaStatus.current_version,
      recent_dsar_activity: recentDsars.map((d) => ({
        id: d.id,
        request_type: d.request_type,
        subject_type: d.subject_type,
        subject_reference: anonymiseSubjectId(d.subject_id),
        status: d.status,
        created_at: d.created_at.toISOString(),
      })),
    };
  }
}
