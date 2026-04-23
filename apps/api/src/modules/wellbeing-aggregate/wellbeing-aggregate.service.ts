/**
 * WellbeingAggregateService — cross-module read for the `/wellbeing`
 * super-hub.
 *
 * Runs the per-module sub-queries in parallel via `Promise.allSettled` so a
 * failing sub-query yields zero/empty for that slice rather than a 500.
 * Modules disabled for the tenant (via `tenant_modules`) contribute zero
 * without invoking their facade at all.
 *
 * Safeguarding is always-on (no module flag); its counts are always included.
 */
import { Injectable, Logger } from '@nestjs/common';

import type { WellbeingDashboardSummary } from '@school/shared/wellbeing';

import { BehaviourReadFacade } from '../behaviour/behaviour-read.facade';
import { EarlyWarningReadFacade } from '../early-warning/early-warning-read.facade';
import { PastoralReadFacade } from '../pastoral/pastoral-read.facade';
import { SafeguardingReadFacade } from '../safeguarding/safeguarding-read.facade';
import { SenReadFacade } from '../sen/sen-read.facade';
import { StaffWellbeingReadFacade } from '../staff-wellbeing/staff-wellbeing-read.facade';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

type ModuleFlags = {
  behaviour: boolean;
  pastoral: boolean;
  early_warning: boolean;
  staff_wellbeing: boolean;
};

const PENDING_ATTENTION_LIMIT = 10;
const RECENT_ACTIVITY_LIMIT = 8;
const SEVERITY_RANK: Record<'critical' | 'high' | 'medium', number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

type PendingItem = WellbeingDashboardSummary['pending_attention'][number];
type ActivityItem = WellbeingDashboardSummary['recent_activity'][number];

@Injectable()
export class WellbeingAggregateService {
  private readonly logger = new Logger(WellbeingAggregateService.name);

  constructor(
    private readonly behaviour: BehaviourReadFacade,
    private readonly pastoral: PastoralReadFacade,
    private readonly safeguarding: SafeguardingReadFacade,
    private readonly sen: SenReadFacade,
    private readonly earlyWarning: EarlyWarningReadFacade,
    private readonly staffWellbeing: StaffWellbeingReadFacade,
    private readonly tenants: TenantReadFacade,
  ) {}

