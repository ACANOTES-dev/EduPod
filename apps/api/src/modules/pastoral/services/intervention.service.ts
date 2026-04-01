import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';

import type {
  CreatePastoralInterventionDto,
  CreatePastoralInterventionProgressDto,
  PastoralInterventionFilters,
  PastoralInterventionStatusTransitionDto,
  RecordReviewDto,
  UpdatePastoralInterventionDto,
} from '@school/shared';
import { pastoralTenantSettingsSchema } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface InterventionRow {
  id: string;
  tenant_id: string;
  case_id: string;
  student_id: string;
  student_name?: string | null;
  case_number?: string | null;
  intervention_type: string;
  continuum_level: number;
  target_outcomes: unknown;
  review_cycle_weeks: number;
  next_review_date: Date;
  parent_informed: boolean;
  parent_consented: boolean | null;
  parent_input: string | null;
  student_voice: string | null;
  status: $Enums.PastoralInterventionStatus;
  outcome_notes: string | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface InterventionWithDetails extends InterventionRow {
  actions: Array<{
    id: string;
    description: string;
    assigned_to_user_id: string;
    frequency: string | null;
    start_date: Date;
    due_date: Date | null;
    completed_at: Date | null;
    status: $Enums.PastoralActionStatus;
    created_at: Date;
  }>;
  recent_progress: Array<{
    id: string;
    note: string;
    recorded_by_user_id: string;
    created_at: Date;
  }>;
  case: {
    id: string;
    case_number: string;
    status: $Enums.PastoralCaseStatus;
  } | null;
  student: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

export interface ProgressNoteRow {
  id: string;
  tenant_id: string;
  intervention_id: string;
  note: string;
  recorded_by_user_id: string;
  created_at: Date;
}

export interface InterventionTypeItem {
  key: string;
  label: string;
  active: boolean;
}

// ─── Terminal statuses ──────────────────────────────────────────────────────

const TERMINAL_STATUSES: ReadonlySet<$Enums.PastoralInterventionStatus> = new Set([
  $Enums.PastoralInterventionStatus.achieved,
  $Enums.PastoralInterventionStatus.partially_achieved,
  $Enums.PastoralInterventionStatus.not_achieved,
  $Enums.PastoralInterventionStatus.escalated,
  $Enums.PastoralInterventionStatus.withdrawn,
]);

const VALID_TERMINAL_TARGETS: ReadonlySet<string> = new Set([
  'achieved',
  'partially_achieved',
  'not_achieved',
  'escalated',
  'withdrawn',
]);

const OPEN_CASE_STATUSES: ReadonlySet<string> = new Set(['open', 'active']);

// ─── Helpers ────────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function buildReviewJobId(interventionId: string, nextReviewDate: string): string {
  return `intervention-review-${interventionId}-${nextReviewDate}`;
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0] as string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class InterventionService {
  private readonly logger = new Logger(InterventionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {}

  // ─── CREATE ─────────────────────────────────────────────────────────────────

  async createIntervention(
    tenantId: string,
    data: CreatePastoralInterventionDto,
    actorUserId: string,
  ): Promise<InterventionRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const intervention = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 1. Validate case exists and is open/active
      const parentCase = await db.pastoralCase.findFirst({
        where: { id: data.case_id, tenant_id: tenantId },
        select: { id: true, status: true, owner_user_id: true },
      });

      if (!parentCase) {
        throw new NotFoundException({
          code: 'CASE_NOT_FOUND',
          message: `Case "${data.case_id}" not found`,
        });
      }

      if (!OPEN_CASE_STATUSES.has(parentCase.status as string)) {
        throw new BadRequestException({
          code: 'CASE_NOT_OPEN',
          message: `Case "${data.case_id}" is not in an open or active status`,
        });
      }

      // 2. Validate intervention_type against tenant settings
      const interventionTypes = await this.loadInterventionTypes(db, tenantId);
      const activeTypeKeys = interventionTypes.filter((t) => t.active).map((t) => t.key);

      if (!activeTypeKeys.includes(data.intervention_type)) {
        throw new BadRequestException({
          code: 'INVALID_INTERVENTION_TYPE',
          message: `Unknown or inactive intervention type: "${data.intervention_type}"`,
        });
      }

      // 3. Calculate next_review_date
      const now = new Date();
      const reviewCycleWeeks = data.review_cycle_weeks ?? 6;
      const nextReviewDate = addDays(now, reviewCycleWeeks * 7);

      // 4. Create intervention record
      return db.pastoralIntervention.create({
        data: {
          tenant_id: tenantId,
          case_id: data.case_id,
          student_id: data.student_id,
          intervention_type: data.intervention_type,
          continuum_level: data.continuum_level,
          target_outcomes: data.target_outcomes as Prisma.InputJsonValue,
          review_cycle_weeks: reviewCycleWeeks,
          next_review_date: nextReviewDate,
          parent_informed: data.parent_informed ?? false,
          parent_consented: data.parent_consented ?? null,
          parent_input: data.parent_input ?? null,
          student_voice: data.student_voice ?? null,
          status: $Enums.PastoralInterventionStatus.pc_active,
          created_by_user_id: actorUserId,
        },
      });
    })) as InterventionRow;

    // 5. Enqueue review reminder (outside transaction — fire-and-forget)
    await this.enqueueReviewReminder(intervention);

    // 6. Emit audit event (fire-and-forget)
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'intervention_created',
      entity_type: 'intervention',
      entity_id: intervention.id,
      student_id: intervention.student_id,
      actor_user_id: actorUserId,
      tier: intervention.continuum_level,
      payload: {
        intervention_id: intervention.id,
        case_id: intervention.case_id,
        student_id: intervention.student_id,
        type: intervention.intervention_type,
        continuum_level: intervention.continuum_level,
        target_outcomes: intervention.target_outcomes,
        review_cycle_weeks: intervention.review_cycle_weeks,
        next_review_date: toDateString(intervention.next_review_date),
        created_by_user_id: actorUserId,
      },
      ip_address: null,
    });

    return intervention;
  }

  // ─── GET DETAIL ─────────────────────────────────────────────────────────────

  async getIntervention(
    tenantId: string,
    interventionId: string,
  ): Promise<InterventionWithDetails> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const intervention = await db.pastoralIntervention.findFirst({
        where: { id: interventionId, tenant_id: tenantId },
        include: {
          actions: {
            orderBy: { created_at: 'desc' },
            take: 10,
            select: {
              id: true,
              description: true,
              assigned_to_user_id: true,
              frequency: true,
              start_date: true,
              due_date: true,
              completed_at: true,
              status: true,
              created_at: true,
            },
          },
          progress: {
            orderBy: { created_at: 'desc' },
            take: 10,
            select: {
              id: true,
              note: true,
              recorded_by_user_id: true,
              created_at: true,
            },
          },
          case: {
            select: {
              id: true,
              case_number: true,
              status: true,
            },
          },
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
            },
          },
        },
      });

      if (!intervention) {
        throw new NotFoundException({
          code: 'INTERVENTION_NOT_FOUND',
          message: `Intervention "${interventionId}" not found`,
        });
      }

      return intervention;
    })) as {
      id: string;
      tenant_id: string;
      case_id: string;
      student_id: string;
      intervention_type: string;
      continuum_level: number;
      target_outcomes: unknown;
      review_cycle_weeks: number;
      next_review_date: Date;
      parent_informed: boolean;
      parent_consented: boolean | null;
      parent_input: string | null;
      student_voice: string | null;
      status: $Enums.PastoralInterventionStatus;
      outcome_notes: string | null;
      created_by_user_id: string;
      created_at: Date;
      updated_at: Date;
      actions: Array<{
        id: string;
        description: string;
        assigned_to_user_id: string;
        frequency: string | null;
        start_date: Date;
        due_date: Date | null;
        completed_at: Date | null;
        status: $Enums.PastoralActionStatus;
        created_at: Date;
      }>;
      progress: Array<{
        id: string;
        note: string;
        recorded_by_user_id: string;
        created_at: Date;
      }>;
      case: { id: string; case_number: string; status: $Enums.PastoralCaseStatus } | null;
      student: { id: string; first_name: string; last_name: string } | null;
    };

    return {
      id: result.id,
      tenant_id: result.tenant_id,
      case_id: result.case_id,
      student_id: result.student_id,
      intervention_type: result.intervention_type,
      continuum_level: result.continuum_level,
      target_outcomes: result.target_outcomes,
      review_cycle_weeks: result.review_cycle_weeks,
      next_review_date: result.next_review_date,
      parent_informed: result.parent_informed,
      parent_consented: result.parent_consented,
      parent_input: result.parent_input,
      student_voice: result.student_voice,
      status: result.status,
      outcome_notes: result.outcome_notes,
      created_by_user_id: result.created_by_user_id,
      created_at: result.created_at,
      updated_at: result.updated_at,
      actions: result.actions,
      recent_progress: result.progress,
      case: result.case,
      student: result.student,
    };
  }

  // ─── LIST (paginated, filterable) ───────────────────────────────────────────

  async listInterventions(
    tenantId: string,
    filters: PastoralInterventionFilters,
  ): Promise<{ data: InterventionRow[]; meta: PaginationMeta }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };

    if (filters.case_id) {
      where.case_id = filters.case_id;
    }
    if (filters.student_id) {
      where.student_id = filters.student_id;
    }
    if (filters.status) {
      where.status = filters.status as $Enums.PastoralInterventionStatus;
    }
    if (filters.continuum_level) {
      where.continuum_level = filters.continuum_level;
    }

    const [data, total] = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const items = await db.pastoralIntervention.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
        include: {
          student: {
            select: { first_name: true, last_name: true },
          },
          case: {
            select: { case_number: true },
          },
        },
      });

      const count = await db.pastoralIntervention.count({ where });

      return [items, count];
    })) as [
      Array<
        InterventionRow & {
          student: { first_name: string; last_name: string } | null;
          case: { case_number: string } | null;
        }
      >,
      number,
    ];

    return {
      data: data.map((item) => ({
        ...item,
        student_name: item.student
          ? `${item.student.first_name} ${item.student.last_name}`.trim()
          : null,
        case_number: item.case?.case_number ?? null,
      })),
      meta: { page, pageSize, total },
    };
  }

  // ─── LIST FOR CASE ──────────────────────────────────────────────────────────

  async listInterventionsForCase(tenantId: string, caseId: string): Promise<InterventionRow[]> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralIntervention.findMany({
        where: { tenant_id: tenantId, case_id: caseId },
        orderBy: { created_at: 'desc' },
      });
    })) as InterventionRow[];
  }

  // ─── LIST FOR STUDENT ───────────────────────────────────────────────────────

  async listInterventionsForStudent(
    tenantId: string,
    studentId: string,
    filter?: { status?: string; continuum_level?: number },
  ): Promise<InterventionRow[]> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      student_id: studentId,
    };

    if (filter?.status) {
      where.status = filter.status as $Enums.PastoralInterventionStatus;
    }
    if (filter?.continuum_level) {
      where.continuum_level = filter.continuum_level;
    }

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralIntervention.findMany({
        where,
        orderBy: { created_at: 'desc' },
      });
    })) as InterventionRow[];
  }

  // ─── UPDATE (only when active) ──────────────────────────────────────────────

  async updateIntervention(
    tenantId: string,
    interventionId: string,
    data: UpdatePastoralInterventionDto,
    actorUserId: string,
  ): Promise<InterventionRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralIntervention.findFirst({
        where: { id: interventionId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'INTERVENTION_NOT_FOUND',
          message: `Intervention "${interventionId}" not found`,
        });
      }

      this.assertInterventionEditable(existing as InterventionRow);

      // Build previous snapshot of mutable fields
      const previousSnapshot: Record<string, unknown> = {
        intervention_type: existing.intervention_type,
        continuum_level: existing.continuum_level,
        target_outcomes: existing.target_outcomes,
        review_cycle_weeks: existing.review_cycle_weeks,
        parent_informed: existing.parent_informed,
        parent_consented: existing.parent_consented,
        parent_input: existing.parent_input,
        student_voice: existing.student_voice,
      };

      // Build update data and track changed fields
      const updateData: Record<string, unknown> = {};
      const changedFields: string[] = [];

      if (data.intervention_type !== undefined) {
        updateData.intervention_type = data.intervention_type;
        changedFields.push('intervention_type');
      }
      if (data.continuum_level !== undefined) {
        updateData.continuum_level = data.continuum_level;
        changedFields.push('continuum_level');
      }
      if (data.target_outcomes !== undefined) {
        updateData.target_outcomes = data.target_outcomes as unknown as Record<string, unknown>[];
        changedFields.push('target_outcomes');
      }
      if (data.review_cycle_weeks !== undefined) {
        updateData.review_cycle_weeks = data.review_cycle_weeks;
        changedFields.push('review_cycle_weeks');
      }
      if (data.parent_informed !== undefined) {
        updateData.parent_informed = data.parent_informed;
        changedFields.push('parent_informed');
      }
      if (data.parent_consented !== undefined) {
        updateData.parent_consented = data.parent_consented;
        changedFields.push('parent_consented');
      }
      if (data.parent_input !== undefined) {
        updateData.parent_input = data.parent_input;
        changedFields.push('parent_input');
      }
      if (data.student_voice !== undefined) {
        updateData.student_voice = data.student_voice;
        changedFields.push('student_voice');
      }

      const result = await db.pastoralIntervention.update({
        where: { id: interventionId },
        data: updateData,
      });

      // Fire-and-forget: emit intervention_updated event
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'intervention_updated',
        entity_type: 'intervention',
        entity_id: interventionId,
        student_id: result.student_id,
        actor_user_id: actorUserId,
        tier: result.continuum_level,
        payload: {
          intervention_id: interventionId,
          previous_snapshot: previousSnapshot,
          changed_fields: changedFields,
        },
        ip_address: null,
      });

      return result;
    })) as InterventionRow;

    return updated;
  }

  // ─── CHANGE STATUS (state machine) ──────────────────────────────────────────

  async changeStatus(
    tenantId: string,
    interventionId: string,
    data: PastoralInterventionStatusTransitionDto,
    actorUserId: string,
  ): Promise<InterventionRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralIntervention.findFirst({
        where: { id: interventionId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'INTERVENTION_NOT_FOUND',
          message: `Intervention "${interventionId}" not found`,
        });
      }

      // Only active interventions can transition
      if (existing.status !== $Enums.PastoralInterventionStatus.pc_active) {
        throw new ConflictException({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot change status from "${existing.status as string}" — only active interventions can transition`,
        });
      }

      // Validate target status is a valid terminal state
      if (!VALID_TERMINAL_TARGETS.has(data.status)) {
        throw new BadRequestException({
          code: 'INVALID_TARGET_STATUS',
          message: `Invalid target status: "${data.status}"`,
        });
      }

      // outcome_notes is required for all terminal transitions
      if (!data.outcome_notes || data.outcome_notes.trim().length === 0) {
        throw new BadRequestException({
          code: 'OUTCOME_NOTES_REQUIRED',
          message: 'Outcome notes are required when changing intervention status',
        });
      }

      const newStatus = data.status as $Enums.PastoralInterventionStatus;

      const result = await db.pastoralIntervention.update({
        where: { id: interventionId },
        data: {
          status: newStatus,
          outcome_notes: data.outcome_notes,
        },
      });

      // When escalated: set linked case's next_review_date to today
      if (data.status === 'escalated') {
        await db.pastoralCase.update({
          where: { id: existing.case_id },
          data: { next_review_date: new Date() },
        });
      }

      return result;
    })) as InterventionRow;

    // Cancel pending review reminder job (outside transaction)
    await this.cancelReviewReminder(interventionId);

    // Fire-and-forget: emit intervention_status_changed event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'intervention_status_changed',
      entity_type: 'intervention',
      entity_id: interventionId,
      student_id: updated.student_id,
      actor_user_id: actorUserId,
      tier: updated.continuum_level,
      payload: {
        intervention_id: interventionId,
        old_status: 'active',
        new_status: data.status,
        outcome_notes: data.outcome_notes,
      },
      ip_address: null,
    });

    return updated;
  }

  // ─── RECORD REVIEW ─────────────────────────────────────────────────────────

  async recordReview(
    tenantId: string,
    interventionId: string,
    data: RecordReviewDto,
    actorUserId: string,
  ): Promise<InterventionRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.pastoralIntervention.findFirst({
        where: { id: interventionId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'INTERVENTION_NOT_FOUND',
          message: `Intervention "${interventionId}" not found`,
        });
      }

      this.assertInterventionEditable(existing as InterventionRow);

      // Advance next_review_date by review_cycle_weeks from today
      const now = new Date();
      const oldNextReviewDate = existing.next_review_date;
      const newNextReviewDate = addDays(now, existing.review_cycle_weeks * 7);

      const result = await db.pastoralIntervention.update({
        where: { id: interventionId },
        data: { next_review_date: newNextReviewDate },
      });

      // Write progress note if review_notes provided
      if (data.review_notes && data.review_notes.trim().length > 0) {
        await db.pastoralInterventionProgress.create({
          data: {
            tenant_id: tenantId,
            intervention_id: interventionId,
            note: data.review_notes,
            recorded_by_user_id: actorUserId,
          },
        });
      }

      // Fire-and-forget: emit intervention_updated event for review
      void this.eventService.write({
        tenant_id: tenantId,
        event_type: 'intervention_reviewed',
        entity_type: 'intervention',
        entity_id: interventionId,
        student_id: result.student_id,
        actor_user_id: actorUserId,
        tier: result.continuum_level,
        payload: {
          intervention_id: interventionId,
          old_next_review_date: toDateString(oldNextReviewDate as Date),
          new_next_review_date: toDateString(newNextReviewDate),
          review_notes: data.review_notes ?? null,
        },
        ip_address: null,
      });

      return result;
    })) as InterventionRow;

    // Enqueue new review reminder (outside transaction)
    await this.enqueueReviewReminder(updated);

    return updated;
  }

  // ─── GET INTERVENTION TYPES ─────────────────────────────────────────────────

  async getInterventionTypes(tenantId: string): Promise<InterventionTypeItem[]> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return this.loadInterventionTypes(db, tenantId);
    })) as InterventionTypeItem[];
  }

  // ─── PROGRESS NOTES (append-only) ──────────────────────────────────────────

  async addProgressNote(
    tenantId: string,
    interventionId: string,
    data: CreatePastoralInterventionProgressDto,
    actorUserId: string,
  ): Promise<ProgressNoteRow> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    const note = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Validate intervention exists (NO status check — notes allowed on terminal)
      const intervention = await db.pastoralIntervention.findFirst({
        where: { id: interventionId, tenant_id: tenantId },
      });

      if (!intervention) {
        throw new NotFoundException({
          code: 'INTERVENTION_NOT_FOUND',
          message: `Intervention "${interventionId}" not found`,
        });
      }

      return db.pastoralInterventionProgress.create({
        data: {
          tenant_id: tenantId,
          intervention_id: interventionId,
          note: data.note,
          recorded_by_user_id: actorUserId,
        },
      });
    })) as ProgressNoteRow;

    // Fire-and-forget: emit progress added event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'intervention_progress_added',
      entity_type: 'intervention',
      entity_id: interventionId,
      student_id: null,
      actor_user_id: actorUserId,
      tier: 1,
      payload: {
        intervention_id: interventionId,
        progress_id: note.id,
        recorded_by_user_id: actorUserId,
        note_preview: data.note.substring(0, 100),
      },
      ip_address: null,
    });

    return note;
  }

  async listProgressNotes(tenantId: string, interventionId: string): Promise<ProgressNoteRow[]> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.pastoralInterventionProgress.findMany({
        where: { tenant_id: tenantId, intervention_id: interventionId },
        orderBy: { created_at: 'asc' },
      });
    })) as ProgressNoteRow[];
  }

  // ─── ASSERT EDITABLE ───────────────────────────────────────────────────────

  assertInterventionEditable(intervention: InterventionRow): void {
    if (TERMINAL_STATUSES.has(intervention.status)) {
      throw new ConflictException({
        code: 'INTERVENTION_NOT_EDITABLE',
        message: `Intervention is in terminal status "${intervention.status as string}" and cannot be edited`,
      });
    }
  }

  // ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

  private async loadInterventionTypes(
    db: PrismaService,
    tenantId: string,
  ): Promise<InterventionTypeItem[]> {
    const tenantSetting = await db.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    if (!tenantSetting) {
      // Return defaults if no tenant settings exist
      return pastoralTenantSettingsSchema.parse({}).intervention_types;
    }

    const settings = tenantSetting.settings as Record<string, unknown> | null;
    const pastoralSettings = (settings?.pastoral ?? {}) as Record<string, unknown>;
    const parsed = pastoralTenantSettingsSchema.parse(pastoralSettings);

    return parsed.intervention_types;
  }

  private async enqueueReviewReminder(intervention: InterventionRow): Promise<void> {
    try {
      const nextReviewDateStr = toDateString(intervention.next_review_date);
      const jobId = buildReviewJobId(intervention.id, nextReviewDateStr);

      // Delay = next_review_date - 7 days - now (in ms)
      const reminderDate = addDays(intervention.next_review_date, -7);
      const delayMs = Math.max(0, reminderDate.getTime() - Date.now());

      await this.notificationsQueue.add(
        'pastoral:intervention-review-reminder',
        {
          tenant_id: intervention.tenant_id,
          intervention_id: intervention.id,
          case_id: intervention.case_id,
          student_id: intervention.student_id,
          next_review_date: nextReviewDateStr,
        },
        {
          jobId,
          delay: delayMs,
          attempts: 2,
          backoff: { type: 'exponential', delay: 5000 },
        },
      );

      this.logger.log(`Enqueued review reminder ${jobId} with delay ${delayMs}ms`);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to enqueue review reminder for intervention ${intervention.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async cancelReviewReminder(interventionId: string): Promise<void> {
    try {
      // Query the intervention's next_review_date to build the exact job ID.
      // Best-effort — the job processor will also skip if intervention is terminal.
      const intervention = await this.prisma.pastoralIntervention.findUnique({
        where: { id: interventionId },
        select: { next_review_date: true },
      });

      if (intervention?.next_review_date) {
        const jobId = buildReviewJobId(interventionId, toDateString(intervention.next_review_date));
        const job = await this.notificationsQueue.getJob(jobId);
        if (job) {
          await job.remove();
          this.logger.log(`Cancelled review reminder job ${jobId}`);
        }
      }
    } catch (error: unknown) {
      // Best-effort cancellation — log but do not propagate
      this.logger.error(
        `Failed to cancel review reminder for intervention ${interventionId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
