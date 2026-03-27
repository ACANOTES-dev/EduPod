import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import {
  SYSTEM_USER_SENTINEL,
  TenantAwareJob,
  TenantJobPayload,
} from '../../base/tenant-aware-job';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface PrecomputeAgendaPayload extends TenantJobPayload {
  meeting_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const PRECOMPUTE_AGENDA_JOB = 'pastoral:precompute-agenda';

// ─── Idempotency window (milliseconds) ──────────────────────────────────────

const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// ─── Agenda source types ────────────────────────────────────────────────────

type AgendaSource =
  | 'auto_new_concern'
  | 'auto_case_review'
  | 'auto_overdue_action'
  | 'auto_early_warning'
  | 'auto_neps'
  | 'auto_intervention_review';

interface AgendaSourceItem {
  source: AgendaSource;
  student_id: string | null;
  case_id: string | null;
  concern_id: string | null;
  description: string;
}

// ─── Processor ───────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.PASTORAL)
export class PrecomputeAgendaProcessor extends WorkerHost {
  private readonly logger = new Logger(PrecomputeAgendaProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
  ) {
    super();
  }

  async process(job: Job<PrecomputeAgendaPayload>): Promise<void> {
    if (job.name !== PRECOMPUTE_AGENDA_JOB) {
      return;
    }

    const { tenant_id, meeting_id } = job.data;

    if (!tenant_id) {
      throw new Error('Job rejected: missing tenant_id in payload.');
    }

    this.logger.log(
      `Processing ${PRECOMPUTE_AGENDA_JOB} — meeting ${meeting_id}, tenant ${tenant_id}`,
    );

    const tenantJob = new PrecomputeAgendaTenantJob(this.prisma);
    await tenantJob.execute(job.data);

    this.logger.log(
      `Completed ${PRECOMPUTE_AGENDA_JOB} — meeting ${meeting_id}, ` +
        `${tenantJob.itemsGenerated} items generated from sources: [${tenantJob.sourcesQueried.join(', ')}]`,
    );
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

class PrecomputeAgendaTenantJob extends TenantAwareJob<PrecomputeAgendaPayload> {
  private readonly logger = new Logger(PrecomputeAgendaTenantJob.name);

  /** Count of newly generated agenda items (read after execute). */
  public itemsGenerated = 0;

  /** Sources that were queried (read after execute). */
  public sourcesQueried: string[] = [];

  protected async processJob(
    data: PrecomputeAgendaPayload,
    tx: PrismaClient,
  ): Promise<void> {
    const { tenant_id, meeting_id } = data;
    const actorUserId = data.user_id ?? SYSTEM_USER_SENTINEL;

    // 1. Load the meeting
    const meeting = await tx.sstMeeting.findFirst({
      where: { id: meeting_id, tenant_id },
    });

    if (!meeting) {
      this.logger.warn(
        `Meeting ${meeting_id} not found for tenant ${tenant_id} — skipping`,
      );
      return;
    }

    // 2. Verify status = scheduled (skip if cancelled or other non-scheduled state)
    if (meeting.status !== 'scheduled') {
      this.logger.log(
        `Meeting ${meeting_id} status is '${meeting.status}', not 'scheduled' — skipping precompute`,
      );
      return;
    }

    // 3. Idempotency: skip if agenda_precomputed_at is within 5 min of now
    const now = new Date();
    if (meeting.agenda_precomputed_at) {
      const elapsed = Math.abs(
        now.getTime() - meeting.agenda_precomputed_at.getTime(),
      );
      if (elapsed < IDEMPOTENCY_WINDOW_MS) {
        this.logger.log(
          `Meeting ${meeting_id} agenda already precomputed at ${meeting.agenda_precomputed_at.toISOString()} ` +
            `(${Math.round(elapsed / 1000)}s ago, within 5-min window) — skipping`,
        );
        return;
      }
    }

    // 4. Load tenant settings for auto_agenda_sources
    const tenantSettings = await tx.tenantSetting.findFirst({
      where: { tenant_id },
      select: { settings: true },
    });

    const enabledSources = extractEnabledSources(tenantSettings?.settings);

    // 5. Determine "since" boundary — last completed meeting's scheduled_at
    const lastCompletedMeeting = await tx.sstMeeting.findFirst({
      where: {
        tenant_id,
        status: 'sst_completed',
        id: { not: meeting_id },
      },
      orderBy: { scheduled_at: 'desc' },
      select: { scheduled_at: true },
    });

    const sinceDate = lastCompletedMeeting?.scheduled_at ?? new Date(0);
    const meetingDate = meeting.scheduled_at;

    // 6. Load existing agenda items for de-duplication
    const existingItems = await tx.sstMeetingAgendaItem.findMany({
      where: { tenant_id, meeting_id },
      select: {
        source: true,
        student_id: true,
        case_id: true,
        concern_id: true,
      },
    });

    // 7. Run queries for each enabled source
    const newItems: AgendaSourceItem[] = [];

    if (enabledSources.includes('new_concerns')) {
      this.sourcesQueried.push('auto_new_concern');
      const items = await this.queryNewConcerns(tx, tenant_id, sinceDate);
      newItems.push(...items);
    }

    if (enabledSources.includes('case_reviews')) {
      this.sourcesQueried.push('auto_case_review');
      const items = await this.queryCasesRequiringReview(
        tx,
        tenant_id,
        meetingDate,
      );
      newItems.push(...items);
    }

    if (enabledSources.includes('overdue_actions')) {
      this.sourcesQueried.push('auto_overdue_action');
      const items = await this.queryOverdueActions(tx, tenant_id);
      newItems.push(...items);
    }

    if (enabledSources.includes('early_warning')) {
      this.sourcesQueried.push('auto_early_warning');
      // Placeholder — returns empty array until Phase 4
    }

    if (enabledSources.includes('neps')) {
      this.sourcesQueried.push('auto_neps');
      const items = await this.queryUpcomingNepsAppointments(
        tx,
        tenant_id,
        meetingDate,
      );
      newItems.push(...items);
    }

    if (enabledSources.includes('intervention_reviews')) {
      this.sourcesQueried.push('auto_intervention_review');
      const items = await this.queryInterventionReviewDates(
        tx,
        tenant_id,
        meetingDate,
      );
      newItems.push(...items);
    }

    // 8. De-duplicate: filter out items already in the agenda
    const deduped = this.deduplicateItems(existingItems, newItems);

    // 9. Assign display_order — group by source, start from max existing order + 1
    const maxExistingOrder = existingItems.length > 0
      ? Math.max(
          ...await tx.sstMeetingAgendaItem
            .findMany({
              where: { tenant_id, meeting_id },
              select: { display_order: true },
            })
            .then((items) => items.map((i) => i.display_order)),
        )
      : -1;

    let nextOrder = maxExistingOrder + 1;

    // 10. Insert new agenda items
    for (const item of deduped) {
      await tx.sstMeetingAgendaItem.create({
        data: {
          tenant_id,
          meeting_id,
          source: item.source,
          student_id: item.student_id,
          case_id: item.case_id,
          concern_id: item.concern_id,
          description: item.description,
          display_order: nextOrder++,
        },
      });
    }

    this.itemsGenerated = deduped.length;

    // 11. Update agenda_precomputed_at
    await tx.sstMeeting.update({
      where: { id: meeting_id },
      data: { agenda_precomputed_at: now },
    });

    // 12. Write pastoral_event: agenda_precomputed
    await tx.pastoralEvent.create({
      data: {
        tenant_id,
        event_type: 'agenda_precomputed',
        entity_type: 'meeting',
        entity_id: meeting_id,
        actor_user_id: actorUserId,
        tier: 2,
        payload: {
          meeting_id,
          items_generated: deduped.length,
          sources_queried: this.sourcesQueried,
        } satisfies Prisma.InputJsonValue as Prisma.InputJsonValue,
      },
    });
  }

  // ─── Source queries ───────────────────────────────────────────────────────

  /**
   * New concerns created since last completed meeting, tier <= 2.
   * Tier 3 concerns are never surfaced in SST agenda.
   */
  private async queryNewConcerns(
    tx: PrismaClient,
    tenantId: string,
    sinceDate: Date,
  ): Promise<AgendaSourceItem[]> {
    const concerns = await tx.pastoralConcern.findMany({
      where: {
        tenant_id: tenantId,
        tier: { lte: 2 },
        created_at: { gt: sinceDate },
      },
      select: {
        id: true,
        student_id: true,
        case_id: true,
        category: true,
        severity: true,
        student: { select: { first_name: true, last_name: true } },
      },
      orderBy: [{ severity: 'desc' }, { created_at: 'desc' }],
    });

    return concerns.map((c) => ({
      source: 'auto_new_concern' as const,
      student_id: c.student_id,
      case_id: c.case_id,
      concern_id: c.id,
      description: `New ${c.severity} concern (${c.category}) for ${c.student.first_name} ${c.student.last_name}`,
    }));
  }

  /**
   * Cases where next_review_date <= meeting date AND status IN (active, monitoring).
   */
  private async queryCasesRequiringReview(
    tx: PrismaClient,
    tenantId: string,
    meetingDate: Date,
  ): Promise<AgendaSourceItem[]> {
    const cases = await tx.pastoralCase.findMany({
      where: {
        tenant_id: tenantId,
        status: { in: ['active', 'monitoring'] },
        next_review_date: { lte: meetingDate },
      },
      select: {
        id: true,
        student_id: true,
        case_number: true,
        status: true,
        student: { select: { first_name: true, last_name: true } },
      },
      orderBy: { next_review_date: 'asc' },
    });

    return cases.map((c) => ({
      source: 'auto_case_review' as const,
      student_id: c.student_id,
      case_id: c.id,
      concern_id: null,
      description: `Case ${c.case_number} review due — ${c.student.first_name} ${c.student.last_name} (${c.status})`,
    }));
  }

  /**
   * Overdue SST meeting actions UNION overdue intervention actions.
   */
  private async queryOverdueActions(
    tx: PrismaClient,
    tenantId: string,
  ): Promise<AgendaSourceItem[]> {
    const items: AgendaSourceItem[] = [];

    // SST meeting actions with overdue status
    const overdueActions = await tx.sstMeetingAction.findMany({
      where: {
        tenant_id: tenantId,
        status: 'pc_overdue',
      },
      select: {
        id: true,
        student_id: true,
        case_id: true,
        description: true,
        assigned_to: { select: { first_name: true, last_name: true } },
      },
    });

    for (const a of overdueActions) {
      items.push({
        source: 'auto_overdue_action',
        student_id: a.student_id,
        case_id: a.case_id,
        concern_id: null,
        description: `Overdue action: ${a.description} (assigned to ${a.assigned_to.first_name} ${a.assigned_to.last_name})`,
      });
    }

    // Intervention actions with overdue status
    const overdueInterventionActions =
      await tx.pastoralInterventionAction.findMany({
        where: {
          tenant_id: tenantId,
          status: 'pc_overdue',
        },
        select: {
          id: true,
          description: true,
          intervention: {
            select: {
              student_id: true,
              case_id: true,
              student: { select: { first_name: true, last_name: true } },
            },
          },
          assigned_to: { select: { first_name: true, last_name: true } },
        },
      });

    for (const a of overdueInterventionActions) {
      items.push({
        source: 'auto_overdue_action',
        student_id: a.intervention.student_id,
        case_id: a.intervention.case_id,
        concern_id: null,
        description: `Overdue intervention action: ${a.description} for ${a.intervention.student.first_name} ${a.intervention.student.last_name} (assigned to ${a.assigned_to.first_name} ${a.assigned_to.last_name})`,
      });
    }

    return items;
  }

  /**
   * NEPS referrals where referral_type = 'neps' AND status IN (submitted, acknowledged, assessment_scheduled).
   */
  private async queryUpcomingNepsAppointments(
    tx: PrismaClient,
    tenantId: string,
    _meetingDate: Date,
  ): Promise<AgendaSourceItem[]> {
    // Query NEPS referrals with pending statuses
    const referrals = await tx.pastoralReferral.findMany({
      where: {
        tenant_id: tenantId,
        referral_type: 'neps',
        status: { in: ['submitted', 'acknowledged', 'assessment_scheduled'] },
      },
      select: {
        id: true,
        student_id: true,
        case_id: true,
        status: true,
        student: { select: { first_name: true, last_name: true } },
      },
      orderBy: { created_at: 'asc' },
    });

    // Filter: only include referrals whose next status change is expected before the meeting
    // Since we do not have a specific expected_date field, include all pending referrals
    // for visibility. The SST team decides relevance during the meeting.
    return referrals
      .filter(() => {
        // Include all active NEPS referrals — the SST will triage relevance.
        // A future enhancement could use assessment_scheduled date if tracked.
        return true;
      })
      .map((r) => ({
        source: 'auto_neps' as const,
        student_id: r.student_id,
        case_id: r.case_id,
        concern_id: null,
        description: `NEPS referral (${r.status}) — ${r.student.first_name} ${r.student.last_name}`,
      }));
  }

  /**
   * Interventions where next_review_date <= meeting date + 7 days AND status = active.
   */
  private async queryInterventionReviewDates(
    tx: PrismaClient,
    tenantId: string,
    meetingDate: Date,
  ): Promise<AgendaSourceItem[]> {
    const windowEnd = new Date(meetingDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const interventions = await tx.pastoralIntervention.findMany({
      where: {
        tenant_id: tenantId,
        status: 'pc_active',
        next_review_date: { lte: windowEnd },
      },
      select: {
        id: true,
        student_id: true,
        case_id: true,
        intervention_type: true,
        next_review_date: true,
        student: { select: { first_name: true, last_name: true } },
      },
      orderBy: { next_review_date: 'asc' },
    });

    return interventions.map((i) => ({
      source: 'auto_intervention_review' as const,
      student_id: i.student_id,
      case_id: i.case_id,
      concern_id: null,
      description: `Intervention review (${i.intervention_type}) due ${i.next_review_date.toISOString().slice(0, 10)} — ${i.student.first_name} ${i.student.last_name}`,
    }));
  }

  // ─── De-duplication ───────────────────────────────────────────────────────

  /**
   * An auto-generated item is a duplicate if an existing agenda item for the same
   * meeting has the same source AND the same non-null reference (concern_id, case_id,
   * or student_id depending on source type). Manual items are never duplicates.
   */
  private deduplicateItems(
    existing: Array<{
      source: string;
      student_id: string | null;
      case_id: string | null;
      concern_id: string | null;
    }>,
    newItems: AgendaSourceItem[],
  ): AgendaSourceItem[] {
    return newItems.filter((item) => {
      return !existing.some((e) => {
        if (e.source !== item.source) return false;

        // Match by the most specific reference available
        if (item.concern_id && e.concern_id) {
          return item.concern_id === e.concern_id;
        }
        if (item.case_id && e.case_id) {
          return item.case_id === e.case_id;
        }
        if (item.student_id && e.student_id) {
          return item.student_id === e.student_id;
        }

        return false;
      });
    });
  }
}

// ─── Tenant settings extraction ─────────────────────────────────────────────

const DEFAULT_SOURCES: string[] = [
  'new_concerns',
  'case_reviews',
  'overdue_actions',
  'early_warning',
  'neps',
  'intervention_reviews',
];

function extractEnabledSources(settingsJson: unknown): string[] {
  const settings = (settingsJson as Record<string, unknown>) ?? {};
  const pastoral = (settings?.pastoral as Record<string, unknown>) ?? {};
  const sst = (pastoral?.sst as Record<string, unknown>) ?? {};

  const sources = sst?.auto_agenda_sources;

  if (Array.isArray(sources)) {
    return sources.filter((s): s is string => typeof s === 'string');
  }

  return DEFAULT_SOURCES;
}