  async getDashboardSummary(tenantId: string): Promise<WellbeingDashboardSummary> {
    const enabled = await this.getEnabledModules(tenantId);

    const [
      incidentsRes,
      casesRes,
      atRiskRes,
      overdueSanctionsRes,
      overdueTasksRes,
      slaBreachCountRes,
      slaBreachItemsRes,
      awaitingMeetingRes,
      pendingAppealsRes,
      unackCriticalRes,
      behaviourHubRes,
      pastoralHubRes,
      safeguardingHubRes,
      senHubRes,
      earlyWarningHubRes,
      staffWellbeingHubRes,
      recentIncidentsRes,
      recentConcernsRes,
      recentSanctionsRes,
      recentAwardsRes,
    ] = await Promise.allSettled([
      enabled.behaviour
        ? this.behaviour.countOpenIncidentsByPolarity(tenantId)
        : Promise.resolve({ total: 0, positive: 0, negative: 0 }),
      enabled.pastoral ? this.pastoral.countOpenCases(tenantId) : Promise.resolve(0),
      enabled.early_warning
        ? this.earlyWarning.getAtRiskCounts(tenantId)
        : Promise.resolve({ amber: 0, red: 0, total: 0 }),
      enabled.behaviour ? this.behaviour.countOverdueSanctions(tenantId) : Promise.resolve(0),
      enabled.behaviour ? this.behaviour.countOverdueTasks(tenantId) : Promise.resolve(0),
      this.safeguarding.countSlaBreaches(tenantId),
      this.safeguarding.findSlaBreachItems(tenantId, PENDING_ATTENTION_LIMIT),
      enabled.behaviour
        ? this.behaviour.countIncidentsAwaitingParentMeeting(tenantId)
        : Promise.resolve(0),
      enabled.behaviour ? this.behaviour.countPendingAppeals(tenantId) : Promise.resolve(0),
      enabled.pastoral
        ? this.pastoral.countUnacknowledgedCriticalConcerns(tenantId)
        : Promise.resolve(0),
      enabled.behaviour ? this.behaviour.countBehaviourHub(tenantId) : Promise.resolve(0),
      enabled.pastoral ? this.pastoral.countPastoralHub(tenantId) : Promise.resolve(0),
      this.safeguarding.countSafeguardingHub(tenantId),
      this.sen.countSenHub(tenantId),
      enabled.early_warning ? this.earlyWarning.countEarlyWarningHub(tenantId) : Promise.resolve(0),
      enabled.staff_wellbeing
        ? this.staffWellbeing.countStaffWellbeingHub(tenantId)
        : Promise.resolve(0),
      enabled.behaviour
        ? this.behaviour.findRecentIncidentsForFeed(tenantId, RECENT_ACTIVITY_LIMIT)
        : Promise.resolve([]),
      enabled.pastoral
        ? this.pastoral.findRecentConcernsForFeed(tenantId, RECENT_ACTIVITY_LIMIT)
        : Promise.resolve([]),
      enabled.behaviour
        ? this.behaviour.findRecentServedSanctions(tenantId, RECENT_ACTIVITY_LIMIT)
        : Promise.resolve([]),
      enabled.behaviour
        ? this.behaviour.findRecentRecognitionAwards(tenantId, RECENT_ACTIVITY_LIMIT)
        : Promise.resolve([]),
    ]);

    const incidents = this.unwrap(incidentsRes, { total: 0, positive: 0, negative: 0 });
    const cases = this.unwrap(casesRes, 0);
    const atRisk = this.unwrap(atRiskRes, { amber: 0, red: 0, total: 0 });
    const overdueSanctions = this.unwrap(overdueSanctionsRes, 0);
    const overdueTasks = this.unwrap(overdueTasksRes, 0);
    const slaBreachCount = this.unwrap(slaBreachCountRes, 0);
    const slaBreachItems = this.unwrap(slaBreachItemsRes, []);
    const awaitingMeetingCount = this.unwrap(awaitingMeetingRes, 0);
    const pendingAppealsCount = this.unwrap(pendingAppealsRes, 0);
    const unackCriticalCount = this.unwrap(unackCriticalRes, 0);

    return {
      kpis: {
        students_at_risk: atRisk,
        open_incidents: incidents,
        open_pastoral_cases: cases,
        overdue_actions: {
          sanctions: overdueSanctions,
          tasks: overdueTasks,
          sla_breaches: slaBreachCount,
          total: overdueSanctions + overdueTasks + slaBreachCount,
        },
      },
      pending_attention: this.composePendingAttention({
        slaBreachItems,
        overdueSanctions,
        overdueTasks,
        awaitingMeetingCount,
        pendingAppealsCount,
        unackCriticalCount,
      }),
      hub_counts: {
        behaviour: this.unwrap(behaviourHubRes, 0),
        pastoral: this.unwrap(pastoralHubRes, 0),
        safeguarding: this.unwrap(safeguardingHubRes, 0),
        sen: this.unwrap(senHubRes, 0),
        early_warnings: this.unwrap(earlyWarningHubRes, 0),
        staff_wellbeing: this.unwrap(staffWellbeingHubRes, 0),
      },
      recent_activity: this.composeRecentActivity({
        incidents: this.unwrap(recentIncidentsRes, []),
        concerns: this.unwrap(recentConcernsRes, []),
        servedSanctions: this.unwrap(recentSanctionsRes, []),
        recognitionAwards: this.unwrap(recentAwardsRes, []),
      }),
    };
  }

  private async getEnabledModules(tenantId: string): Promise<ModuleFlags> {
    const rows = await this.tenants.findModules(tenantId);
    const map = new Map(rows.map((r) => [r.module_key, r.is_enabled]));
    return {
      behaviour: map.get('behaviour') ?? false,
      pastoral: map.get('pastoral') ?? false,
      early_warning: map.get('early_warning') ?? false,
      staff_wellbeing: map.get('staff_wellbeing') ?? false,
    };
  }

  private unwrap<T>(result: PromiseSettledResult<T>, fallback: T): T {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    this.logger.warn(`Wellbeing dashboard sub-query failed: ${String(result.reason)}`);
    return fallback;
  }

