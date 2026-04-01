import { Injectable } from '@nestjs/common';

import type { PrerequisiteCheck, PrerequisitesResult } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SchedulingPrerequisitesService {
  constructor(private readonly prisma: PrismaService) {}

  async check(tenantId: string, academicYearId: string): Promise<PrerequisitesResult> {
    const checks: PrerequisiteCheck[] = [];

    // ── 1. Period grid exists (at least 1 teaching period on 1 day) ─────────

    const teachingPeriodCount = await this.prisma.schedulePeriodTemplate.count({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        schedule_period_type: 'teaching',
      },
    });

    checks.push({
      key: 'period_grid_exists',
      passed: teachingPeriodCount > 0,
      message:
        teachingPeriodCount > 0
          ? `${teachingPeriodCount} teaching periods configured`
          : 'No teaching periods configured. Configure the period grid first.',
    });

    // ── 2. All active academic classes have scheduling requirements ──────────

    const activeClassCount = await this.prisma.class.count({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        status: 'active',
        subject: { subject_type: 'academic' },
      },
    });

    const configuredCount = await this.prisma.classSchedulingRequirement.count({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        class_entity: { status: 'active', subject: { subject_type: 'academic' } },
      },
    });

    const unconfiguredClasses = activeClassCount - configuredCount;

    checks.push({
      key: 'all_classes_configured',
      passed: unconfiguredClasses === 0 && activeClassCount > 0,
      message:
        unconfiguredClasses === 0
          ? `All ${activeClassCount} classes have scheduling requirements`
          : `${unconfiguredClasses} of ${activeClassCount} academic classes are missing scheduling requirements`,
      details: unconfiguredClasses > 0 ? { unconfigured: unconfiguredClasses } : undefined,
    });

    // ── 3. All academic classes have at least one teacher ───────────────────

    const classesWithoutTeachers = await this.prisma.class.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        status: 'active',
        subject: { subject_type: 'academic' },
        class_staff: {
          none: { assignment_role: { in: ['teacher', 'homeroom'] } },
        },
      },
      select: { id: true, name: true },
    });

    checks.push({
      key: 'all_classes_have_teachers',
      passed: classesWithoutTeachers.length === 0,
      message:
        classesWithoutTeachers.length === 0
          ? 'All classes have assigned teachers'
          : `${classesWithoutTeachers.length} classes have no teacher assigned`,
      details:
        classesWithoutTeachers.length > 0
          ? { classes: classesWithoutTeachers.map((c) => c.name) }
          : undefined,
    });

    // ── 4. No pinned entry conflicts (teacher/room double-booking) ───────────

    const pinnedEntries = await this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        is_pinned: true,
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: new Date() } }],
      },
      select: {
        id: true,
        teacher_staff_id: true,
        room_id: true,
        weekday: true,
        start_time: true,
        end_time: true,
      },
    });

    let pinnedConflicts = false;
    const conflictDetails: Array<{ entry_a: string; entry_b: string; reason: string }> = [];

    for (let i = 0; i < pinnedEntries.length; i++) {
      for (let j = i + 1; j < pinnedEntries.length; j++) {
        const a = pinnedEntries[i]!;
        const b = pinnedEntries[j]!;

        if (a.weekday !== b.weekday) continue;
        // Check time overlap: NOT (a ends before b starts OR b ends before a starts)
        if (a.start_time >= b.end_time || a.end_time <= b.start_time) continue;

        if (a.teacher_staff_id && a.teacher_staff_id === b.teacher_staff_id) {
          pinnedConflicts = true;
          conflictDetails.push({ entry_a: a.id, entry_b: b.id, reason: 'Teacher double-booked' });
        }
        if (a.room_id && a.room_id === b.room_id) {
          pinnedConflicts = true;
          conflictDetails.push({ entry_a: a.id, entry_b: b.id, reason: 'Room double-booked' });
        }
      }
    }

    checks.push({
      key: 'no_pinned_conflicts',
      passed: !pinnedConflicts,
      message: pinnedConflicts
        ? `${conflictDetails.length} pinned entry conflict(s) found`
        : 'No pinned entry conflicts',
      details: pinnedConflicts ? { conflicts: conflictDetails } : undefined,
    });

    // ── 5. No pinned entries violating teacher availability ──────────────────

    let availabilityViolations = false;
    const violationDetails: Array<{ entry_id: string; teacher: string }> = [];

    const teacherIds = [
      ...new Set(
        pinnedEntries
          .filter((e) => e.teacher_staff_id !== null)
          .map((e) => e.teacher_staff_id as string),
      ),
    ];

    if (teacherIds.length > 0) {
      const availabilities = await this.prisma.staffAvailability.findMany({
        where: {
          tenant_id: tenantId,
          academic_year_id: academicYearId,
          staff_profile_id: { in: teacherIds },
        },
      });

      // Build map: staffProfileId -> availability rows
      const availMap = new Map<
        string,
        Array<{
          staff_profile_id: string;
          weekday: number;
          available_from: Date;
          available_to: Date;
        }>
      >();

      for (const avail of availabilities) {
        const existing = availMap.get(avail.staff_profile_id) ?? [];
        existing.push(avail);
        availMap.set(avail.staff_profile_id, existing);
      }

      for (const entry of pinnedEntries) {
        if (!entry.teacher_staff_id) continue;

        const teacherAvail = availMap.get(entry.teacher_staff_id);
        // No availability rows means fully available — no violation
        if (!teacherAvail || teacherAvail.length === 0) continue;

        const dayAvail = teacherAvail.find((a) => a.weekday === entry.weekday);
        if (!dayAvail) {
          // Teacher has availability constraints but none defined for this day — violation
          availabilityViolations = true;
          violationDetails.push({ entry_id: entry.id, teacher: entry.teacher_staff_id });
          continue;
        }

        // Check the pinned slot is within the availability window
        if (dayAvail.available_from > entry.start_time || dayAvail.available_to < entry.end_time) {
          availabilityViolations = true;
          violationDetails.push({ entry_id: entry.id, teacher: entry.teacher_staff_id });
        }
      }
    }

    checks.push({
      key: 'no_pinned_availability_violations',
      passed: !availabilityViolations,
      message: availabilityViolations
        ? `${violationDetails.length} pinned entries violate teacher availability`
        : 'All pinned entries within teacher availability',
      details: availabilityViolations ? { violations: violationDetails } : undefined,
    });

    return {
      ready: checks.every((c) => c.passed),
      checks,
    };
  }
}
