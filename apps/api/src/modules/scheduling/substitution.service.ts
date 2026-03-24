import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AbsenceQuery,
  AssignSubstituteDto,
  ReportAbsenceDto,
  SubstitutionRecordQuery,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

export interface SubstituteCandidate {
  staff_profile_id: string;
  name: string;
  is_competent: boolean;
  is_primary: boolean;
  is_available: boolean;
  cover_count: number;
  rank_score: number;
}

@Injectable()
export class SubstitutionService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Report Absence ───────────────────────────────────────────────────────

  async reportAbsence(
    tenantId: string,
    userId: string,
    dto: ReportAbsenceDto,
  ) {
    // Verify staff exists in tenant
    const staff = await this.prisma.staffProfile.findFirst({
      where: { id: dto.staff_id, tenant_id: tenantId },
      select: { id: true },
    });
    if (!staff) {
      throw new NotFoundException({
        error: { code: 'STAFF_NOT_FOUND', message: 'Staff profile not found' },
      });
    }

    // Check for duplicate
    const existing = await this.prisma.teacherAbsence.findFirst({
      where: {
        tenant_id: tenantId,
        staff_profile_id: dto.staff_id,
        absence_date: new Date(dto.date),
      },
    });
    if (existing) {
      throw new ConflictException({
        error: {
          code: 'ABSENCE_ALREADY_EXISTS',
          message: 'An absence record already exists for this staff on this date',
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const absence = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.teacherAbsence.create({
        data: {
          tenant_id: tenantId,
          staff_profile_id: dto.staff_id,
          absence_date: new Date(dto.date),
          full_day: dto.full_day ?? true,
          period_from: dto.period_from ?? null,
          period_to: dto.period_to ?? null,
          reason: dto.reason ?? null,
          reported_by_user_id: userId,
          reported_at: new Date(),
        },
      });
    }) as unknown as { id: string; absence_date: Date; created_at: Date };

    return {
      id: (absence as { id: string }).id,
      staff_id: dto.staff_id,
      date: dto.date,
      full_day: dto.full_day ?? true,
      created_at: (absence as { created_at: Date }).created_at.toISOString(),
    };
  }

  // ─── Find Eligible Substitutes ────────────────────────────────────────────

  async findEligibleSubstitutes(
    tenantId: string,
    scheduleId: string,
    date: string,
  ): Promise<{ data: SubstituteCandidate[] }> {
    // Load the schedule to understand context
    const schedule = await this.prisma.schedule.findFirst({
      where: { id: scheduleId, tenant_id: tenantId },
      include: {
        class_entity: { select: { year_group_id: true, subject_id: true, academic_year_id: true } },
      },
    });
    if (!schedule) {
      throw new NotFoundException({
        error: { code: 'SCHEDULE_NOT_FOUND', message: 'Schedule not found' },
      });
    }

    const targetDate = new Date(date);
    const weekday = targetDate.getDay();
    const subjectId = schedule.class_entity?.subject_id ?? null;
    const yearGroupId = schedule.class_entity?.year_group_id ?? null;
    const academicYearId = schedule.class_entity?.academic_year_id ?? schedule.academic_year_id;

    // Find teachers already busy at this time slot on that date
    const busyTeachers = await this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        weekday,
        start_time: { lt: schedule.end_time },
        end_time: { gt: schedule.start_time },
        teacher_staff_id: { not: null },
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: targetDate } }],
        effective_start_date: { lte: targetDate },
      },
      select: { teacher_staff_id: true },
    });

    const busyIds = new Set(
      busyTeachers
        .map((s) => s.teacher_staff_id)
        .filter((id): id is string => id !== null),
    );

    // All staff
    const allStaff = await this.prisma.staffProfile.findMany({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        user: { select: { first_name: true, last_name: true } },
      },
    });

    // Competencies
    const competencies = (subjectId || yearGroupId)
      ? await this.prisma.teacherCompetency.findMany({
          where: {
            tenant_id: tenantId,
            academic_year_id: academicYearId,
            ...(subjectId ? { subject_id: subjectId } : {}),
            ...(yearGroupId ? { year_group_id: yearGroupId } : {}),
          },
          select: { staff_profile_id: true, is_primary: true },
        })
      : [];

    const competencyMap = new Map<string, { is_primary: boolean }>();
    for (const comp of competencies) {
      const existing = competencyMap.get(comp.staff_profile_id);
      if (!existing || comp.is_primary) {
        competencyMap.set(comp.staff_profile_id, { is_primary: comp.is_primary });
      }
    }

    // Cover counts (substitution_records from last 30 days for fairness)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const coverRecords = await this.prisma.substitutionRecord.findMany({
      where: {
        tenant_id: tenantId,
        created_at: { gte: thirtyDaysAgo },
      },
      select: { substitute_staff_id: true },
    });

    const coverCountMap = new Map<string, number>();
    for (const r of coverRecords) {
      coverCountMap.set(
        r.substitute_staff_id,
        (coverCountMap.get(r.substitute_staff_id) ?? 0) + 1,
      );
    }

    const results: SubstituteCandidate[] = [];

    for (const staff of allStaff) {
      if (busyIds.has(staff.id)) continue;
      // Skip the absent teacher themselves
      if (staff.id === schedule.teacher_staff_id) continue;

      const name = `${staff.user.first_name} ${staff.user.last_name}`.trim();
      const competency = competencyMap.get(staff.id);
      const isCompetent = subjectId ? competency !== undefined : true;
      const isPrimary = competency?.is_primary ?? false;
      const coverCount = coverCountMap.get(staff.id) ?? 0;

      let rankScore = 0;
      if (isCompetent) rankScore += 20;
      if (isPrimary) rankScore += 10;
      rankScore -= coverCount * 2; // Penalise frequent cover teachers for fairness

      results.push({
        staff_profile_id: staff.id,
        name,
        is_competent: isCompetent,
        is_primary: isPrimary,
        is_available: true, // Availability already filtered by busy check
        cover_count: coverCount,
        rank_score: rankScore,
      });
    }

    results.sort((a, b) => b.rank_score - a.rank_score);

    return { data: results };
  }

  // ─── Assign Substitute ────────────────────────────────────────────────────

  async assignSubstitute(
    tenantId: string,
    userId: string,
    dto: AssignSubstituteDto,
  ) {
    // Verify absence exists
    const absence = await this.prisma.teacherAbsence.findFirst({
      where: { id: dto.absence_id, tenant_id: tenantId },
      select: { id: true },
    });
    if (!absence) {
      throw new NotFoundException({
        error: { code: 'ABSENCE_NOT_FOUND', message: 'Absence record not found' },
      });
    }

    // Verify schedule exists
    const schedule = await this.prisma.schedule.findFirst({
      where: { id: dto.schedule_id, tenant_id: tenantId },
      select: { id: true },
    });
    if (!schedule) {
      throw new NotFoundException({
        error: { code: 'SCHEDULE_NOT_FOUND', message: 'Schedule not found' },
      });
    }

    // Verify substitute staff exists
    const substitute = await this.prisma.staffProfile.findFirst({
      where: { id: dto.substitute_staff_id, tenant_id: tenantId },
      select: { id: true },
    });
    if (!substitute) {
      throw new NotFoundException({
        error: { code: 'SUBSTITUTE_NOT_FOUND', message: 'Substitute staff not found' },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const record = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.substitutionRecord.create({
        data: {
          tenant_id: tenantId,
          absence_id: dto.absence_id,
          schedule_id: dto.schedule_id,
          substitute_staff_id: dto.substitute_staff_id,
          status: 'assigned',
          assigned_by_user_id: userId,
          assigned_at: new Date(),
          notes: dto.notes ?? null,
        },
      });
    }) as unknown as { id: string; status: string; created_at: Date };

    return {
      id: (record as { id: string }).id,
      absence_id: dto.absence_id,
      schedule_id: dto.schedule_id,
      substitute_staff_id: dto.substitute_staff_id,
      status: (record as { status: string }).status,
      created_at: (record as { created_at: Date }).created_at.toISOString(),
    };
  }

  // ─── Get Absences ─────────────────────────────────────────────────────────

  async getAbsences(tenantId: string, query: AbsenceQuery) {
    const skip = (query.page - 1) * query.pageSize;

    const where: {
      tenant_id: string;
      staff_profile_id?: string;
      absence_date?: { gte?: Date; lte?: Date };
    } = { tenant_id: tenantId };

    if (query.staff_id) {
      where.staff_profile_id = query.staff_id;
    }
    if (query.date_from || query.date_to) {
      where.absence_date = {};
      if (query.date_from) where.absence_date.gte = new Date(query.date_from);
      if (query.date_to) where.absence_date.lte = new Date(query.date_to);
    }

    const [data, total] = await Promise.all([
      this.prisma.teacherAbsence.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { absence_date: 'desc' },
        include: {
          staff_profile: {
            select: { user: { select: { first_name: true, last_name: true } } },
          },
          substitution_records: {
            select: {
              id: true,
              status: true,
              substitute_staff_id: true,
              substitute: { select: { user: { select: { first_name: true, last_name: true } } } },
            },
          },
        },
      }),
      this.prisma.teacherAbsence.count({ where }),
    ]);

    return {
      data: data.map((a) => ({
        id: a.id,
        staff_profile_id: a.staff_profile_id,
        staff_name: `${a.staff_profile.user.first_name} ${a.staff_profile.user.last_name}`.trim(),
        absence_date: a.absence_date.toISOString().slice(0, 10),
        full_day: a.full_day,
        period_from: a.period_from,
        period_to: a.period_to,
        reason: a.reason,
        reported_at: a.reported_at.toISOString(),
        substitution_count: a.substitution_records.length,
        substitutions: a.substitution_records.map((sr) => ({
          id: sr.id,
          status: sr.status,
          substitute_staff_id: sr.substitute_staff_id,
          substitute_name: `${sr.substitute.user.first_name} ${sr.substitute.user.last_name}`.trim(),
        })),
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Get Substitution Records ─────────────────────────────────────────────

  async getSubstitutionRecords(tenantId: string, query: SubstitutionRecordQuery) {
    const skip = (query.page - 1) * query.pageSize;

    const where: {
      tenant_id: string;
      substitute_staff_id?: string;
      status?: 'assigned' | 'confirmed' | 'declined' | 'completed';
      created_at?: { gte?: Date; lte?: Date };
    } = { tenant_id: tenantId };

    if (query.staff_id) {
      where.substitute_staff_id = query.staff_id;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.date_from || query.date_to) {
      where.created_at = {};
      if (query.date_from) where.created_at.gte = new Date(query.date_from);
      if (query.date_to) where.created_at.lte = new Date(query.date_to);
    }

    const [data, total] = await Promise.all([
      this.prisma.substitutionRecord.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { assigned_at: 'desc' },
        include: {
          absence: {
            select: {
              absence_date: true,
              staff_profile: {
                select: { user: { select: { first_name: true, last_name: true } } },
              },
            },
          },
          substitute: {
            select: { user: { select: { first_name: true, last_name: true } } },
          },
        },
      }),
      this.prisma.substitutionRecord.count({ where }),
    ]);

    return {
      data: data.map((r) => ({
        id: r.id,
        absence_id: r.absence_id,
        schedule_id: r.schedule_id,
        substitute_staff_id: r.substitute_staff_id,
        substitute_name: `${r.substitute.user.first_name} ${r.substitute.user.last_name}`.trim(),
        absent_staff_name: `${r.absence.staff_profile.user.first_name} ${r.absence.staff_profile.user.last_name}`.trim(),
        absence_date: r.absence.absence_date.toISOString().slice(0, 10),
        status: r.status,
        assigned_at: r.assigned_at.toISOString(),
        confirmed_at: r.confirmed_at?.toISOString() ?? null,
        notes: r.notes,
      })),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  // ─── Get Today Board ──────────────────────────────────────────────────────

  async getTodayBoard(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const absences = await this.prisma.teacherAbsence.findMany({
      where: {
        tenant_id: tenantId,
        absence_date: { gte: today, lte: endOfWeek },
      },
      orderBy: { absence_date: 'asc' },
      include: {
        staff_profile: {
          select: { user: { select: { first_name: true, last_name: true } } },
        },
        substitution_records: {
          include: {
            substitute: {
              select: { user: { select: { first_name: true, last_name: true } } },
            },
            schedule: {
              select: {
                weekday: true,
                period_order: true,
                start_time: true,
                end_time: true,
                room: { select: { name: true } },
                class_entity: { select: { name: true, subject: { select: { name: true } } } },
              },
            },
          },
        },
      },
    });

    const todayStr = today.toISOString().slice(0, 10);

    const todayAbsences = absences.filter(
      (a) => a.absence_date.toISOString().slice(0, 10) === todayStr,
    );
    const upcomingAbsences = absences.filter(
      (a) => a.absence_date.toISOString().slice(0, 10) !== todayStr,
    );

    const formatAbsence = (a: typeof absences[0]) => ({
      id: a.id,
      staff_name: `${a.staff_profile.user.first_name} ${a.staff_profile.user.last_name}`.trim(),
      absence_date: a.absence_date.toISOString().slice(0, 10),
      full_day: a.full_day,
      reason: a.reason,
      substitutions: a.substitution_records.map((sr) => ({
        id: sr.id,
        substitute_name: `${sr.substitute.user.first_name} ${sr.substitute.user.last_name}`.trim(),
        status: sr.status,
        period_order: sr.schedule.period_order,
        start_time: sr.schedule.start_time.toISOString().slice(11, 16),
        end_time: sr.schedule.end_time.toISOString().slice(11, 16),
        room_name: sr.schedule.room?.name ?? null,
        class_name: sr.schedule.class_entity?.name ?? null,
        subject_name: sr.schedule.class_entity?.subject?.name ?? null,
      })),
    });

    return {
      today: todayAbsences.map(formatAbsence),
      upcoming: upcomingAbsences.map(formatAbsence),
      generated_at: new Date().toISOString(),
    };
  }

  // ─── Validate Absence Update ──────────────────────────────────────────────

  async validateAbsenceExists(tenantId: string, absenceId: string) {
    const absence = await this.prisma.teacherAbsence.findFirst({
      where: { id: absenceId, tenant_id: tenantId },
      select: { id: true },
    });
    if (!absence) {
      throw new NotFoundException({
        error: { code: 'ABSENCE_NOT_FOUND', message: 'Absence not found' },
      });
    }
  }

  // ─── Delete Absence ───────────────────────────────────────────────────────

  async deleteAbsence(tenantId: string, absenceId: string) {
    await this.validateAbsenceExists(tenantId, absenceId);

    const hasRecords = await this.prisma.substitutionRecord.findFirst({
      where: { absence_id: absenceId, tenant_id: tenantId },
      select: { id: true },
    });
    if (hasRecords) {
      throw new BadRequestException({
        error: {
          code: 'ABSENCE_HAS_SUBSTITUTIONS',
          message: 'Cannot delete absence with assigned substitutions',
        },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.teacherAbsence.delete({ where: { id: absenceId } });
    });

    return { deleted: true };
  }
}
