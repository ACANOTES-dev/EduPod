import { Injectable, Logger } from '@nestjs/common';
import { $Enums } from '@prisma/client';

import { pastoralTenantSettingsSchema } from '@school/shared/pastoral';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AgendaSource =
  | 'auto_new_concern'
  | 'auto_case_review'
  | 'auto_overdue_action'
  | 'auto_early_warning'
  | 'auto_neps'
  | 'auto_intervention_review'
  | 'manual';

/** Maps tenant settings source keys to agenda item source column values. */
const SOURCE_KEY_TO_AGENDA_SOURCE: Record<string, AgendaSource> = {
  new_concerns: 'auto_new_concern',
  case_reviews: 'auto_case_review',
  overdue_actions: 'auto_overdue_action',
  early_warning: 'auto_early_warning',
  neps: 'auto_neps',
  intervention_reviews: 'auto_intervention_review',
};

export interface AgendaSourceItem {
  source: AgendaSource;
  student_id: string | null;
  case_id: string | null;
  concern_id: string | null;
  description: string;
}

export interface SstMeetingAgendaItemRow {
  id: string;
  tenant_id: string;
  meeting_id: string;
  source: string;
  student_id: string | null;
  case_id: string | null;
  concern_id: string | null;
  description: string;
  discussion_notes: string | null;
  decisions: string | null;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

interface EarlyWarningAlertRow {
  id: string;
  student_id: string;
  trigger_reason: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class SstAgendaGeneratorService {
  private readonly logger = new Logger(SstAgendaGeneratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── MAIN ENTRY POINT ──────────────────────────────────────────────────────

  /**
   * Full agenda generation: query enabled sources, merge with existing items,
   * insert new items, and update `agenda_precomputed_at`.
   */
  async generateAgenda(
    tenantId: string,
    meetingId: string,
    actorUserId: string,
  ): Promise<SstMeetingAgendaItemRow[]> {
    // 1. Load tenant settings to determine enabled sources
    const settings = await this.loadPastoralSettings(tenantId);
    const enabledSourceKeys = settings.sst.auto_agenda_sources;

    // 2. Load the meeting to get scheduled_at
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: actorUserId,
    });

    const result = await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const meeting = await db.sstMeeting.findUnique({
        where: { id: meetingId },
      });

      if (!meeting) {
        this.logger.warn(`Meeting ${meetingId} not found during agenda generation`);
        return [];
      }

      // 3. Find previous completed meeting's scheduled_at (the "since" boundary)
      const previousMeeting = await db.sstMeeting.findFirst({
        where: {
          tenant_id: tenantId,
          status: 'sst_completed' as $Enums.SstMeetingStatus,
          scheduled_at: { lt: meeting.scheduled_at },
        },
        orderBy: { scheduled_at: 'desc' },
        select: { scheduled_at: true },
      });

      const sinceDate = previousMeeting?.scheduled_at ?? new Date(0);
      const meetingDate = meeting.scheduled_at;

      // 4. For each enabled source, run the query
      const newItems: AgendaSourceItem[] = [];

      for (const sourceKey of enabledSourceKeys) {
        const agendaSource = SOURCE_KEY_TO_AGENDA_SOURCE[sourceKey];
        if (!agendaSource) continue;

        const sourceItems = await this.querySource(
          db,
          tenantId,
          agendaSource,
          sinceDate,
          meetingDate,
        );
        newItems.push(...sourceItems);
      }

      // 5. Load existing agenda items for de-duplication
      const existingItems = (await db.sstMeetingAgendaItem.findMany({
        where: { tenant_id: tenantId, meeting_id: meetingId },
        orderBy: { display_order: 'asc' },
      })) as SstMeetingAgendaItemRow[];

      // 6. Merge: filter out duplicates
      const itemsToInsert = this.mergeAgendaItems(meetingId, existingItems, newItems);

      // 7. Assign display_order: start after highest existing order
      const maxExistingOrder =
        existingItems.length > 0 ? Math.max(...existingItems.map((i) => i.display_order)) : 0;

      // Group by source for ordering within groups
      const groupedItems = this.groupBySource(itemsToInsert);
      let nextOrder = maxExistingOrder + 1;

      const insertedItems: SstMeetingAgendaItemRow[] = [];

      for (const group of groupedItems) {
        for (const item of group) {
          const created = await db.sstMeetingAgendaItem.create({
            data: {
              tenant_id: tenantId,
              meeting_id: meetingId,
              source: item.source,
              student_id: item.student_id ?? undefined,
              case_id: item.case_id ?? undefined,
              concern_id: item.concern_id ?? undefined,
              description: item.description,
              display_order: nextOrder,
            },
          });
          insertedItems.push(created as SstMeetingAgendaItemRow);
          nextOrder++;
        }
      }

      // 8. Update agenda_precomputed_at
      await db.sstMeeting.update({
        where: { id: meetingId },
        data: { agenda_precomputed_at: new Date() },
      });

      // Return all items (existing + new)
      return [...existingItems, ...insertedItems];
    });

