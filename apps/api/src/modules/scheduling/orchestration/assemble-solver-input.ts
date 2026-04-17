/**
 * Top-level solver input assembly — composes the decomposed builders into
 * a complete ``SolverInputV3``.
 *
 * Stage 11 rebuild: replaces the ~420-line ``assembleSolverInput`` method
 * in the old ``scheduler-orchestration.service.ts``.
 */
import type {
  ClassV3,
  RoomClosureV3,
  RoomV3,
  SolverInputV3,
  StudentOverlapV3,
  SubjectV3,
} from '@school/shared/scheduler';

import { buildConstraintSnapshot } from './assemble/build-constraint-snapshot';
import { buildDemand } from './assemble/build-demand';
import { buildPeriodSlots } from './assemble/build-period-slots';
import { buildPinned } from './assemble/build-pinned';
import { buildPreferences } from './assemble/build-preferences';
import type { AssemblyFacades } from './assemble/load-tenant-data';
import { loadTenantData } from './assemble/load-tenant-data';

export async function assembleSolverInput(
  facades: AssemblyFacades,
  tenantId: string,
  academicYearId: string,
): Promise<SolverInputV3> {
  const data = await loadTenantData(facades, tenantId, academicYearId);

  // ─── Period slots ─────────────────────────────────────────────────────

  const periodSlots = buildPeriodSlots(data.yearGroups, data.periodTemplates);

  // ─── Flat classes and subjects ────────────────────────────────────────

  const classes: ClassV3[] = [];
  const subjectSet = new Map<string, string>(); // id → name

  for (const yg of data.yearGroups) {
    for (const cls of yg.classes) {
      classes.push({
        class_id: cls.id,
        class_name: cls.name,
        year_group_id: yg.id,
        year_group_name: yg.name,
        student_count: cls.enrolmentCount,
      });
    }
  }

  for (const cr of data.curriculum) {
    subjectSet.set(cr.subject_id, cr.subject_name);
  }
  for (const ovr of data.classSubjectOverrides) {
    subjectSet.set(ovr.subject_id, ovr.subject_name);
  }

  const subjects: SubjectV3[] = [...subjectSet.entries()].map(([id, name]) => ({
    subject_id: id,
    subject_name: name,
  }));

  // ─── Demand + overrides audit ─────────────────────────────────────────

  const { demand, overridesApplied } = buildDemand(
    data.yearGroups,
    data.curriculum,
    data.classSubjectOverrides,
    data.classSubjectAssignments,
    data.strictClassSubjectOverride,
  );

  // ─── Preferences ──────────────────────────────────────────────────────

  const preferences = buildPreferences(
    data.yearGroups,
    data.curriculum,
    data.teachers,
    data.classRoomOverrides,
    data.tenantSettings,
  );

  // ─── Teachers (V3 shape — preferences extracted above) ────────────────

  const teachersV3 = data.teachers.map((t) => ({
    staff_profile_id: t.staff_profile_id,
    name: t.name,
    competencies: t.competencies.map((c) => ({
      subject_id: c.subject_id,
      year_group_id: c.year_group_id,
      class_id: c.class_id,
    })),
    availability: t.availability.map((a) => ({
      weekday: a.weekday,
      from: a.from,
      to: a.to,
    })),
    max_periods_per_week: t.max_periods_per_week,
    max_periods_per_day: t.max_periods_per_day,
    max_supervision_duties_per_week: t.max_supervision_duties_per_week,
  }));

  // ─── Rooms + closures ─────────────────────────────────────────────────

  const rooms: RoomV3[] = data.rooms.map((r) => ({
    room_id: r.room_id,
    room_type: r.room_type,
    capacity: r.capacity,
    is_exclusive: r.is_exclusive,
  }));

  const roomClosures: RoomClosureV3[] = data.roomClosures.map((rc) => ({
    room_id: rc.room_id,
    date_from: rc.date_from,
    date_to: rc.date_to,
  }));

  // ─── Break groups ─────────────────────────────────────────────────────

  const breakGroups = data.breakGroups.map((bg) => ({
    break_group_id: bg.break_group_id,
    name: bg.name,
    year_group_ids: bg.year_group_ids,
    required_supervisor_count: bg.required_supervisor_count,
  }));

  // ─── Pinned entries ───────────────────────────────────────────────────

  const pinned = buildPinned(data.pinnedSchedules, periodSlots);

  // ─── Student overlaps ─────────────────────────────────────────────────

  const studentToClasses = new Map<string, Set<string>>();
  for (const e of data.studentOverlapPairs) {
    if (!studentToClasses.has(e.student_id)) {
      studentToClasses.set(e.student_id, new Set());
    }
    studentToClasses.get(e.student_id)!.add(e.class_id);
  }

  const overlapSet = new Set<string>();
  const studentOverlaps: StudentOverlapV3[] = [];
  for (const classSet of studentToClasses.values()) {
    const arr = [...classSet];
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const key = [arr[i], arr[j]].sort().join(':');
        if (!overlapSet.has(key)) {
          overlapSet.add(key);
          studentOverlaps.push({ class_id_a: arr[i]!, class_id_b: arr[j]! });
        }
      }
    }
  }

  // ─── Settings ─────────────────────────────────────────────────────────

  const maxDuration = (data.tenantSettings?.maxSolverDurationSeconds as number | undefined) ?? 3600;

  // ─── Constraint snapshot ──────────────────────────────────────────────

  const constraintSnapshot = buildConstraintSnapshot(
    overridesApplied,
    data.pinnedSchedules,
    data.classRoomOverrides,
  );

  return {
    period_slots: periodSlots,
    classes,
    subjects,
    teachers: teachersV3,
    rooms,
    room_closures: roomClosures,
    break_groups: breakGroups,
    demand,
    preferences,
    pinned,
    student_overlaps: studentOverlaps,
    settings: {
      max_solver_duration_seconds: maxDuration,
      solver_seed: null,
    },
    constraint_snapshot: constraintSnapshot,
  };
}
