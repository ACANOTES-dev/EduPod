import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { TimeSlotStatus } from '@prisma/client';
import type { CreateBookingDto, GenerateTimeSlotsDto } from '@school/shared';
import { BOOKING_VALID_TRANSITIONS, SLOT_VALID_TRANSITIONS } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TimeSlotQuery {
  page: number;
  pageSize: number;
  teacher_id?: string;
  status?: string;
}

interface BookingQuery {
  page: number;
  pageSize: number;
}

interface RawTimeSlot {
  id: string;
  status: string;
  start_time: Date;
  end_time: Date;
  teacher_id: string;
}

interface SlotStats {
  total: number;
  available: number;
  booked: number;
  blocked: number;
  completed: number;
  cancelled: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ConferencesService {
  private readonly logger = new Logger(ConferencesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Slot Generation ────────────────────────────────────────────────────

  async generateTimeSlots(tenantId: string, eventId: string, dto: GenerateTimeSlotsDto) {
    await this.ensureConferenceEvent(tenantId, eventId);

    const startTime = new Date(`${dto.date}T${dto.start_time}`);
    const endTime = new Date(`${dto.date}T${dto.end_time}`);

    if (startTime >= endTime) {
      throw new BadRequestException({
        code: 'INVALID_TIME_RANGE',
        message: 'start_time must be before end_time',
      });
    }

    const slotMs = dto.slot_duration_minutes * 60_000;
    const bufferMs = dto.buffer_minutes * 60_000;
    const stepMs = slotMs + bufferMs;

    const slotsData: Array<{
      tenant_id: string;
      event_id: string;
      teacher_id: string;
      start_time: Date;
      end_time: Date;
    }> = [];

    for (const teacherId of dto.teacher_ids) {
      let current = startTime.getTime();
      while (current + slotMs <= endTime.getTime()) {
        slotsData.push({
          tenant_id: tenantId,
          event_id: eventId,
          teacher_id: teacherId,
          start_time: new Date(current),
          end_time: new Date(current + slotMs),
        });
        current += stepMs;
      }
    }

    if (!slotsData.length) {
      throw new BadRequestException({
        code: 'NO_SLOTS_GENERATED',
        message: 'Time range too short to generate any slots',
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;
      await db.conferenceTimeSlot.createMany({ data: slotsData });

      return {
        created: slotsData.length,
        per_teacher: Math.floor(slotsData.length / dto.teacher_ids.length),
      };
    });
  }

  // ─── Time Slots CRUD ────────────────────────────────────────────────────

  async findAllTimeSlots(tenantId: string, eventId: string, query: TimeSlotQuery) {
    await this.ensureConferenceEvent(tenantId, eventId);

    const { page, pageSize, teacher_id, status } = query;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      event_id: eventId,
      tenant_id: tenantId,
    };
    if (teacher_id) where.teacher_id = teacher_id;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.conferenceTimeSlot.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ teacher_id: 'asc' }, { start_time: 'asc' }],
        include: {
          teacher: { select: { id: true, user_id: true } },
          booking: {
            select: {
              id: true,
              student_id: true,
              booking_type: true,
              status: true,
              student: { select: { id: true, first_name: true, last_name: true } },
            },
          },
        },
      }),
      this.prisma.conferenceTimeSlot.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  async updateTimeSlot(tenantId: string, eventId: string, slotId: string, dto: { status: string }) {
    await this.ensureConferenceEvent(tenantId, eventId);

    const slot = await this.prisma.conferenceTimeSlot.findFirst({
      where: { id: slotId, event_id: eventId, tenant_id: tenantId },
    });

    if (!slot) {
      throw new NotFoundException({
        code: 'SLOT_NOT_FOUND',
        message: `Time slot with id "${slotId}" not found`,
      });
    }

    const validTargets = SLOT_VALID_TRANSITIONS[slot.status];
    if (!validTargets || !validTargets.includes(dto.status)) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `Cannot transition slot from "${slot.status}" to "${dto.status}"`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;
      return db.conferenceTimeSlot.update({
        where: { id: slotId },
        data: { status: dto.status as TimeSlotStatus },
      });
    });
  }

  // ─── Bookings CRUD ─────────────────────────────────────────────────────

  async findAllBookings(tenantId: string, eventId: string, query: BookingQuery) {
    await this.ensureConferenceEvent(tenantId, eventId);

    const { page, pageSize } = query;
    const skip = (page - 1) * pageSize;

    const where = {
      tenant_id: tenantId,
      time_slot: { event_id: eventId },
    };

    const [data, total] = await Promise.all([
      this.prisma.conferenceBooking.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { booked_at: 'desc' },
        include: {
          time_slot: {
            select: {
              id: true,
              start_time: true,
              end_time: true,
              teacher_id: true,
              teacher: { select: { id: true, user_id: true } },
            },
          },
          student: { select: { id: true, first_name: true, last_name: true } },
        },
      }),
      this.prisma.conferenceBooking.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  async createBooking(tenantId: string, eventId: string, userId: string, dto: CreateBookingDto) {
    await this.ensureConferenceEvent(tenantId, eventId);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;

      // Lock the slot row to prevent concurrent booking
      const slots = await db.$queryRaw<RawTimeSlot[]>`
        SELECT id, status, start_time, end_time, teacher_id
        FROM conference_time_slots
        WHERE id = ${dto.time_slot_id}
        FOR UPDATE
      `;

      const slot = slots[0];
      if (!slot) {
        throw new NotFoundException({
          code: 'SLOT_NOT_FOUND',
          message: `Time slot with id "${dto.time_slot_id}" not found`,
        });
      }

      if (slot.status !== 'available') {
        throw new ConflictException({
          code: 'SLOT_NOT_AVAILABLE',
          message: `Time slot is currently "${slot.status}", not available for booking`,
        });
      }

      // Create booking and transition slot to booked
      const booking = await db.conferenceBooking.create({
        data: {
          tenant_id: tenantId,
          time_slot_id: dto.time_slot_id,
          student_id: dto.student_id,
          booked_by_user_id: userId,
          booking_type: dto.booking_type ?? 'parent_booked',
          video_call_link: dto.video_call_link,
          notes: dto.notes,
        },
      });

      await db.conferenceTimeSlot.update({
        where: { id: dto.time_slot_id },
        data: { status: 'booked' },
      });

      this.logger.log(`Created booking ${booking.id} for slot ${dto.time_slot_id}`);
      return booking;
    });
  }

  async cancelBooking(tenantId: string, eventId: string, bookingId: string) {
    await this.ensureConferenceEvent(tenantId, eventId);

    const booking = await this.prisma.conferenceBooking.findFirst({
      where: { id: bookingId, tenant_id: tenantId, time_slot: { event_id: eventId } },
    });

    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: `Booking with id "${bookingId}" not found`,
      });
    }

    const validTargets = BOOKING_VALID_TRANSITIONS[booking.status];
    if (!validTargets || !validTargets.includes('cancelled')) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `Cannot cancel booking in "${booking.status}" status`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;

      await db.conferenceBooking.update({
        where: { id: bookingId },
        data: { status: 'cancelled', cancelled_at: new Date() },
      });

      // Return slot to available
      await db.conferenceTimeSlot.update({
        where: { id: booking.time_slot_id },
        data: { status: 'available' },
      });

      this.logger.log(
        `Cancelled booking ${bookingId}, slot ${booking.time_slot_id} returned to available`,
      );
    });
  }

  // ─── Teacher Schedule ──────────────────────────────────────────────────

  async getTeacherSchedule(tenantId: string, eventId: string, userId: string) {
    await this.ensureConferenceEvent(tenantId, eventId);

    const staff = await this.prisma.staffProfile.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
    });

    if (!staff) {
      throw new NotFoundException({
        code: 'STAFF_NOT_FOUND',
        message: 'No staff profile found for the current user',
      });
    }

    const slots = await this.prisma.conferenceTimeSlot.findMany({
      where: { event_id: eventId, teacher_id: staff.id, tenant_id: tenantId },
      orderBy: { start_time: 'asc' },
      include: {
        booking: {
          include: {
            student: { select: { id: true, first_name: true, last_name: true } },
            booked_by: { select: { id: true, email: true } },
          },
        },
      },
    });

    return { teacher_id: staff.id, event_id: eventId, slots };
  }

  // ─── Parent Endpoints ──────────────────────────────────────────────────

  async getAvailableSlots(tenantId: string, eventId: string, userId: string) {
    await this.ensureConferenceEvent(tenantId, eventId);

    const studentIds = await this.getParentStudentIds(userId, tenantId);
    const teacherIds = await this.getStudentTeacherIds(tenantId, studentIds);

    if (!teacherIds.length) {
      return { data: [] };
    }

    const slots = await this.prisma.conferenceTimeSlot.findMany({
      where: {
        event_id: eventId,
        tenant_id: tenantId,
        status: 'available',
        teacher_id: { in: teacherIds },
      },
      orderBy: [{ teacher_id: 'asc' }, { start_time: 'asc' }],
      include: {
        teacher: { select: { id: true, user_id: true } },
      },
    });

    return { data: slots };
  }

  async parentBook(tenantId: string, eventId: string, userId: string, dto: CreateBookingDto) {
    const event = await this.ensureConferenceEvent(tenantId, eventId);

    // Check booking deadline
    if (event.booking_deadline && new Date() > new Date(event.booking_deadline)) {
      throw new BadRequestException({
        code: 'BOOKING_DEADLINE_PASSED',
        message: 'The booking deadline for this conference has passed',
      });
    }

    // Verify parent-student link
    await this.verifyParentStudentLink(userId, tenantId, dto.student_id);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;

      // Lock the slot row
      const slots = await db.$queryRaw<RawTimeSlot[]>`
        SELECT id, status, start_time, end_time, teacher_id
        FROM conference_time_slots
        WHERE id = ${dto.time_slot_id}
        FOR UPDATE
      `;

      const slot = slots[0];
      if (!slot) {
        throw new NotFoundException({
          code: 'SLOT_NOT_FOUND',
          message: `Time slot with id "${dto.time_slot_id}" not found`,
        });
      }

      if (slot.status !== 'available') {
        throw new ConflictException({
          code: 'SLOT_NOT_AVAILABLE',
          message: `Time slot is currently "${slot.status}", not available for booking`,
        });
      }

      // Parent double-booking prevention: check for overlapping confirmed bookings
      const parentStudentIds = await this.getParentStudentIds(userId, tenantId);
      const overlapping = await db.conferenceBooking.findFirst({
        where: {
          tenant_id: tenantId,
          student_id: { in: parentStudentIds },
          status: 'confirmed',
          time_slot: {
            event_id: eventId,
            start_time: { lt: slot.end_time },
            end_time: { gt: slot.start_time },
          },
        },
      });

      if (overlapping) {
        throw new ConflictException({
          code: 'PARENT_DOUBLE_BOOKING',
          message: 'You already have a booking that overlaps with this time slot',
        });
      }

      // Create booking and transition slot
      const booking = await db.conferenceBooking.create({
        data: {
          tenant_id: tenantId,
          time_slot_id: dto.time_slot_id,
          student_id: dto.student_id,
          booked_by_user_id: userId,
          booking_type: 'parent_booked',
          video_call_link: dto.video_call_link,
          notes: dto.notes,
        },
      });

      await db.conferenceTimeSlot.update({
        where: { id: dto.time_slot_id },
        data: { status: 'booked' },
      });

      return booking;
    });
  }

  async parentCancelBooking(tenantId: string, eventId: string, bookingId: string, userId: string) {
    await this.ensureConferenceEvent(tenantId, eventId);

    // Check tenant config for cancellation policy
    const tenantSettings = await this.prisma.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    const settings = (tenantSettings?.settings ?? {}) as Record<string, unknown>;
    const engConfig = (settings.engagement ?? {}) as Record<string, unknown>;
    const allowCancel = engConfig.allow_parent_conference_cancellation !== false;

    if (!allowCancel) {
      throw new ForbiddenException({
        code: 'CANCELLATION_NOT_ALLOWED',
        message: 'Parent conference cancellation is not enabled for this school',
      });
    }

    // Verify booking belongs to this parent's children
    const studentIds = await this.getParentStudentIds(userId, tenantId);

    const booking = await this.prisma.conferenceBooking.findFirst({
      where: {
        id: bookingId,
        tenant_id: tenantId,
        student_id: { in: studentIds },
        time_slot: { event_id: eventId },
      },
    });

    if (!booking) {
      throw new NotFoundException({
        code: 'BOOKING_NOT_FOUND',
        message: `Booking with id "${bookingId}" not found or not linked to your children`,
      });
    }

    if (booking.status !== 'confirmed') {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `Cannot cancel booking in "${booking.status}" status`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;

      await db.conferenceBooking.update({
        where: { id: bookingId },
        data: { status: 'cancelled', cancelled_at: new Date() },
      });

      await db.conferenceTimeSlot.update({
        where: { id: booking.time_slot_id },
        data: { status: 'available' },
      });
    });
  }

  async getParentBookings(tenantId: string, eventId: string, userId: string) {
    await this.ensureConferenceEvent(tenantId, eventId);

    const studentIds = await this.getParentStudentIds(userId, tenantId);

    const bookings = await this.prisma.conferenceBooking.findMany({
      where: {
        tenant_id: tenantId,
        student_id: { in: studentIds },
        time_slot: { event_id: eventId },
      },
      orderBy: { time_slot: { start_time: 'asc' } },
      include: {
        time_slot: {
          select: {
            id: true,
            start_time: true,
            end_time: true,
            teacher: { select: { id: true, user_id: true } },
          },
        },
        student: { select: { id: true, first_name: true, last_name: true } },
      },
    });

    return { data: bookings };
  }

  // ─── Stats ────────────────────────────────────────────────────────────

  async getBookingStats(tenantId: string, eventId: string) {
    await this.ensureConferenceEvent(tenantId, eventId);

    const slots = await this.prisma.conferenceTimeSlot.findMany({
      where: { event_id: eventId, tenant_id: tenantId },
      select: { teacher_id: true, status: true },
    });

    const perTeacher = new Map<string, SlotStats>();

    for (const slot of slots) {
      let s = perTeacher.get(slot.teacher_id);
      if (!s) {
        s = { total: 0, available: 0, booked: 0, blocked: 0, completed: 0, cancelled: 0 };
        perTeacher.set(slot.teacher_id, s);
      }
      s.total++;
      if (slot.status === 'available') s.available++;
      else if (slot.status === 'booked') s.booked++;
      else if (slot.status === 'blocked') s.blocked++;
      else if (slot.status === 'completed') s.completed++;
      else if (slot.status === 'cancelled') s.cancelled++;
    }

    return {
      per_teacher: Array.from(perTeacher.entries()).map(([teacher_id, counts]) => ({
        teacher_id,
        ...counts,
      })),
      totals: {
        total: slots.length,
        available: slots.filter((s) => s.status === 'available').length,
        booked: slots.filter((s) => s.status === 'booked').length,
        blocked: slots.filter((s) => s.status === 'blocked').length,
        completed: slots.filter((s) => s.status === 'completed').length,
        cancelled: slots.filter((s) => s.status === 'cancelled').length,
      },
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  private async ensureConferenceEvent(tenantId: string, eventId: string) {
    const event = await this.prisma.engagementEvent.findFirst({
      where: { id: eventId, tenant_id: tenantId },
    });

    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: `Event with id "${eventId}" not found`,
      });
    }

    if (event.event_type !== 'parent_conference') {
      throw new BadRequestException({
        code: 'NOT_CONFERENCE_EVENT',
        message: 'This endpoint is only available for parent_conference events',
      });
    }

    return event;
  }

  private async getParentStudentIds(userId: string, tenantId: string): Promise<string[]> {
    const parent = await this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
    });

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent profile found for the current user',
      });
    }

    const links = await this.prisma.studentParent.findMany({
      where: { parent_id: parent.id, tenant_id: tenantId },
      select: { student_id: true },
    });

    return links.map((l) => l.student_id);
  }

  private async getStudentTeacherIds(tenantId: string, studentIds: string[]): Promise<string[]> {
    const enrolments = await this.prisma.classEnrolment.findMany({
      where: {
        tenant_id: tenantId,
        student_id: { in: studentIds },
        status: 'active',
      },
      select: { class_id: true },
    });

    const classIds = [...new Set(enrolments.map((e) => e.class_id))];

    if (!classIds.length) return [];

    const staffAssignments = await this.prisma.classStaff.findMany({
      where: {
        tenant_id: tenantId,
        class_id: { in: classIds },
      },
      select: { staff_profile_id: true },
    });

    return [...new Set(staffAssignments.map((s) => s.staff_profile_id))];
  }

  private async verifyParentStudentLink(
    userId: string,
    tenantId: string,
    studentId: string,
  ): Promise<void> {
    const parent = await this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
    });

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent profile found for the current user',
      });
    }

    const link = await this.prisma.studentParent.findUnique({
      where: {
        student_id_parent_id: { student_id: studentId, parent_id: parent.id },
      },
    });

    if (!link || link.tenant_id !== tenantId) {
      throw new ForbiddenException({
        code: 'NOT_LINKED_TO_STUDENT',
        message: 'You are not linked to this student',
      });
    }
  }
}
