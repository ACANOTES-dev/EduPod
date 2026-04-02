import { Injectable, Logger } from '@nestjs/common';

import type { ReportFilterDto } from '@school/shared/pastoral';

import type { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import type { DesInspectionReportData } from './pastoral-report.service';

// ─── Helpers ───────────────────────────────────────────────────────────────

function defaultDateRange(filters: ReportFilterDto): { from: Date; to: Date } {
  const to = filters.to_date ? new Date(filters.to_date) : new Date();
  const from = filters.from_date
    ? new Date(filters.from_date)
    : new Date(to.getFullYear() - 1, to.getMonth(), to.getDate());
  return { from, to };
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0] ?? '';
}

function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
  return Math.max(months, 1);
}

// ─── Service ───────────────────────────────────────────────────────────────

@Injectable()
export class PastoralReportDesInspectionService {
  private readonly logger = new Logger(PastoralReportDesInspectionService.name);

  constructor(private readonly eventService: PastoralEventService) {}

  // ─── Build DES Inspection Report ──────────────────────────────────────────

  async build(
    db: PrismaService,
    tenantId: string,
    userId: string,
    filters: ReportFilterDto,
  ): Promise<DesInspectionReportData> {
    const { from, to } = defaultDateRange(filters);

    // 1. SST composition
    const sstMembers = await db.sstMember.findMany({
      where: { tenant_id: tenantId, active: true },
      include: {
        user: { select: { first_name: true, last_name: true } },
      },
    });

    const sstComposition = sstMembers.map((m) => ({
      user_name: `${m.user.first_name} ${m.user.last_name}`,
      role: m.role_description,
    }));

    // 2. Meeting frequency
    const meetings = await db.sstMeeting.findMany({
      where: {
        tenant_id: tenantId,
        scheduled_at: { gte: from, lte: to },
      },
      select: { id: true },
    });

    const totalMeetings = meetings.length;
    const months = monthsBetween(from, to);
    const averagePerMonth = Math.round((totalMeetings / months) * 100) / 100;

    // 3. Concern logging
    const concerns = await db.pastoralConcern.findMany({
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
      },
      select: {
        category: true,
        logged_by_user_id: true,
      },
    });

    const concernByCategory: Record<string, number> = {};
    const distinctStaffSet = new Set<string>();
    for (const c of concerns) {
      concernByCategory[c.category] = (concernByCategory[c.category] ?? 0) + 1;
      distinctStaffSet.add(c.logged_by_user_id);
    }

    // 4. Intervention quality
    const interventions = await db.pastoralIntervention.findMany({
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
      },
      select: {
        target_outcomes: true,
        outcome_notes: true,
        continuum_level: true,
      },
    });

    let withMeasurableTargets = 0;
    let withDocumentedOutcomes = 0;

    for (const intervention of interventions) {
      // Check target_outcomes for measurable targets
      if (intervention.target_outcomes) {
        const outcomes = intervention.target_outcomes as Record<string, unknown>;
        if (
          typeof outcomes === 'object' &&
          outcomes !== null &&
          'measurable_target' in outcomes
        ) {
          withMeasurableTargets++;
        }
      }

      if (intervention.outcome_notes && String(intervention.outcome_notes).trim().length > 0) {
        withDocumentedOutcomes++;
      }
    }

    const interventionTotal = interventions.length;
    const measurablePercent =
      interventionTotal > 0 ? Math.round((withMeasurableTargets / interventionTotal) * 100) : 0;
    const documentedPercent =
      interventionTotal > 0 ? Math.round((withDocumentedOutcomes / interventionTotal) * 100) : 0;

    // 5. Referral pathways
    const referrals = await db.pastoralReferral.findMany({
      where: {
        tenant_id: tenantId,
        created_at: { gte: from, lte: to },
      },
      select: { referral_type: true },
    });

    const referralByType: Record<string, number> = {};
    for (const r of referrals) {
      referralByType[r.referral_type] = (referralByType[r.referral_type] ?? 0) + 1;
    }

    // 6. Continuum coverage
    const continuumCoverage = { level_1: 0, level_2: 0, level_3: 0 };
    for (const intervention of interventions) {
      if (intervention.continuum_level === 1) continuumCoverage.level_1++;
      else if (intervention.continuum_level === 2) continuumCoverage.level_2++;
      else if (intervention.continuum_level === 3) continuumCoverage.level_3++;
    }

    const result: DesInspectionReportData = {
      period: { from: toISODate(from), to: toISODate(to) },
      pastoral_care_policy_summary:
        'Pastoral care policy as per school guidelines. Please refer to the school policy document.',
      sst_composition: sstComposition,
      meeting_frequency: {
        total_meetings: totalMeetings,
        average_per_month: averagePerMonth,
      },
      concern_logging: {
        total: concerns.length,
        by_category: concernByCategory,
      },
      intervention_quality: {
        with_measurable_targets_percent: measurablePercent,
        with_documented_outcomes_percent: documentedPercent,
      },
      referral_pathways: {
        total: referrals.length,
        by_type: referralByType,
      },
      continuum_coverage: continuumCoverage,
      staff_engagement: {
        distinct_staff_logging_concerns: distinctStaffSet.size,
      },
    };

    // Fire audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'report_generated',
      entity_type: 'export',
      entity_id: 'report',
      student_id: null,
      actor_user_id: userId,
      tier: 1,
      payload: {
        report_type: 'des_inspection',
        requested_by: userId,
        filters,
      },
      ip_address: null,
    });

    return result;
  }
}
