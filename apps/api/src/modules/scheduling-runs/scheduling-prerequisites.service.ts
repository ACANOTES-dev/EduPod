import { Injectable } from '@nestjs/common';

import type { PrerequisiteCheck, PrerequisitesResult } from '@school/shared';

import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { SchedulingReadFacade } from '../scheduling/scheduling-read.facade';
import { StaffAvailabilityReadFacade } from '../staff-availability/staff-availability-read.facade';

@Injectable()
export class SchedulingPrerequisitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly schedulingReadFacade: SchedulingReadFacade,
    private readonly staffAvailabilityReadFacade: StaffAvailabilityReadFacade,
  ) {}

  async check(tenantId: string, academicYearId: string): Promise<PrerequisitesResult> {
    const checks: PrerequisiteCheck[] = [];

    // ── 1. Period grid exists (at least 1 teaching period on 1 day) ─────────

    const teachingPeriodCount = await this.schedulingReadFacade.countTeachingPeriods(
      tenantId,
      academicYearId,
    );

    checks.push({
      key: 'period_grid_exists',
      passed: teachingPeriodCount > 0,
      message:
        teachingPeriodCount > 0
          ? `${teachingPeriodCount} teaching periods configured`
          : 'No teaching periods configured. Configure the period grid first.',
    });

    // ── 2. All active academic classes have scheduling requirements ──────────

    const activeClassCount = await this.classesReadFacade.countByAcademicYear(
      tenantId,
      academicYearId,
      { status: 'active', subjectType: 'academic' },
    );

    const configuredCount = await this.schedulingReadFacade.countClassRequirements(
      tenantId,
      academicYearId,
      { activeAcademicOnly: true },
    );

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

    const classesWithoutTeachers = await this.classesReadFacade.findClassesWithoutTeachers(
      tenantId,
      academicYearId,
    );

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

    const pinnedRows = await this.schedulesReadFacade.findPinnedEntries(tenantId, academicYearId);
    const pinnedEntries = pinnedRows.map((e) => ({
      id: e.id,
      teacher_staff_id: e.teacher_staff_id,
      room_id: e.room_id,
      weekday: e.weekday,
      start_time: e.start_time,
      end_time: e.end_time,
    }));

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
      const availabilities = await this.staffAvailabilityReadFacade.findByStaffIds(
        tenantId,
        academicYearId,
        teacherIds,
      );

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