    const allItems = result as SstMeetingAgendaItemRow[];

    // 9. Write audit event (fire-and-forget)
    const sourcesQueried = enabledSourceKeys
      .map((k) => SOURCE_KEY_TO_AGENDA_SOURCE[k])
      .filter((s): s is AgendaSource => !!s);

    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'agenda_precomputed',
      entity_type: 'meeting',
      entity_id: meetingId,
      student_id: null,
      actor_user_id: actorUserId,
      tier: 2,
      payload: {
        meeting_id: meetingId,
        items_generated: allItems.length,
        sources_queried: sourcesQueried,
      },
      ip_address: null,
    });

    return allItems;
  }

  // ─── SOURCE QUERIES ─────────────────────────────────────────────────────────

  /**
   * Dispatches to the correct source query based on type.
   */
  private async querySource(
    db: PrismaService,
    tenantId: string,
    source: AgendaSource,
    sinceDate: Date,
    meetingDate: Date,
  ): Promise<AgendaSourceItem[]> {
    switch (source) {
      case 'auto_new_concern':
        return this.queryNewConcerns(db, tenantId, sinceDate);
      case 'auto_case_review':
        return this.queryCasesRequiringReview(db, tenantId, meetingDate);
      case 'auto_overdue_action':
        return this.queryOverdueActions(db, tenantId);
      case 'auto_early_warning':
        return this.queryEarlyWarningFlags(db, tenantId, meetingDate);
      case 'auto_neps':
        return this.queryUpcomingNepsAppointments(db, tenantId, meetingDate);
      case 'auto_intervention_review':
        return this.queryInterventionReviewDates(db, tenantId, meetingDate);
      default:
        return [];
    }
  }

  /**
   * New pastoral concerns created since last meeting, tier <= 2.
   * Tier 3 concerns are never surfaced in SST agenda.
   */
  async queryNewConcerns(
    db: PrismaService,
    tenantId: string,
    sinceDate: Date,
  ): Promise<AgendaSourceItem[]> {
    const concerns = await db.pastoralConcern.findMany({
      where: {
        tenant_id: tenantId,
        created_at: { gte: sinceDate },
        tier: { lte: 2 },
      },
      select: {
        id: true,
        student_id: true,
        category: true,
        severity: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return concerns.map((c) => ({
      source: 'auto_new_concern' as const,
      student_id: c.student_id,
      case_id: null,
      concern_id: c.id,
      description: `New concern: ${c.category} (${c.severity})`,
    }));
  }

  /**
   * Cases where next_review_date <= meeting date, status IN (active, monitoring).
   */
  async queryCasesRequiringReview(
    db: PrismaService,
    tenantId: string,
    beforeDate: Date,
  ): Promise<AgendaSourceItem[]> {
    const cases = await db.pastoralCase.findMany({
      where: {
        tenant_id: tenantId,
        next_review_date: { lte: beforeDate },
        status: {
          in: ['active' as $Enums.PastoralCaseStatus, 'monitoring' as $Enums.PastoralCaseStatus],
        },
      },
      select: {
        id: true,
        student_id: true,
        case_number: true,
        status: true,
      },
    });

    return cases.map((c) => ({
      source: 'auto_case_review' as const,
      student_id: c.student_id,
      case_id: c.id,
      concern_id: null,
      description: `Case ${c.case_number} review due (${c.status as string})`,
    }));
  }

  /**
   * SST meeting actions with status 'overdue'.
   */
  async queryOverdueActions(db: PrismaService, tenantId: string): Promise<AgendaSourceItem[]> {
    const overdueActions = await db.sstMeetingAction.findMany({
      where: {
        tenant_id: tenantId,
        status: 'pc_overdue' as $Enums.PastoralActionStatus,
      },
      select: {
        id: true,
        student_id: true,
        case_id: true,
        description: true,
      },
    });

    return overdueActions.map((a) => ({
      source: 'auto_overdue_action' as const,
      student_id: a.student_id,
      case_id: a.case_id,
      concern_id: null,
      description: `Overdue action: ${a.description}`,
    }));
  }

  /**
   * Active predictive early-warning flags, grouped per student.
   *
   * Surfaces only operational facts and a "review recommended" prompt.
   * It must never expose risk scores or machine-authored risk labels.
   */
  async queryEarlyWarningFlags(
    db: PrismaService,
    tenantId: string,
    meetingDate: Date,
  ): Promise<AgendaSourceItem[]> {
    const alerts = (await db.studentAcademicRiskAlert.findMany({
      where: {
        tenant_id: tenantId,
        status: 'active' as $Enums.AcademicAlertStatus,
        detected_date: { lte: meetingDate },
      },
      select: {
        id: true,
        student_id: true,
        trigger_reason: true,
      },
      orderBy: [{ detected_date: 'desc' }, { created_at: 'desc' }],
    })) as EarlyWarningAlertRow[];

    const alertsByStudent = new Map<string, string[]>();

    for (const alert of alerts) {
      const reason = alert.trigger_reason.trim();
      if (!reason) continue;

      const existingReasons = alertsByStudent.get(alert.student_id) ?? [];
      if (!existingReasons.includes(reason)) {
        existingReasons.push(reason);
      }
      alertsByStudent.set(alert.student_id, existingReasons);
    }

    return Array.from(alertsByStudent.entries()).map(([studentId, reasons]) => {
      const visibleReasons = reasons.slice(0, 2);
      const remainingCount = Math.max(0, reasons.length - visibleReasons.length);
      const suffix =
        remainingCount > 0
          ? ` (+${remainingCount} more signal${remainingCount > 1 ? 's' : ''})`
          : '';

      return {
        source: 'auto_early_warning' as const,
        student_id: studentId,
        case_id: null,
        concern_id: null,
        description: `Review recommended: ${visibleReasons.join('; ')}${suffix}`,
      };
    });
  }

  /**
   * Pastoral referrals of type 'neps' with upcoming status changes.
   */
  async queryUpcomingNepsAppointments(
    db: PrismaService,
    tenantId: string,
    beforeDate: Date,
  ): Promise<AgendaSourceItem[]> {
    const referrals = await db.pastoralReferral.findMany({
      where: {
        tenant_id: tenantId,
        referral_type: 'neps',
        status: {
          in: [
            'submitted' as $Enums.PastoralReferralStatus,
            'acknowledged' as $Enums.PastoralReferralStatus,
            'assessment_scheduled' as $Enums.PastoralReferralStatus,
          ],
        },
        updated_at: { lte: beforeDate },
      },
      select: {
        id: true,
        student_id: true,
        case_id: true,
        status: true,
      },
    });

    return referrals.map((r) => ({
      source: 'auto_neps' as const,
      student_id: r.student_id,
      case_id: r.case_id,
      concern_id: null,
      description: `NEPS referral: ${r.status as string}`,
    }));
  }

  /**
   * Pastoral interventions with upcoming review dates.
   * next_review_date <= meeting.scheduled_at + 7 days AND status = 'active'.
   */
  async queryInterventionReviewDates(
    db: PrismaService,
    tenantId: string,
    beforeDate: Date,
  ): Promise<AgendaSourceItem[]> {
    const reviewWindow = new Date(beforeDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const interventions = await db.pastoralIntervention.findMany({
      where: {
        tenant_id: tenantId,
        next_review_date: { lte: reviewWindow },
        status: 'pc_active' as $Enums.PastoralInterventionStatus,
      },
      select: {
        id: true,
        student_id: true,
        case_id: true,
        intervention_type: true,
      },
    });

    return interventions.map((i) => ({
      source: 'auto_intervention_review' as const,
      student_id: i.student_id,
      case_id: i.case_id,
      concern_id: null,
      description: `Intervention review due: ${i.intervention_type}`,
    }));
  }

  // ─── MERGE / DE-DUPLICATION ─────────────────────────────────────────────────

  /**
   * De-duplicates new items against existing agenda items.
   *
   * An auto-generated item is considered a duplicate if an existing item
   * for the same meeting has:
   *   - the same `source` AND
   *   - the same non-null reference (concern_id, case_id, or student_id
   *     depending on source type)
   *
   * Manual items are never considered duplicates.
   */
  mergeAgendaItems(
    _meetingId: string,
    existingItems: SstMeetingAgendaItemRow[],
    newItems: AgendaSourceItem[],
  ): AgendaSourceItem[] {
    return newItems.filter((newItem) => {
      // Manual items are never duplicates
      if (newItem.source === 'manual') return true;

      return !existingItems.some((existing) => {
        if (existing.source !== newItem.source) return false;

        // Match on the appropriate reference field based on source type
        if (newItem.concern_id && existing.concern_id) {
          return newItem.concern_id === existing.concern_id;
        }
        if (newItem.case_id && existing.case_id) {
          return newItem.case_id === existing.case_id;
        }
        if (newItem.student_id && existing.student_id) {
          return newItem.student_id === existing.student_id;
        }

        return false;
      });
    });
  }

  // ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

  /**
   * Groups items by source for ordered insertion.
   * Each group is an array of items with the same source.
   */
  private groupBySource(items: AgendaSourceItem[]): AgendaSourceItem[][] {
    const groups = new Map<string, AgendaSourceItem[]>();

    for (const item of items) {
      const existing = groups.get(item.source);
      if (existing) {
        existing.push(item);
      } else {
        groups.set(item.source, [item]);
      }
    }

    return Array.from(groups.values());
  }

  // ─── Manual Agenda Item CRUD ──────────────────────────────────────────────

  async addManualItem(
    tenantId: string,
    meetingId: string,
    dto: { description: string; student_id?: string; case_id?: string; display_order?: number },
    actorUserId: string,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const maxOrder = await db.sstMeetingAgendaItem.count({ where: { meeting_id: meetingId } });
      const item = await db.sstMeetingAgendaItem.create({
        data: {
          tenant_id: tenantId,
          meeting_id: meetingId,
          source: 'manual',
          description: dto.description,
          student_id: dto.student_id ?? null,
          case_id: dto.case_id ?? null,
          display_order: dto.display_order ?? maxOrder,
        },
      });
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'agenda_item_added_manual',
        entity_type: 'meeting',
        entity_id: meetingId,
        student_id: dto.student_id ?? null,
        actor_user_id: actorUserId,
        tier: 1,
        payload: {
          meeting_id: meetingId,
          agenda_item_id: item.id,
          description: dto.description,
          added_by_user_id: actorUserId,
        },
        ip_address: null,
      });
      return { data: item };
    });
  }

  async updateItem(
    tenantId: string,
    meetingId: string,
    itemId: string,
    dto: { discussion_notes?: string; decisions?: string; display_order?: number },
    actorUserId: string,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const item = await db.sstMeetingAgendaItem.update({
        where: { id: itemId },
        data: { ...dto },
      });
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'agenda_item_updated',
        entity_type: 'meeting',
        entity_id: meetingId,
        student_id: null,
        actor_user_id: actorUserId,
        tier: 1,
        payload: {
          meeting_id: meetingId,
          agenda_item_id: itemId,
          fields_updated: Object.keys(dto),
        },
        ip_address: null,
      });
      return { data: item };
    });
  }

  async removeManualItem(
    tenantId: string,
    meetingId: string,
    itemId: string,
    _actorUserId: string,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.sstMeetingAgendaItem.delete({ where: { id: itemId } });
    });
  }

  /**
   * Loads and parses the pastoral section of tenant settings.
   */
  private async loadPastoralSettings(tenantId: string) {
    const record = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    const settingsJson = (record?.settings as Record<string, unknown>) ?? {};
    const pastoralRaw = (settingsJson.pastoral as Record<string, unknown>) ?? {};

    return pastoralTenantSettingsSchema.parse(pastoralRaw);
  }
}
