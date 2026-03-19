import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface CoverTeacherResult {
  staff_profile_id: string;
  name: string;
  is_competent: boolean;
  is_primary: boolean;
  is_available: boolean;
  current_period_count: number;
  rank_score: number;
}

@Injectable()
export class CoverTeacherService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Find Cover Teacher ────────────────────────────────────────────────────

  async findCoverTeacher(
    tenantId: string,
    academicYearId: string,
    weekday: number,
    periodOrder: number,
    subjectId?: string,
    yearGroupId?: string,
  ): Promise<{ data: CoverTeacherResult[] }> {
    // 1. Find the time slot for this period
    const periodTemplate = await this.prisma.schedulePeriodTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        weekday,
        period_order: periodOrder,
      },
      select: { start_time: true, end_time: true },
    });

    if (!periodTemplate) {
      return { data: [] };
    }

    // 2. Find all teachers already scheduled at this time
    const busyTeachers = await this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        weekday,
        start_time: { lt: periodTemplate.end_time },
        end_time: { gt: periodTemplate.start_time },
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: new Date() } }],
        teacher_staff_id: { not: null },
      },
      select: { teacher_staff_id: true },
    });

    const busyTeacherIds = new Set(
      busyTeachers
        .map((s) => s.teacher_staff_id)
        .filter((id): id is string => id !== null),
    );

    // 3. Get all staff profiles (teachers)
    const allStaff = await this.prisma.staffProfile.findMany({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        user: { select: { first_name: true, last_name: true } },
      },
    });

    // 4. Get teacher competencies for this academic year (if subject/year filter provided)
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

    // 5. Get availability for this weekday
    const availabilities = await this.prisma.staffAvailability.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        weekday,
      },
      select: { staff_profile_id: true, available_from: true, available_to: true },
    });

    const availabilityMap = new Map<
      string,
      Array<{ from: Date; to: Date }>
    >();
    for (const avail of availabilities) {
      const existing = availabilityMap.get(avail.staff_profile_id) ?? [];
      existing.push({ from: avail.available_from, to: avail.available_to });
      availabilityMap.set(avail.staff_profile_id, existing);
    }

    // 6. Get current period counts for the week
    const weeklySchedules = await this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        teacher_staff_id: { not: null },
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: new Date() } }],
      },
      select: { teacher_staff_id: true },
    });

    const periodCountMap = new Map<string, number>();
    for (const s of weeklySchedules) {
      if (s.teacher_staff_id) {
        periodCountMap.set(
          s.teacher_staff_id,
          (periodCountMap.get(s.teacher_staff_id) ?? 0) + 1,
        );
      }
    }

    // 7. Score and rank available teachers
    const results: CoverTeacherResult[] = [];

    for (const staff of allStaff) {
      // Skip busy teachers
      if (busyTeacherIds.has(staff.id)) continue;

      const name = `${staff.user.first_name} ${staff.user.last_name}`.trim();
      const competency = competencyMap.get(staff.id);
      const isCompetent = subjectId ? competency !== undefined : true;
      const isPrimary = competency?.is_primary ?? false;

      // Check availability
      const dayAvail = availabilityMap.get(staff.id);
      let isAvailable = true;
      if (dayAvail && dayAvail.length > 0) {
        isAvailable = dayAvail.some(
          (a) =>
            a.from <= periodTemplate.start_time &&
            a.to >= periodTemplate.end_time,
        );
      }

      const currentPeriodCount = periodCountMap.get(staff.id) ?? 0;

      // Rank score: higher is better
      let rankScore = 0;
      if (isCompetent) rankScore += 20;
      if (isPrimary) rankScore += 10;
      if (isAvailable) rankScore += 15;
      rankScore -= currentPeriodCount; // Prefer less-loaded teachers

      results.push({
        staff_profile_id: staff.id,
        name,
        is_competent: isCompetent,
        is_primary: isPrimary,
        is_available: isAvailable,
        current_period_count: currentPeriodCount,
        rank_score: rankScore,
      });
    }

    // Sort by rank score descending
    results.sort((a, b) => b.rank_score - a.rank_score);

    return { data: results };
  }
}
