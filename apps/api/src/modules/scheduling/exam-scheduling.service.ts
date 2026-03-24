import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type {
  AddExamSlotDto,
  CreateExamSessionDto,
  ExamSessionQuery,
  UpdateExamSessionDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

interface InvigilatorCandidate {
  staff_profile_id: string;
  name: string;
  role: 'lead' | 'assistant';
}

@Injectable()
export class ExamSchedulingService {
  private readonly logger = new Logger(ExamSchedulingService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Create Exam Session ──────────────────────────────────────────────────

  async createExamSession(tenantId: string, dto: CreateExamSessionDto) {
    const period = await this.prisma.academicPeriod.findFirst({
      where: { id: dto.academic_period_id, tenant_id: tenantId },
      select: { id: true },
    });
    if (!period) {
      throw new NotFoundException({
        error: { code: 'ACADEMIC_PERIOD_NOT_FOUND', message: 'Academic period not found' },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const session = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.examSession.create({
        data: {
          tenant_id: tenantId,
          academic_period_id: dto.academic_period_id,
          name: dto.name,
          start_date: new Date(dto.start_date),
          end_date: new Date(dto.end_date),
          status: 'planning',
        },
      });
    }) as unknown as { id: string; status: string; created_at: Date };

    return {
      id: (session as { id: string }).id,
      name: dto.name,
      status: (session as { status: string }).status,
      created_at: (session as { created_at: Date }).created_at.toISOString(),
    };
  }

  // ─── Get Exam Session ─────────────────────────────────────────────────────

  async getExamSession(tenantId: string, sessionId: string) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      include: {
        exam_slots: {
          include: {
            subject: { select: { name: true } },
            year_group: { select: { name: true } },
            room: { select: { name: true } },
            invigilations: {
              include: {
                staff_profile: {
                  select: { user: { select: { first_name: true, last_name: true } } },
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }

    return this.formatSession(session);
  }

  // ─── List Exam Sessions ───────────────────────────────────────────────────

  async listExamSessions(tenantId: string, query: ExamSessionQuery) {
    const skip = (query.page - 1) * query.pageSize;

    const where: { tenant_id: string; academic_period_id?: string } = { tenant_id: tenantId };
    if (query.academic_period_id) {
      where.academic_period_id = query.academic_period_id;
    }

    const [data, total] = await Promise.all([
      this.prisma.examSession.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { start_date: 'asc' },
        select: {
          id: true,
          name: true,
          start_date: true,
          end_date: true,
          status: true,
          academic_period_id: true,
          _count: { select: { exam_slots: true } },
          created_at: true,
        },
      }),
      this.prisma.examSession.count({ where }),
    ]);

    return {
      data: data.map((s) => ({
        id: s.id,
        name: s.name,
        start_date: s.start_date.toISOString().slice(0, 10),
        end_date: s.end_date.toISOString().slice(0, 10),
        status: s.status,
        academic_period_id: s.academic_period_id,
        slot_count: s._count.exam_slots,
        created_at: s.created_at.toISOString(),
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Update Exam Session ──────────────────────────────────────────────────

  async updateExamSession(
    tenantId: string,
    sessionId: string,
    dto: UpdateExamSessionDto,
  ) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true, status: true },
    });
    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }

    if (session.status === 'published' || session.status === 'completed') {
      throw new BadRequestException({
        error: {
          code: 'SESSION_NOT_EDITABLE',
          message: 'Published or completed sessions cannot be edited',
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.examSession.update({
        where: { id: sessionId },
        data: {
          ...(dto.name ? { name: dto.name } : {}),
          ...(dto.start_date ? { start_date: new Date(dto.start_date) } : {}),
          ...(dto.end_date ? { end_date: new Date(dto.end_date) } : {}),
        },
      });
    }) as unknown as { id: string; name: string; status: string; updated_at: Date };

    return {
      id: (updated as { id: string }).id,
      name: (updated as { name: string }).name,
      status: (updated as { status: string }).status,
      updated_at: (updated as { updated_at: Date }).updated_at.toISOString(),
    };
  }

  // ─── Delete Exam Session ──────────────────────────────────────────────────

  async deleteExamSession(tenantId: string, sessionId: string) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true, status: true },
    });
    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }

    if (session.status === 'published') {
      throw new BadRequestException({
        error: { code: 'SESSION_PUBLISHED', message: 'Cannot delete a published exam session' },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.examSession.delete({ where: { id: sessionId } });
    });

    return { deleted: true };
  }

  // ─── Add Exam Slot ────────────────────────────────────────────────────────

  async addExamSlot(
    tenantId: string,
    sessionId: string,
    dto: AddExamSlotDto,
  ) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true, status: true, start_date: true, end_date: true },
    });
    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }

    // Verify exam date falls within session bounds
    const slotDate = new Date(dto.date);
    if (slotDate < session.start_date || slotDate > session.end_date) {
      throw new BadRequestException({
        error: {
          code: 'SLOT_OUTSIDE_SESSION',
          message: 'Exam slot date must be within the session date range',
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const slot = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.examSlot.create({
        data: {
          tenant_id: tenantId,
          exam_session_id: sessionId,
          subject_id: dto.subject_id,
          year_group_id: dto.year_group_id,
          date: new Date(dto.date),
          start_time: new Date(`1970-01-01T${dto.start_time}:00.000Z`),
          end_time: new Date(`1970-01-01T${dto.end_time}:00.000Z`),
          room_id: dto.room_id ?? null,
          duration_minutes: dto.duration_minutes,
          student_count: dto.student_count,
        },
      });
    }) as unknown as { id: string; created_at: Date };

    return {
      id: (slot as { id: string }).id,
      exam_session_id: sessionId,
      subject_id: dto.subject_id,
      year_group_id: dto.year_group_id,
      date: dto.date,
      start_time: dto.start_time,
      end_time: dto.end_time,
      created_at: (slot as { created_at: Date }).created_at.toISOString(),
    };
  }

  // ─── Generate Exam Schedule ───────────────────────────────────────────────

  async generateExamSchedule(tenantId: string, sessionId: string) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      include: {
        exam_slots: {
          include: {
            subject: { select: { name: true } },
            year_group: { select: { name: true } },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }

    // Gather available rooms
    const rooms = await this.prisma.room.findMany({
      where: { tenant_id: tenantId, active: true },
      select: { id: true, name: true, capacity: true },
    });

    // Basic placement: assign rooms to unassigned slots based on capacity
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    let assignedCount = 0;

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      for (const slot of session.exam_slots) {
        if (slot.room_id) continue; // Already assigned

        // Find a room with sufficient capacity
        const suitableRoom = rooms.find((r) =>
          r.capacity !== null && r.capacity >= slot.student_count,
        );

        if (suitableRoom) {
          await db.examSlot.update({
            where: { id: slot.id },
            data: { room_id: suitableRoom.id },
          });
          assignedCount++;
        }
      }
    });

    this.logger.log(
      `Generated exam schedule for session ${sessionId}: assigned ${assignedCount} rooms`,
    );

    return {
      session_id: sessionId,
      total_slots: session.exam_slots.length,
      slots_assigned: assignedCount,
      generated_at: new Date().toISOString(),
    };
  }

  // ─── Assign Invigilators ──────────────────────────────────────────────────

  async assignInvigilators(tenantId: string, sessionId: string) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      include: { exam_slots: true },
    });

    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }

    // Load all staff
    const allStaff = await this.prisma.staffProfile.findMany({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        user: { select: { first_name: true, last_name: true } },
      },
    });

    if (allStaff.length === 0) {
      return { session_id: sessionId, assignments_created: 0 };
    }

    // Track invigilation counts for fairness
    const invigilationCountMap = new Map<string, number>();

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    let assignmentsCreated = 0;

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      for (const slot of session.exam_slots) {
        // Check if already has assignments
        const existingCount = await db.examInvigilation.count({
          where: { exam_slot_id: slot.id, tenant_id: tenantId },
        });

        if (existingCount >= 2) continue; // Already has lead + assistant

        // Sort staff by current invigilation count (fairness)
        const sortedStaff = [...allStaff].sort((a, b) => {
          const countA = invigilationCountMap.get(a.id) ?? 0;
          const countB = invigilationCountMap.get(b.id) ?? 0;
          return countA - countB;
        });

        const candidates: InvigilatorCandidate[] = [];

        if (existingCount === 0 && sortedStaff[0]) {
          candidates.push({ staff_profile_id: sortedStaff[0].id, name: '', role: 'lead' });
          invigilationCountMap.set(
            sortedStaff[0].id,
            (invigilationCountMap.get(sortedStaff[0].id) ?? 0) + 1,
          );
        }

        if (existingCount < 2 && sortedStaff[1]) {
          candidates.push({ staff_profile_id: sortedStaff[1].id, name: '', role: 'assistant' });
          invigilationCountMap.set(
            sortedStaff[1].id,
            (invigilationCountMap.get(sortedStaff[1].id) ?? 0) + 1,
          );
        }

        for (const candidate of candidates) {
          await db.examInvigilation.create({
            data: {
              tenant_id: tenantId,
              exam_slot_id: slot.id,
              staff_profile_id: candidate.staff_profile_id,
              role: candidate.role,
            },
          });
          assignmentsCreated++;
        }
      }
    });

    return {
      session_id: sessionId,
      assignments_created: assignmentsCreated,
      generated_at: new Date().toISOString(),
    };
  }

  // ─── Publish Exam Schedule ────────────────────────────────────────────────

  async publishExamSchedule(tenantId: string, sessionId: string) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }

    if (session.status === 'published') {
      throw new BadRequestException({
        error: { code: 'ALREADY_PUBLISHED', message: 'Exam session is already published' },
      });
    }

    if (session.status === 'completed') {
      throw new BadRequestException({
        error: { code: 'SESSION_COMPLETED', message: 'Cannot publish a completed session' },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.examSession.update({
        where: { id: sessionId },
        data: { status: 'published' },
      });
    });

    return {
      id: sessionId,
      status: 'published',
      published_at: new Date().toISOString(),
    };
  }

  // ─── Format Session Helper ────────────────────────────────────────────────

  private formatSession(session: {
    id: string;
    name: string;
    start_date: Date;
    end_date: Date;
    status: string;
    academic_period_id: string;
    created_at: Date;
    updated_at: Date;
    exam_slots: Array<{
      id: string;
      subject: { name: string } | null;
      year_group: { name: string } | null;
      date: Date;
      start_time: Date;
      end_time: Date;
      room: { name: string } | null;
      duration_minutes: number;
      student_count: number;
      invigilations: Array<{
        id: string;
        role: string;
        staff_profile: { user: { first_name: string; last_name: string } };
      }>;
    }>;
  }) {
    return {
      id: session.id,
      name: session.name,
      start_date: session.start_date.toISOString().slice(0, 10),
      end_date: session.end_date.toISOString().slice(0, 10),
      status: session.status,
      academic_period_id: session.academic_period_id,
      created_at: session.created_at.toISOString(),
      updated_at: session.updated_at.toISOString(),
      exam_slots: session.exam_slots.map((slot) => ({
        id: slot.id,
        subject_name: slot.subject?.name ?? null,
        year_group_name: slot.year_group?.name ?? null,
        date: slot.date.toISOString().slice(0, 10),
        start_time: slot.start_time.toISOString().slice(11, 16),
        end_time: slot.end_time.toISOString().slice(11, 16),
        room_name: slot.room?.name ?? null,
        duration_minutes: slot.duration_minutes,
        student_count: slot.student_count,
        invigilators: slot.invigilations.map((inv) => ({
          id: inv.id,
          role: inv.role,
          name: `${inv.staff_profile.user.first_name} ${inv.staff_profile.user.last_name}`.trim(),
        })),
      })),
    };
  }
}
