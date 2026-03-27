import { InjectQueue } from '@nestjs/bullmq';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import type {
  CreateMeetingDto,
  MeetingAttendeeDto,
  MeetingFilterDto,
} from '@school/shared';
import { pastoralTenantSettingsSchema } from '@school/shared';
import { Queue } from 'bullmq';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';
import { SstService } from './sst.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SstMeetingRow {
  id: string;
  tenant_id: string;
  scheduled_at: Date;
  status: $Enums.SstMeetingStatus;
  attendees: Prisma.JsonValue;
  general_notes: string | null;
  agenda_precomputed_at: Date | null;
  created_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface SstMeetingWithDetails extends SstMeetingRow {
  agenda_items: Array<{
    id: string;
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
  }>;
  actions: Array<{
    id: string;
    meeting_id: string;
    agenda_item_id: string | null;
    student_id: string | null;
    case_id: string | null;
    description: string;
    assigned_to_user_id: string;
    due_date: Date;
    completed_at: Date | null;
    completed_by_user_id: string | null;
    status: $Enums.PastoralActionStatus;
    created_at: Date;
    updated_at: Date;
  }>;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

// ─── Prisma enum mapping ────────────────────────────────────────────────────

const MEETING_STATUS_TO_ENUM: Record<string, $Enums.SstMeetingStatus> = {
  scheduled: 'scheduled' as $Enums.SstMeetingStatus,
  in_progress: 'sst_in_progress' as $Enums.SstMeetingStatus,
  completed: 'sst_completed' as $Enums.SstMeetingStatus,
  cancelled: 'sst_cancelled' as $Enums.SstMeetingStatus,
};

const ENUM_TO_STATUS: Record<string, string> = {
  scheduled: 'scheduled',
  sst_in_progress: 'in_progress',
  sst_completed: 'completed',
  sst_cancelled: 'cancelled',
};

function toDisplayStatus(prismaStatus: $Enums.SstMeetingStatus): string {
  return ENUM_TO_STATUS[prismaStatus as string] ?? (prismaStatus as string);
}

// ─── Valid transitions ──────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
};

function isValidMeetingTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return !!allowed && allowed.includes(to);
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class SstMeetingService {
  private readonly logger = new Logger(SstMeetingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
    private readonly sstService: SstService,
    @InjectQueue('pastoral') private readonly pastoralQueue: Queue,
  ) {}

  // ─── CREATE MEETING ─────────────────────────────────────────────────────────

  async createMeeting(
    tenantId: string,
    data: CreateMeetingDto,
    actorUserId: string,
  ): Promise<SstMeetingRow> {
    // 1. Get active SST member user IDs for auto-populating attendees
    const memberUserIds = await this.sstService.getActiveMemberUserIds(tenantId);

    // 2. Build attendees JSONB (present: null — to be marked during the meeting)
    const attendees: Array<{ user_id: string; name: string; present: null }> =
      memberUserIds.map((userId) => ({
        user_id: userId,
        name: userId, // Name will be resolved by the controller/frontend
        present: null,
      }));

    const scheduledAt = new Date(data.scheduled_at);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    const meeting = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.sstMeeting.create({
        data: {
          tenant_id: tenantId,
          scheduled_at: scheduledAt,
          status: 'scheduled' as $Enums.SstMeetingStatus,
          attendees: attendees as unknown as Prisma.InputJsonValue,
          created_by_user_id: actorUserId,
        },
      });
    })) as SstMeetingRow;

    // 3. Enqueue agenda pre-compute job
    await this.enqueueAgendaPrecompute(tenantId, meeting.id, scheduledAt, actorUserId);

    // 4. Fire-and-forget: write meeting_created audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'meeting_created',
      entity_type: 'meeting',
      entity_id: meeting.id,
      student_id: null,
      actor_user_id: actorUserId,
      tier: 2,
      payload: {
        meeting_id: meeting.id,
        scheduled_at: data.scheduled_at,
        created_by_user_id: actorUserId,
        attendee_count: attendees.length,
      },
      ip_address: null,
    });

    return meeting;
  }

  // ─── GET MEETING ──────────────────────────────────────────────────────────────

  async getMeeting(
    tenantId: string,
    meetingId: string,
  ): Promise<SstMeetingWithDetails> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    const meeting = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.sstMeeting.findUnique({
        where: { id: meetingId },
        include: {
          agenda_items: {
            orderBy: { display_order: 'asc' },
          },
          actions: {
            orderBy: { created_at: 'asc' },
          },
        },
      });
    })) as SstMeetingWithDetails | null;

    if (!meeting) {
      throw new NotFoundException({
        code: 'MEETING_NOT_FOUND',
        message: `Meeting "${meetingId}" not found`,
      });
    }

    return meeting;
  }

  // ─── LIST MEETINGS ────────────────────────────────────────────────────────────

  async listMeetings(
    tenantId: string,
    filter: MeetingFilterDto,
  ): Promise<{ data: SstMeetingRow[]; meta: PaginationMeta }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    const skip = (filter.page - 1) * filter.pageSize;

    const where: Prisma.SstMeetingWhereInput = {
      tenant_id: tenantId,
    };

    if (filter.status) {
      const prismaStatus = MEETING_STATUS_TO_ENUM[filter.status];
      if (prismaStatus) {
        where.status = prismaStatus;
      }
    }

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const [meetings, total] = await Promise.all([
        db.sstMeeting.findMany({
          where,
          orderBy: { scheduled_at: 'desc' },
          skip,
          take: filter.pageSize,
        }),
        db.sstMeeting.count({ where }),
      ]);

      return {
        data: meetings as SstMeetingRow[],
        meta: { page: filter.page, pageSize: filter.pageSize, total },
      };
    }) as Promise<{ data: SstMeetingRow[]; meta: PaginationMeta }>;
  }

  // ─── START MEETING ────────────────────────────────────────────────────────────

  async startMeeting(
    tenantId: string,
    meetingId: string,
    actorUserId: string,
  ): Promise<SstMeetingRow> {
    return this.transitionMeeting(tenantId, meetingId, 'in_progress', actorUserId);
  }

  // ─── COMPLETE MEETING ─────────────────────────────────────────────────────────

  async completeMeeting(
    tenantId: string,
    meetingId: string,
    actorUserId: string,
  ): Promise<SstMeetingRow> {
    return this.transitionMeeting(tenantId, meetingId, 'completed', actorUserId);
  }

  // ─── CANCEL MEETING ──────────────────────────────────────────────────────────

  async cancelMeeting(
    tenantId: string,
    meetingId: string,
    actorUserId: string,
    reason?: string,
  ): Promise<SstMeetingRow> {
    return this.transitionMeeting(tenantId, meetingId, 'cancelled', actorUserId, reason);
  }

  // ─── UPDATE ATTENDEES ─────────────────────────────────────────────────────────

  async updateAttendees(
    tenantId: string,
    meetingId: string,
    attendees: MeetingAttendeeDto[],
    actorUserId: string,
  ): Promise<SstMeetingRow> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const meeting = await db.sstMeeting.findUnique({
        where: { id: meetingId },
      });

      if (!meeting) {
        throw new NotFoundException({
          code: 'MEETING_NOT_FOUND',
          message: `Meeting "${meetingId}" not found`,
        });
      }

      this.assertMeetingEditable(meeting as SstMeetingRow);

      return db.sstMeeting.update({
        where: { id: meetingId },
        data: {
          attendees: attendees as unknown as Prisma.InputJsonValue,
        },
      });
    })) as SstMeetingRow;

    // Fire-and-forget: write meeting_attendees_updated audit event
    const presentCount = attendees.filter((a) => a.present === true).length;
    const absentCount = attendees.filter((a) => a.present === false).length;

    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'meeting_attendees_updated',
      entity_type: 'meeting',
      entity_id: meetingId,
      student_id: null,
      actor_user_id: actorUserId,
      tier: 2,
      payload: {
        meeting_id: meetingId,
        attendees_present: presentCount,
        attendees_absent: absentCount,
      },
      ip_address: null,
    });

    return updated;
  }

  // ─── UPDATE GENERAL NOTES ─────────────────────────────────────────────────────

  async updateGeneralNotes(
    tenantId: string,
    meetingId: string,
    notes: string,
    _actorUserId: string,
  ): Promise<SstMeetingRow> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const meeting = await db.sstMeeting.findUnique({
        where: { id: meetingId },
      });

      if (!meeting) {
        throw new NotFoundException({
          code: 'MEETING_NOT_FOUND',
          message: `Meeting "${meetingId}" not found`,
        });
      }

      this.assertMeetingEditable(meeting as SstMeetingRow);

      return db.sstMeeting.update({
        where: { id: meetingId },
        data: { general_notes: notes },
      });
    })) as SstMeetingRow;

    return updated;
  }

  // ─── ASSERT MEETING EDITABLE ──────────────────────────────────────────────────

  assertMeetingEditable(meeting: SstMeetingRow): void {
    const displayStatus = toDisplayStatus(meeting.status);
    if (displayStatus === 'completed') {
      throw new ConflictException({
        code: 'MEETING_COMPLETED',
        message: 'Cannot modify a completed meeting',
      });
    }
  }

  // ─── ENQUEUE AGENDA PRECOMPUTE ────────────────────────────────────────────────

  async enqueueAgendaPrecompute(
    tenantId: string,
    meetingId: string,
    scheduledAt: Date,
    actorUserId: string,
  ): Promise<void> {
    try {
      // Load tenant SST settings for precompute_minutes_before
      const settings = await this.loadSstSettings(tenantId);
      const precomputeMinutes = settings.precompute_minutes_before;

      const now = Date.now();
      const precomputeTime = scheduledAt.getTime() - precomputeMinutes * 60 * 1000;
      const delayMs = Math.max(0, precomputeTime - now);

      await this.pastoralQueue.add(
        'pastoral:precompute-agenda',
        {
          tenant_id: tenantId,
          user_id: actorUserId,
          meeting_id: meetingId,
        },
        {
          delay: delayMs,
          jobId: `pastoral:precompute-agenda:${tenantId}:${meetingId}`,
        },
      );
    } catch (error: unknown) {
      // Best-effort: log but do not fail meeting creation
      this.logger.error(
        `Failed to enqueue agenda precompute for meeting ${meetingId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // ─── PRIVATE: TRANSITION MEETING ──────────────────────────────────────────────

  private async transitionMeeting(
    tenantId: string,
    meetingId: string,
    newStatus: string,
    actorUserId: string,
    reason?: string,
  ): Promise<SstMeetingRow> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    let oldStatus = '';

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const meeting = await db.sstMeeting.findUnique({
        where: { id: meetingId },
      });

      if (!meeting) {
        throw new NotFoundException({
          code: 'MEETING_NOT_FOUND',
          message: `Meeting "${meetingId}" not found`,
        });
      }

      const currentDisplayStatus = toDisplayStatus(meeting.status as $Enums.SstMeetingStatus);
      oldStatus = currentDisplayStatus;

      if (!isValidMeetingTransition(currentDisplayStatus, newStatus)) {
        throw new ConflictException({
          code: 'INVALID_MEETING_TRANSITION',
          message: `Cannot transition meeting from "${currentDisplayStatus}" to "${newStatus}"`,
        });
      }

      const prismaNewStatus = MEETING_STATUS_TO_ENUM[newStatus];
      if (!prismaNewStatus) {
        throw new ConflictException({
          code: 'INVALID_STATUS',
          message: `Invalid meeting status: "${newStatus}"`,
        });
      }

      return db.sstMeeting.update({
        where: { id: meetingId },
        data: { status: prismaNewStatus },
      });
    })) as SstMeetingRow;

    // Fire-and-forget: write meeting_status_changed audit event
    void this.eventService.write({
      tenant_id: tenantId,
      event_type: 'meeting_status_changed',
      entity_type: 'meeting',
      entity_id: meetingId,
      student_id: null,
      actor_user_id: actorUserId,
      tier: 2,
      payload: {
        meeting_id: meetingId,
        old_status: oldStatus,
        new_status: newStatus,
        changed_by_user_id: actorUserId,
        reason: reason ?? null,
      },
      ip_address: null,
    });

    return updated;
  }

  // ─── PRIVATE: LOAD SST SETTINGS ──────────────────────────────────────────────

  // ─── Action Methods ──────────────────────────────────────────────────────

  async listActionsForMeeting(tenantId: string, meetingId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const actions = await db.sstMeetingAction.findMany({
        where: { meeting_id: meetingId, tenant_id: tenantId },
        orderBy: { created_at: 'asc' },
      });
      return { data: actions };
    });
  }

  async listAllActions(tenantId: string, filter: { status?: string; assigned_to_user_id?: string; page?: number; pageSize?: number }) {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const where: Record<string, unknown> = { tenant_id: tenantId };
      if (filter.status) where.status = filter.status;
      if (filter.assigned_to_user_id) where.assigned_to_user_id = filter.assigned_to_user_id;
      const [actions, total] = await Promise.all([
        db.sstMeetingAction.findMany({ where, skip: (page - 1) * pageSize, take: pageSize, orderBy: { created_at: 'desc' } }),
        db.sstMeetingAction.count({ where }),
      ]);
      return { data: actions, meta: { page, pageSize, total } };
    });
  }

  async listMyActions(tenantId: string, userId: string, filter?: { status?: string; page?: number; pageSize?: number }) {
    return this.listAllActions(tenantId, { ...filter, assigned_to_user_id: userId });
  }

  async createAction(tenantId: string, meetingId: string, dto: { agenda_item_id?: string; student_id?: string; case_id?: string; description: string; assigned_to_user_id: string; due_date: string }, actorUserId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const action = await db.sstMeetingAction.create({
        data: {
          tenant_id: tenantId,
          meeting_id: meetingId,
          agenda_item_id: dto.agenda_item_id ?? null,
          student_id: dto.student_id ?? null,
          case_id: dto.case_id ?? null,
          description: dto.description,
          assigned_to_user_id: dto.assigned_to_user_id,
          due_date: new Date(dto.due_date),
          status: 'pc_pending' as $Enums.PastoralActionStatus,
        },
      });
      void this.eventService.write({
        tenant_id: tenantId, event_type: 'action_assigned', entity_type: 'meeting',
        entity_id: meetingId, student_id: dto.student_id ?? null, actor_user_id: actorUserId,
        tier: 1, payload: { action_id: action.id, source: 'meeting', meeting_id: meetingId, assigned_to_user_id: dto.assigned_to_user_id, description: dto.description, due_date: dto.due_date }, ip_address: null,
      });
      return { data: action };
    });
  }

  async updateAction(tenantId: string, actionId: string, dto: { description?: string; status?: string; due_date?: string }, _actorUserId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const data: Record<string, unknown> = {};
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.status !== undefined) data.status = dto.status;
      if (dto.due_date !== undefined) data.due_date = new Date(dto.due_date);
      const action = await db.sstMeetingAction.update({ where: { id: actionId }, data });
      return { data: action };
    });
  }

  async completeAction(tenantId: string, actionId: string, actorUserId: string) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const action = await db.sstMeetingAction.update({
        where: { id: actionId },
        data: { status: 'pc_completed' as $Enums.PastoralActionStatus, completed_at: new Date(), completed_by_user_id: actorUserId },
      });
      void this.eventService.write({
        tenant_id: tenantId, event_type: 'action_completed', entity_type: 'meeting',
        entity_id: action.meeting_id, student_id: null, actor_user_id: actorUserId,
        tier: 1, payload: { action_id: actionId, completed_by_user_id: actorUserId }, ip_address: null,
      });
      return { data: action };
    });
  }

  private async loadSstSettings(tenantId: string) {
    const record = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    const settingsJson = (record?.settings as Record<string, unknown>) ?? {};
    const pastoralRaw = (settingsJson.pastoral as Record<string, unknown>) ?? {};
    const parsed = pastoralTenantSettingsSchema.parse(pastoralRaw);

    return parsed.sst;
  }
}