  private composePendingAttention(input: {
    slaBreachItems: Array<{
      id: string;
      concern_number: string;
      severity: string;
      sla_first_response_due: Date;
    }>;
    overdueSanctions: number;
    overdueTasks: number;
    awaitingMeetingCount: number;
    pendingAppealsCount: number;
    unackCriticalCount: number;
  }): PendingItem[] {
    const items: PendingItem[] = [];

    for (const item of input.slaBreachItems) {
      const severity = item.severity === 'critical_sev' ? 'critical' : 'high';
      items.push({
        kind: 'sla_breach',
        severity,
        title: `Safeguarding SLA breached (${item.concern_number})`,
        detail: `First-response SLA elapsed without acknowledgement.`,
        href: '/safeguarding/concerns',
        due_at: item.sla_first_response_due.toISOString(),
      });
    }

    if (input.unackCriticalCount > 0) {
      items.push({
        kind: 'unack_critical',
        severity: 'critical',
        title: 'Critical pastoral concerns unacknowledged',
        detail: `${input.unackCriticalCount} unacknowledged critical concern(s).`,
        href: '/pastoral/concerns',
        count: input.unackCriticalCount,
      });
    }

    if (input.overdueSanctions > 0 || input.overdueTasks > 0) {
      const total = input.overdueSanctions + input.overdueTasks;
      items.push({
        kind: 'overdue_intervention',
        severity: 'high',
        title: 'Overdue behaviour actions',
        detail: `${input.overdueSanctions} sanction(s) and ${input.overdueTasks} task(s) past due.`,
        href: '/behaviour',
        count: total,
      });
    }

    if (input.pendingAppealsCount > 0) {
      items.push({
        kind: 'pending_appeal',
        severity: 'medium',
        title: 'Pending behaviour appeals',
        detail: `${input.pendingAppealsCount} appeal(s) awaiting review or decision.`,
        href: '/behaviour/appeals',
        count: input.pendingAppealsCount,
      });
    }

    if (input.awaitingMeetingCount > 0) {
      items.push({
        kind: 'awaiting_parent_meeting',
        severity: 'medium',
        title: 'Incidents awaiting parent meeting',
        detail: `${input.awaitingMeetingCount} incident(s) with a required parent meeting.`,
        href: '/behaviour/incidents',
        count: input.awaitingMeetingCount,
      });
    }

    return items
      .sort((a, b) => {
        const rank = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
        if (rank !== 0) return rank;
        const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
        const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
        return aDue - bDue;
      })
      .slice(0, PENDING_ATTENTION_LIMIT);
  }

  private composeRecentActivity(input: {
    incidents: Array<{
      id: string;
      incident_number: string;
      polarity: string;
      description: string;
      occurred_at: Date;
      reported_by: { first_name: string | null; last_name: string | null } | null;
    }>;
    concerns: Array<{
      id: string;
      category: string;
      occurred_at: Date;
      author_masked: boolean;
      logged_by: { first_name: string | null; last_name: string | null } | null;
    }>;
    servedSanctions: Array<{
      id: string;
      sanction_number: string;
      type: string;
      served_at: Date | null;
      served_by: { first_name: string | null; last_name: string | null } | null;
    }>;
    recognitionAwards: Array<{
      id: string;
      student_id: string;
      awarded_at: Date;
    }>;
  }): ActivityItem[] {
    const items: ActivityItem[] = [];

    for (const incident of input.incidents) {
      items.push({
        id: incident.id,
        kind: 'incident',
        title: `Incident ${incident.incident_number}`,
        actor_name: formatUserName(incident.reported_by),
        occurred_at: incident.occurred_at.toISOString(),
        href: `/behaviour/incidents/${incident.id}`,
      });
    }

    for (const concern of input.concerns) {
      items.push({
        id: concern.id,
        kind: 'concern',
        title: `Pastoral concern — ${concern.category}`,
        actor_name: concern.author_masked ? null : formatUserName(concern.logged_by),
        occurred_at: concern.occurred_at.toISOString(),
        href: `/pastoral/concerns/${concern.id}`,
      });
    }

    for (const sanction of input.servedSanctions) {
      if (!sanction.served_at) continue;
      items.push({
        id: sanction.id,
        kind: 'sanction_served',
        title: `Sanction ${sanction.sanction_number} served`,
        actor_name: formatUserName(sanction.served_by),
        occurred_at: sanction.served_at.toISOString(),
        href: `/behaviour/sanctions/${sanction.id}`,
      });
    }

    for (const award of input.recognitionAwards) {
      items.push({
        id: award.id,
        kind: 'recognition',
        title: 'Recognition awarded',
        actor_name: null,
        occurred_at: award.awarded_at.toISOString(),
        href: `/behaviour/recognition`,
      });
    }

    return items
      .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
      .slice(0, RECENT_ACTIVITY_LIMIT);
  }
}

function formatUserName(
  user: { first_name: string | null; last_name: string | null } | null,
): string | null {
  if (!user) return null;
  const parts = [user.first_name, user.last_name].filter(Boolean) as string[];
  return parts.length ? parts.join(' ') : null;
}
