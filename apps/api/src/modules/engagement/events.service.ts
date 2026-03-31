import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EngagementEventStatus } from '@prisma/client';
import type { EventStaffRole } from '@prisma/client';
import type { CreateEngagementEventDto, UpdateEngagementEventDto } from '@school/shared';
import { EVENT_VALID_TRANSITIONS } from '@school/shared';
import type { Queue } from 'bullmq';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EventListFilters {
  page: number;
  pageSize: number;
  status?: string;
  event_type?: string;
  academic_year_id?: string;
  search?: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('engagement') private readonly engagementQueue: Queue,
  ) {}

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateEngagementEventDto) {
    const { staff_ids, ...eventData } = dto;
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;

      const event = await db.engagementEvent.create({
        data: {
          tenant_id: tenantId,
          created_by_user_id: userId,
          title: eventData.title,
          title_ar: eventData.title_ar,
          description: eventData.description,
          description_ar: eventData.description_ar,
          event_type: eventData.event_type,
          start_date: eventData.start_date ? new Date(eventData.start_date) : null,
          end_date: eventData.end_date ? new Date(eventData.end_date) : null,
          start_time: eventData.start_time ? new Date(`1970-01-01T${eventData.start_time}`) : null,
          end_time: eventData.end_time ? new Date(`1970-01-01T${eventData.end_time}`) : null,
          location: eventData.location,
          location_ar: eventData.location_ar,
          capacity: eventData.capacity,
          target_type: eventData.target_type,
          target_config_json: eventData.target_config_json ?? undefined,
          consent_form_template_id: eventData.consent_form_template_id,
          risk_assessment_template_id: eventData.risk_assessment_template_id,
          fee_amount: eventData.fee_amount ?? null,
          fee_description: eventData.fee_description,
          slot_duration_minutes: eventData.slot_duration_minutes,
          buffer_minutes: eventData.buffer_minutes,
          consent_deadline: eventData.consent_deadline
            ? new Date(eventData.consent_deadline)
            : null,
          payment_deadline: eventData.payment_deadline
            ? new Date(eventData.payment_deadline)
            : null,
          booking_deadline: eventData.booking_deadline
            ? new Date(eventData.booking_deadline)
            : null,
          risk_assessment_required: eventData.risk_assessment_required,
          academic_year_id: eventData.academic_year_id,
        },
      });

      if (staff_ids?.length) {
        await db.engagementEventStaff.createMany({
          data: staff_ids.map((staff_id) => ({
            tenant_id: tenantId,
            event_id: event.id,
            staff_id,
            role: 'organiser' as const,
          })),
        });
      }

      this.logger.log(`Created event ${event.id} for tenant ${tenantId}`);
      return event;
    });
  }

  async findAll(tenantId: string, filters: EventListFilters) {
    const { page, pageSize, status, event_type, academic_year_id, search } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (status) where.status = status;
    if (event_type) where.event_type = event_type;
    if (academic_year_id) where.academic_year_id = academic_year_id;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.engagementEvent.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          _count: { select: { staff: true, participants: true } },
          academic_year: { select: { id: true, name: true } },
        },
      }),
      this.prisma.engagementEvent.count({ where }),
    ]);

    return {
      data: data.map((e) => ({
        ...e,
        fee_amount: e.fee_amount ? Number(e.fee_amount) : null,
        staff_count: e._count.staff,
        participant_count: e._count.participants,
      })),
      meta: { page, pageSize, total },
    };
  }

  async findOne(tenantId: string, eventId: string) {
    const event = await this.prisma.engagementEvent.findFirst({
      where: { id: eventId, tenant_id: tenantId },
      include: {
        staff: {
          include: { staff: { select: { id: true, user_id: true } } },
        },
        _count: { select: { participants: true } },
        consent_form_template: { select: { id: true, name: true, form_type: true } },
        risk_assessment_template: { select: { id: true, name: true, form_type: true } },
        academic_year: { select: { id: true, name: true } },
      },
    });

    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: `Event with id "${eventId}" not found`,
      });
    }

    return {
      ...event,
      fee_amount: event.fee_amount ? Number(event.fee_amount) : null,
      participant_count: event._count.participants,
    };
  }

  async update(tenantId: string, eventId: string, dto: UpdateEngagementEventDto) {
    const existing = await this.ensureEventExists(tenantId, eventId);

    if (existing.status !== 'draft' && existing.status !== 'published') {
      throw new BadRequestException({
        code: 'EVENT_NOT_EDITABLE',
        message: `Cannot update event in "${existing.status}" status`,
      });
    }

    const { staff_ids, ...updateData } = dto;
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;

      const event = await db.engagementEvent.update({
        where: { id: eventId },
        data: {
          ...updateData,
          fee_amount: updateData.fee_amount ?? undefined,
          target_config_json: updateData.target_config_json ?? undefined,
          start_date: updateData.start_date ? new Date(updateData.start_date) : undefined,
          end_date: updateData.end_date ? new Date(updateData.end_date) : undefined,
          consent_deadline: updateData.consent_deadline
            ? new Date(updateData.consent_deadline)
            : undefined,
          payment_deadline: updateData.payment_deadline
            ? new Date(updateData.payment_deadline)
            : undefined,
          booking_deadline: updateData.booking_deadline
            ? new Date(updateData.booking_deadline)
            : undefined,
        },
      });

      if (staff_ids !== undefined) {
        await db.engagementEventStaff.deleteMany({
          where: { event_id: eventId, tenant_id: tenantId },
        });

        if (staff_ids.length) {
          await db.engagementEventStaff.createMany({
            data: staff_ids.map((staff_id) => ({
              tenant_id: tenantId,
              event_id: eventId,
              staff_id,
              role: 'organiser' as const,
            })),
          });
        }
      }

      return event;
    });
  }

  async remove(tenantId: string, eventId: string) {
    const existing = await this.ensureEventExists(tenantId, eventId);

    if (existing.status !== 'draft') {
      throw new BadRequestException({
        code: 'EVENT_NOT_DELETABLE',
        message: 'Only draft events can be deleted',
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;
      await db.engagementEvent.delete({ where: { id: eventId } });
    });
  }

  // ─── Lifecycle Transitions ────────────────────────────────────────────────

  async publish(tenantId: string, eventId: string, _userId: string) {
    return this.transitionStatus(tenantId, eventId, EngagementEventStatus.published);
  }

  async open(tenantId: string, eventId: string, _userId: string) {
    const event = await this.ensureEventExists(tenantId, eventId);

    // Trip risk assessment gate
    const tripTypes = ['school_trip', 'overnight_trip'];
    if (
      tripTypes.includes(event.event_type) &&
      event.risk_assessment_required &&
      !event.risk_assessment_approved
    ) {
      throw new BadRequestException({
        code: 'RISK_ASSESSMENT_NOT_APPROVED',
        message: 'Trip events require an approved risk assessment before opening',
      });
    }

    const updated = await this.transitionStatus(tenantId, eventId, EngagementEventStatus.open);

    // Enqueue form distribution
    await this.engagementQueue.add('engagement:distribute-forms', {
      tenant_id: tenantId,
      event_id: eventId,
    });

    // Enqueue invoice generation for paid events
    if (event.fee_amount && Number(event.fee_amount) > 0) {
      await this.engagementQueue.add('engagement:generate-event-invoices', {
        tenant_id: tenantId,
        event_id: eventId,
      });
    }

    return updated;
  }

  async close(tenantId: string, eventId: string, _userId: string) {
    return this.transitionStatus(tenantId, eventId, EngagementEventStatus.closed);
  }

  async cancel(tenantId: string, eventId: string, _userId: string) {
    const updated = await this.transitionStatus(tenantId, eventId, EngagementEventStatus.cancelled);

    await this.engagementQueue.add('engagement:cancel-event', {
      tenant_id: tenantId,
      event_id: eventId,
    });

    return updated;
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string, eventId: string) {
    const event = await this.ensureEventExists(tenantId, eventId);

    const [participants, staff_count] = await Promise.all([
      this.prisma.engagementEventParticipant.findMany({
        where: { event_id: eventId, tenant_id: tenantId },
        select: { status: true, consent_status: true, payment_status: true },
      }),
      this.prisma.engagementEventStaff.count({
        where: { event_id: eventId, tenant_id: tenantId },
      }),
    ]);

    const activeStatuses = [
      'registered',
      'consent_pending',
      'consent_granted',
      'payment_pending',
      'confirmed',
      'attended',
    ];

    const total_invited = participants.length;
    const total_registered = participants.filter((p) => activeStatuses.includes(p.status)).length;

    const consent_stats = {
      granted: participants.filter((p) => p.consent_status === 'granted').length,
      pending: participants.filter((p) => p.consent_status === 'pending').length,
      declined: participants.filter((p) => p.consent_status === 'declined').length,
      expired: participants.filter((p) => p.consent_status === null).length,
    };

    const payment_stats = {
      paid: participants.filter((p) => p.payment_status === 'paid').length,
      pending: participants.filter((p) => p.payment_status === 'pending').length,
      waived: participants.filter((p) => p.payment_status === 'waived').length,
      not_required: participants.filter((p) => p.payment_status === 'not_required').length,
    };

    const excludedFromCapacity = ['withdrawn', 'absent', 'consent_declined', 'invited'];
    const capacity_used = participants.filter(
      (p) => !excludedFromCapacity.includes(p.status),
    ).length;

    // Staff-to-student ratio (staff : students, expressed as "1:N" or null when no staff assigned)
    const staff_to_student_ratio =
      staff_count > 0 && total_registered > 0
        ? `1:${Math.ceil(total_registered / staff_count)}`
        : null;

    return {
      total_invited,
      total_registered,
      consent_stats,
      payment_stats,
      capacity: event.capacity,
      capacity_used,
      staff_count,
      staff_to_student_ratio,
    };
  }

  // ─── Staff Management ─────────────────────────────────────────────────────

  async addStaff(tenantId: string, eventId: string, staffId: string, role: EventStaffRole) {
    await this.ensureEventExists(tenantId, eventId);

    const existing = await this.prisma.engagementEventStaff.findFirst({
      where: { event_id: eventId, staff_id: staffId, tenant_id: tenantId },
    });

    if (existing) {
      throw new ConflictException({
        code: 'STAFF_ALREADY_ASSIGNED',
        message: `Staff member "${staffId}" is already assigned to this event`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;
      return db.engagementEventStaff.create({
        data: { tenant_id: tenantId, event_id: eventId, staff_id: staffId, role },
      });
    });
  }

  async removeStaff(tenantId: string, eventId: string, staffId: string) {
    await this.ensureEventExists(tenantId, eventId);

    const existing = await this.prisma.engagementEventStaff.findFirst({
      where: { event_id: eventId, staff_id: staffId, tenant_id: tenantId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'STAFF_NOT_ASSIGNED',
        message: `Staff member "${staffId}" is not assigned to this event`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;
      await db.engagementEventStaff.delete({ where: { id: existing.id } });
    });
  }

  async listStaff(tenantId: string, eventId: string) {
    await this.ensureEventExists(tenantId, eventId);

    return this.prisma.engagementEventStaff.findMany({
      where: { event_id: eventId, tenant_id: tenantId },
      include: {
        staff: { select: { id: true, user_id: true } },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  // ─── Trip & Logistics Operations ──────────────────────────────────────────

  async approveRiskAssessment(tenantId: string, eventId: string, userId: string) {
    const event = await this.ensureEventExists(tenantId, eventId);

    if (!event.risk_assessment_required) {
      throw new BadRequestException({
        code: 'RISK_ASSESSMENT_NOT_REQUIRED',
        message: 'This event does not require risk assessment approval',
      });
    }

    if (event.risk_assessment_approved) {
      throw new BadRequestException({
        code: 'RISK_ASSESSMENT_ALREADY_APPROVED',
        message: 'Risk assessment has already been approved',
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;
      return db.engagementEvent.update({
        where: { id: eventId },
        data: {
          risk_assessment_approved: true,
          risk_assessment_approved_by: userId,
          risk_assessment_approved_at: new Date(),
        },
      });
    });
  }

  async rejectRiskAssessment(tenantId: string, eventId: string) {
    const event = await this.ensureEventExists(tenantId, eventId);

    if (!event.risk_assessment_required) {
      throw new BadRequestException({
        code: 'RISK_ASSESSMENT_NOT_REQUIRED',
        message: 'This event does not require risk assessment approval',
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;
      return db.engagementEvent.update({
        where: { id: eventId },
        data: {
          risk_assessment_approved: false,
          risk_assessment_approved_by: null,
          risk_assessment_approved_at: null,
        },
      });
    });
  }

  async getAttendance(tenantId: string, eventId: string) {
    await this.ensureEventExists(tenantId, eventId);

    const participants = await this.prisma.engagementEventParticipant.findMany({
      where: {
        event_id: eventId,
        tenant_id: tenantId,
        status: { notIn: ['withdrawn', 'consent_declined'] },
      },
      select: {
        id: true,
        student_id: true,
        attendance_marked: true,
        attendance_marked_at: true,
        student: {
          select: {
            first_name: true,
            last_name: true,
            full_name: true,
            household: {
              select: {
                emergency_contacts: {
                  select: {
                    id: true,
                    contact_name: true,
                    phone: true,
                    relationship_label: true,
                  },
                  orderBy: { display_order: 'asc' as const },
                },
              },
            },
          },
        },
      },
      orderBy: { student: { last_name: 'asc' } },
    });

    return {
      data: participants,
      summary: {
        total: participants.length,
        marked_present: participants.filter((p) => p.attendance_marked === true).length,
        marked_absent: participants.filter(
          (p) => p.attendance_marked === false && p.attendance_marked_at !== null,
        ).length,
        unmarked: participants.filter((p) => p.attendance_marked_at === null).length,
      },
    };
  }

  async markAttendance(
    tenantId: string,
    eventId: string,
    studentId: string,
    present: boolean,
    userId: string,
  ) {
    await this.ensureEventExists(tenantId, eventId);

    const participant = await this.prisma.engagementEventParticipant.findFirst({
      where: {
        event_id: eventId,
        student_id: studentId,
        tenant_id: tenantId,
      },
    });

    if (!participant) {
      throw new NotFoundException({
        code: 'PARTICIPANT_NOT_FOUND',
        message: `Student "${studentId}" is not a participant of this event`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;
      return db.engagementEventParticipant.update({
        where: { id: participant.id },
        data: {
          attendance_marked: present,
          attendance_marked_at: new Date(),
          attendance_marked_by: userId,
        },
      });
    });
  }

  async confirmHeadcount(tenantId: string, eventId: string, countPresent: number) {
    const event = await this.ensureEventExists(tenantId, eventId);

    const markedPresent = await this.prisma.engagementEventParticipant.count({
      where: {
        event_id: eventId,
        tenant_id: tenantId,
        attendance_marked: true,
      },
    });

    if (countPresent !== markedPresent) {
      throw new BadRequestException({
        code: 'HEADCOUNT_MISMATCH',
        message: `Headcount ${countPresent} does not match ${markedPresent} marked present`,
      });
    }

    // Transition to in_progress if not already
    if (event.status === 'closed') {
      return this.transitionStatus(tenantId, eventId, EngagementEventStatus.in_progress);
    }

    return event;
  }

  async completeEvent(tenantId: string, eventId: string) {
    const event = await this.ensureEventExists(tenantId, eventId);

    if (event.status !== 'in_progress') {
      throw new BadRequestException({
        code: 'EVENT_NOT_IN_PROGRESS',
        message: `Cannot complete event in "${event.status}" status — must be in_progress`,
      });
    }

    // Check all participants have attendance resolved (attendance_marked_at is set when marked)
    const unresolvedCount = await this.prisma.engagementEventParticipant.count({
      where: {
        event_id: eventId,
        tenant_id: tenantId,
        attendance_marked_at: null,
        status: { notIn: ['withdrawn', 'consent_declined'] },
      },
    });

    if (unresolvedCount > 0) {
      throw new BadRequestException({
        code: 'ATTENDANCE_NOT_RESOLVED',
        message: `${unresolvedCount} participant(s) still have unresolved attendance`,
      });
    }

    const completedEvent = await this.transitionStatus(
      tenantId,
      eventId,
      EngagementEventStatus.completed,
    );

    // ─── Financial reconciliation summary ──────────────────────────────────
    const participants = await this.prisma.engagementEventParticipant.findMany({
      where: { event_id: eventId, tenant_id: tenantId },
      select: { payment_status: true },
    });

    const feeAmount = event.fee_amount ? Number(event.fee_amount) : 0;
    const paymentRequired = participants.filter((p) => p.payment_status !== 'not_required').length;
    const paid = participants.filter((p) => p.payment_status === 'paid').length;
    const unpaid = participants.filter((p) => p.payment_status === 'pending').length;
    const waived = participants.filter((p) => p.payment_status === 'waived').length;
    const refunded = participants.filter((p) => p.payment_status === 'refunded').length;

    const financial_reconciliation = {
      total_participants: participants.length,
      payment_required: paymentRequired,
      paid,
      unpaid,
      waived,
      refunded,
      total_fee_amount: feeAmount * paymentRequired,
      total_collected: feeAmount * paid,
    };

    return { event: completedEvent, financial_reconciliation };
  }

  async createIncident(
    tenantId: string,
    eventId: string,
    userId: string,
    dto: { title: string; description: string },
  ) {
    await this.ensureEventExists(tenantId, eventId);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;
      return db.engagementIncidentReport.create({
        data: {
          tenant_id: tenantId,
          event_id: eventId,
          title: dto.title,
          description: dto.description,
          reported_by_user_id: userId,
        },
      });
    });
  }

  async listIncidents(tenantId: string, eventId: string) {
    await this.ensureEventExists(tenantId, eventId);

    return this.prisma.engagementIncidentReport.findMany({
      where: { event_id: eventId, tenant_id: tenantId },
      orderBy: { created_at: 'desc' },
      include: {
        reported_by: { select: { id: true, email: true } },
      },
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async ensureEventExists(tenantId: string, eventId: string) {
    const event = await this.prisma.engagementEvent.findFirst({
      where: { id: eventId, tenant_id: tenantId },
    });

    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: `Event with id "${eventId}" not found`,
      });
    }

    return event;
  }

  private async transitionStatus(
    tenantId: string,
    eventId: string,
    targetStatus: EngagementEventStatus,
  ) {
    const event = await this.ensureEventExists(tenantId, eventId);
    const currentStatus = event.status;

    // Type-specific rule: policy_signoff skips in_progress (closed → completed directly)
    const isPolicySignoffShortcut =
      event.event_type === 'policy_signoff' &&
      currentStatus === 'closed' &&
      targetStatus === 'completed';

    const validTargets = EVENT_VALID_TRANSITIONS[currentStatus];
    if (!isPolicySignoffShortcut && (!validTargets || !validTargets.includes(targetStatus))) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `Cannot transition from "${currentStatus}" to "${targetStatus}"`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;
      return db.engagementEvent.update({
        where: { id: eventId },
        data: { status: targetStatus },
      });
    });
  }
}
