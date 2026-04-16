/**
 * Pre-solve feasibility sweep.
 *
 * Runs 10 deterministic checks on a SolverInputV3 to catch structural
 * infeasibility in < 50 ms — before the solver burns its full budget.
 *
 * Stage 12, §A.
 */
import { Injectable, Logger } from '@nestjs/common';

import type {
  ClassV3,
  DemandV3,
  PeriodSlotV3,
  PinnedAssignmentV3,
  RoomV3,
  SolverInputV3,
  SubjectV3,
  TeacherV3,
} from '@school/shared/scheduler';

import type {
  FeasibilityBlocker,
  FeasibilityCheck,
  FeasibilityReport,
} from '../diagnostics-i18n/diagnostic-types';

// ─── Internal helpers ───────────────────────────────────────────────────────

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Count teaching slots available per year group. */
function teachingSlotCount(slots: PeriodSlotV3[], yearGroupId: string): number {
  return slots.filter((s) => s.year_group_id === yearGroupId && s.period_type === 'teaching')
    .length;
}

/** Duration in minutes of a single teaching period from the template. */
function periodDurationMinutes(slots: PeriodSlotV3[]): number {
  const teaching = slots.find((s) => s.period_type === 'teaching');
  if (!teaching) return 50;
  return timeToMinutes(teaching.end_time) - timeToMinutes(teaching.start_time);
}

/** Count teacher's available teaching periods per week. */
function teacherAvailablePeriods(teacher: TeacherV3, periodDuration: number): number {
  return teacher.availability.reduce((sum, a) => {
    const minutes = timeToMinutes(a.to) - timeToMinutes(a.from);
    return sum + Math.max(0, Math.floor(minutes / periodDuration));
  }, 0);
}

/** Build slot lookup: period_index → (weekday, period_order, year_group_id). */
function buildSlotLookup(
  slots: PeriodSlotV3[],
): Map<number, { weekday: number; period_order: number; year_group_id: string }> {
  const map = new Map<number, { weekday: number; period_order: number; year_group_id: string }>();
  for (const s of slots) {
    map.set(s.index, {
      weekday: s.weekday,
      period_order: s.period_order,
      year_group_id: s.year_group_id,
    });
  }
  return map;
}

// ─── Main service ───────────────────────────────────────────────────────────

@Injectable()
export class FeasibilityService {
  private readonly logger = new Logger(FeasibilityService.name);

  async runFeasibilitySweep(tenantId: string, input: SolverInputV3): Promise<FeasibilityReport> {
    const start = performance.now();
    const checks: FeasibilityCheck[] = [];
    const blockers: FeasibilityBlocker[] = [];

    const periodDuration = periodDurationMinutes(input.period_slots);
    const totalDemandPeriods = input.demand.reduce((s, d) => s + d.periods_per_week, 0);

    // Name lookups
    const classById = new Map<string, ClassV3>();
    for (const c of input.classes) classById.set(c.class_id, c);
    const subjectById = new Map<string, SubjectV3>();
    for (const s of input.subjects) subjectById.set(s.subject_id, s);
    const teacherById = new Map<string, TeacherV3>();
    for (const t of input.teachers) teacherById.set(t.staff_profile_id, t);
    const roomById = new Map<string, RoomV3>();
    for (const r of input.rooms) roomById.set(r.room_id, r);

    // ── Check 1: Global capacity ──────────────────────────────────────────
    const totalQualified = this.computeGlobalCapacity(input.teachers, input.demand, periodDuration);
    const globalSlack = totalQualified - totalDemandPeriods;

    if (globalSlack < 0) {
      checks.push({ code: 'global_capacity_shortfall', passed: false });
      blockers.push({
        id: 'feasibility-global-capacity',
        check: 'global_capacity_shortfall',
        severity: 'critical',
        headline: `Not enough total teaching capacity — ${Math.abs(globalSlack)} period(s) short`,
        detail:
          `Your school needs ${totalDemandPeriods} teaching periods per week, ` +
          `but qualified teachers can only cover ${totalQualified}. ` +
          `${Math.abs(globalSlack)} period(s) cannot be scheduled.`,
        affected: {},
        quantified_impact: {
          blocked_periods: Math.abs(globalSlack),
          blocked_percentage:
            totalDemandPeriods > 0
              ? Math.round((Math.abs(globalSlack) / totalDemandPeriods) * 100)
              : 0,
        },
        solutions: [],
      });
    } else {
      checks.push({ code: 'global_capacity_shortfall', passed: true });
    }

    // ── Check 2: Per-subject capacity ────────────────────────────────────
    this.checkPerSubjectCapacity(
      input,
      periodDuration,
      checks,
      blockers,
      subjectById,
      totalDemandPeriods,
    );

    // ── Check 3: Per-(class, subject) reachability ───────────────────────
    this.checkReachability(
      input,
      periodDuration,
      checks,
      blockers,
      classById,
      subjectById,
      totalDemandPeriods,
    );

    // ── Check 4: Weekly period budget ────────────────────────────────────
    this.checkWeeklyBudget(input, checks, blockers, classById, totalDemandPeriods);

    // ── Checks 5-7: Pin conflicts ────────────────────────────────────────
    this.checkPinConflicts(
      input,
      checks,
      blockers,
      classById,
      subjectById,
      teacherById,
      roomById,
      totalDemandPeriods,
    );

    // ── Check 8: Room-type coverage ──────────────────────────────────────
    this.checkRoomTypeCoverage(input, checks, blockers, subjectById, totalDemandPeriods);

    // ── Check 9: Double-period feasibility ───────────────────────────────
    this.checkDoublePeriods(
      input,
      periodDuration,
      checks,
      blockers,
      classById,
      subjectById,
      totalDemandPeriods,
    );

    // ── Check 10: Availability ∩ per-day cap ─────────────────────────────
    this.checkPerDayCap(input, periodDuration, checks, blockers, teacherById, totalDemandPeriods);

    // ── Verdict ──────────────────────────────────────────────────────────
    const hasCritical = blockers.some((b) => b.severity === 'critical');
    const hasHigh = blockers.some((b) => b.severity === 'high');
    const verdict = hasCritical ? 'infeasible' : hasHigh ? 'tight' : 'feasible';

    const elapsed = performance.now() - start;
    this.logger.log(
      `Feasibility sweep for tenant ${tenantId}: verdict=${verdict}, ` +
        `checks=${checks.length}, blockers=${blockers.length}, elapsed=${elapsed.toFixed(1)}ms`,
    );

    return {
      verdict,
      checks,
      ceiling: {
        total_demand_periods: totalDemandPeriods,
        total_qualified_teacher_periods: totalQualified,
        slack_periods: globalSlack,
      },
      diagnosed_blockers: blockers,
    };
  }

  // ─── Check implementations ──────────────────────────────────────────────

  private computeGlobalCapacity(
    teachers: TeacherV3[],
    demand: DemandV3[],
    periodDuration: number,
  ): number {
    // For each subject, sum available periods of qualified teachers.
    // But teachers qualified for multiple subjects share capacity — use a
    // simple upper bound: sum of min(teacherAvailPeriods, cap) per teacher.
    let total = 0;
    for (const teacher of teachers) {
      const available = teacherAvailablePeriods(teacher, periodDuration);
      const cap = teacher.max_periods_per_week ?? 999;
      total += Math.min(available, cap);
    }
    return total;
  }

  private checkPerSubjectCapacity(
    input: SolverInputV3,
    periodDuration: number,
    checks: FeasibilityCheck[],
    blockers: FeasibilityBlocker[],
    subjectById: Map<string, SubjectV3>,
    totalDemandPeriods: number,
  ): void {
    // Group demand by subject
    const demandBySubject = new Map<string, number>();
    for (const d of input.demand) {
      demandBySubject.set(
        d.subject_id,
        (demandBySubject.get(d.subject_id) ?? 0) + d.periods_per_week,
      );
    }

    let passed = true;
    for (const [subjectId, demand] of demandBySubject) {
      const qualified = input.teachers.filter((t) =>
        t.competencies.some((c) => c.subject_id === subjectId),
      );
      const supply = qualified.reduce((s, t) => {
        const avail = teacherAvailablePeriods(t, periodDuration);
        const cap = t.max_periods_per_week ?? 999;
        return s + Math.min(avail, cap);
      }, 0);

      if (supply < demand) {
        passed = false;
        const shortfall = demand - supply;
        const subject = subjectById.get(subjectId);
        blockers.push({
          id: `feasibility-subject-${subjectId}`,
          check: 'subject_capacity_shortfall',
          severity: 'critical',
          headline: `Not enough ${subject?.subject_name ?? subjectId} teachers — ${shortfall} period(s) short`,
          detail:
            `${subject?.subject_name ?? 'Subject'} needs ${demand} teaching periods, ` +
            `but qualified teachers can only cover ${supply}.`,
          affected: {
            subjects: subject ? [{ id: subjectId, name: subject.subject_name }] : [],
            teachers: qualified.map((t) => ({ id: t.staff_profile_id, name: t.name })),
          },
          quantified_impact: {
            blocked_periods: shortfall,
            blocked_percentage:
              totalDemandPeriods > 0 ? Math.round((shortfall / totalDemandPeriods) * 100) : 0,
          },
          solutions: [],
        });
      }
    }
    checks.push({ code: 'subject_capacity_shortfall', passed });
  }

  private checkReachability(
    input: SolverInputV3,
    periodDuration: number,
    checks: FeasibilityCheck[],
    blockers: FeasibilityBlocker[],
    classById: Map<string, ClassV3>,
    subjectById: Map<string, SubjectV3>,
    totalDemandPeriods: number,
  ): void {
    let passed = true;

    // Get the year_group for each class
    const classYearGroup = new Map<string, string>();
    for (const c of input.classes) classYearGroup.set(c.class_id, c.year_group_id);

    // Available teaching slots per year_group per weekday
    const slotsByYgDay = new Map<string, Set<number>>();
    for (const slot of input.period_slots) {
      if (slot.period_type !== 'teaching') continue;
      const key = `${slot.year_group_id}|${slot.weekday}`;
      const set = slotsByYgDay.get(key) ?? new Set();
      set.add(slot.period_order);
      slotsByYgDay.set(key, set);
    }

    for (const d of input.demand) {
      const ygId = classYearGroup.get(d.class_id);
      if (!ygId) continue;

      // Find qualified teachers for this (class, subject)
      const qualified = input.teachers.filter((t) =>
        t.competencies.some(
          (c) =>
            c.subject_id === d.subject_id &&
            c.year_group_id === ygId &&
            (c.class_id === null || c.class_id === d.class_id),
        ),
      );

      // Check if at least one teacher has availability overlapping with this
      // year group's teaching slots on at least 1 day.
      const hasReachableTeacher = qualified.some((teacher) => {
        for (const avail of teacher.availability) {
          const key = `${ygId}|${avail.weekday}`;
          const ygSlots = slotsByYgDay.get(key);
          if (ygSlots && ygSlots.size > 0) return true;
        }
        return false;
      });

      if (!hasReachableTeacher) {
        passed = false;
        const cls = classById.get(d.class_id);
        const subject = subjectById.get(d.subject_id);
        blockers.push({
          id: `feasibility-unreachable-${d.class_id}-${d.subject_id}`,
          check: 'unreachable_class_subject',
          severity: 'critical',
          headline: `No teacher can teach ${subject?.subject_name ?? d.subject_id} to ${cls?.class_name ?? d.class_id}`,
          detail:
            `${cls?.class_name ?? 'This class'} needs ${subject?.subject_name ?? 'this subject'}, ` +
            `but no qualified teacher has availability overlapping with the class's schedule.`,
          affected: {
            classes: cls ? [{ id: d.class_id, label: cls.class_name }] : [],
            subjects: subject ? [{ id: d.subject_id, name: subject.subject_name }] : [],
          },
          quantified_impact: {
            blocked_periods: d.periods_per_week,
            blocked_percentage:
              totalDemandPeriods > 0
                ? Math.round((d.periods_per_week / totalDemandPeriods) * 100)
                : 0,
          },
          solutions: [],
        });
      }
    }
    checks.push({ code: 'unreachable_class_subject', passed });
  }

  private checkWeeklyBudget(
    input: SolverInputV3,
    checks: FeasibilityCheck[],
    blockers: FeasibilityBlocker[],
    classById: Map<string, ClassV3>,
    totalDemandPeriods: number,
  ): void {
    let passed = true;

    // Class → year_group
    const classYearGroup = new Map<string, string>();
    for (const c of input.classes) classYearGroup.set(c.class_id, c.year_group_id);

    // Pinned slots per class
    const pinnedPerClass = new Map<string, number>();
    for (const p of input.pinned) {
      pinnedPerClass.set(p.class_id, (pinnedPerClass.get(p.class_id) ?? 0) + 1);
    }

    // Demand per class
    const demandPerClass = new Map<string, number>();
    for (const d of input.demand) {
      demandPerClass.set(d.class_id, (demandPerClass.get(d.class_id) ?? 0) + d.periods_per_week);
    }

    for (const [classId, demand] of demandPerClass) {
      const ygId = classYearGroup.get(classId);
      if (!ygId) continue;
      const totalSlots = teachingSlotCount(input.period_slots, ygId);
      const pinned = pinnedPerClass.get(classId) ?? 0;
      const available = totalSlots - pinned;

      if (demand > available) {
        passed = false;
        const cls = classById.get(classId);
        const overflow = demand - available;
        blockers.push({
          id: `feasibility-overbook-${classId}`,
          check: 'class_weekly_overbook',
          severity: 'critical',
          headline: `${cls?.class_name ?? classId} has more required periods than available slots`,
          detail:
            `Mandatory subjects demand ${demand} periods, but only ${available} slots are free ` +
            `(${totalSlots} total − ${pinned} pinned). ${overflow} period(s) cannot fit.`,
          affected: {
            classes: cls ? [{ id: classId, label: cls.class_name }] : [],
          },
          quantified_impact: {
            blocked_periods: overflow,
            blocked_percentage:
              totalDemandPeriods > 0 ? Math.round((overflow / totalDemandPeriods) * 100) : 0,
          },
          solutions: [],
        });
      }
    }
    checks.push({ code: 'class_weekly_overbook', passed });
  }

  private checkPinConflicts(
    input: SolverInputV3,
    checks: FeasibilityCheck[],
    blockers: FeasibilityBlocker[],
    classById: Map<string, ClassV3>,
    _subjectById: Map<string, SubjectV3>,
    teacherById: Map<string, TeacherV3>,
    roomById: Map<string, RoomV3>,
    totalDemandPeriods: number,
  ): void {
    const slotLookup = buildSlotLookup(input.period_slots);

    // Teacher conflicts
    const teacherSlots = new Map<string, PinnedAssignmentV3[]>();
    // Class conflicts
    const classSlots = new Map<string, PinnedAssignmentV3[]>();
    // Room conflicts
    const roomSlots = new Map<string, PinnedAssignmentV3[]>();

    for (const pin of input.pinned) {
      if (pin.teacher_staff_id) {
        const key = `${pin.teacher_staff_id}|${pin.period_index}`;
        const list = teacherSlots.get(key) ?? [];
        list.push(pin);
        teacherSlots.set(key, list);
      }

      {
        const key = `${pin.class_id}|${pin.period_index}`;
        const list = classSlots.get(key) ?? [];
        list.push(pin);
        classSlots.set(key, list);
      }

      if (pin.room_id) {
        const key = `${pin.room_id}|${pin.period_index}`;
        const list = roomSlots.get(key) ?? [];
        list.push(pin);
        roomSlots.set(key, list);
      }
    }

    // Check 5: Teacher pin conflicts
    let teacherPassed = true;
    for (const [key, pins] of teacherSlots) {
      if (pins.length <= 1) continue;
      teacherPassed = false;
      const [teacherId] = key.split('|');
      const teacher = teacherById.get(teacherId ?? '');
      const slot = slotLookup.get(pins[0]?.period_index ?? 0);
      blockers.push({
        id: `feasibility-pin-teacher-${key}`,
        check: 'pin_conflict_teacher',
        severity: 'critical',
        headline: `${teacher?.name ?? 'A teacher'} is pinned to ${pins.length} classes at the same time`,
        detail:
          `${pins.length} pinned entries assign ${teacher?.name ?? 'this teacher'} ` +
          `to the same slot (day ${slot?.weekday ?? '?'}, period ${slot?.period_order ?? '?'}).`,
        affected: {
          teachers: teacher ? [{ id: teacher.staff_profile_id, name: teacher.name }] : [],
        },
        quantified_impact: {
          blocked_periods: pins.length - 1,
          blocked_percentage:
            totalDemandPeriods > 0 ? Math.round(((pins.length - 1) / totalDemandPeriods) * 100) : 0,
        },
        solutions: [],
      });
    }
    checks.push({ code: 'pin_conflict_teacher', passed: teacherPassed });

    // Check 6: Class pin conflicts
    let classPassed = true;
    for (const [key, pins] of classSlots) {
      if (pins.length <= 1) continue;
      classPassed = false;
      const [classId] = key.split('|');
      const cls = classById.get(classId ?? '');
      blockers.push({
        id: `feasibility-pin-class-${key}`,
        check: 'pin_conflict_class',
        severity: 'critical',
        headline: `${cls?.class_name ?? 'A class'} is pinned to ${pins.length} subjects at the same time`,
        detail: `${pins.length} pinned entries assign ${cls?.class_name ?? 'this class'} to the same slot.`,
        affected: {
          classes: cls ? [{ id: cls.class_id, label: cls.class_name }] : [],
        },
        quantified_impact: {
          blocked_periods: pins.length - 1,
          blocked_percentage:
            totalDemandPeriods > 0 ? Math.round(((pins.length - 1) / totalDemandPeriods) * 100) : 0,
        },
        solutions: [],
      });
    }
    checks.push({ code: 'pin_conflict_class', passed: classPassed });

    // Check 7: Room pin conflicts
    let roomPassed = true;
    for (const [key, pins] of roomSlots) {
      if (pins.length <= 1) continue;
      roomPassed = false;
      const [roomId] = key.split('|');
      const room = roomById.get(roomId ?? '');
      blockers.push({
        id: `feasibility-pin-room-${key}`,
        check: 'pin_conflict_room',
        severity: 'critical',
        headline: `${room?.room_id ?? 'A room'} is pinned to ${pins.length} entries at the same time`,
        detail: `${pins.length} pinned entries assign the same room to the same slot.`,
        affected: {
          rooms: room ? [{ id: room.room_id, name: room.room_id }] : [],
        },
        quantified_impact: {
          blocked_periods: pins.length - 1,
          blocked_percentage:
            totalDemandPeriods > 0 ? Math.round(((pins.length - 1) / totalDemandPeriods) * 100) : 0,
        },
        solutions: [],
      });
    }
    checks.push({ code: 'pin_conflict_room', passed: roomPassed });
  }

  private checkRoomTypeCoverage(
    input: SolverInputV3,
    checks: FeasibilityCheck[],
    blockers: FeasibilityBlocker[],
    subjectById: Map<string, SubjectV3>,
    totalDemandPeriods: number,
  ): void {
    let passed = true;

    // Demand per room type
    const demandByRoomType = new Map<string, number>();
    for (const d of input.demand) {
      if (!d.required_room_type) continue;
      demandByRoomType.set(
        d.required_room_type,
        (demandByRoomType.get(d.required_room_type) ?? 0) + d.periods_per_week,
      );
    }

    // Unique year group IDs
    const yearGroupIds = new Set(input.period_slots.map((s) => s.year_group_id));

    // Supply per room type: count of rooms × average teaching slots per year group
    const avgTeachingSlots =
      yearGroupIds.size > 0
        ? [...yearGroupIds].reduce(
            (sum, ygId) => sum + teachingSlotCount(input.period_slots, ygId),
            0,
          ) / yearGroupIds.size
        : 0;

    for (const [roomType, demand] of demandByRoomType) {
      const roomsOfType = input.rooms.filter((r) => r.room_type === roomType);
      const supply = Math.floor(roomsOfType.length * avgTeachingSlots);

      if (supply < demand) {
        passed = false;
        const shortfall = demand - supply;
        // Find subjects requiring this room type
        const affectedSubjects = input.demand
          .filter((d) => d.required_room_type === roomType)
          .map((d) => d.subject_id);
        const uniqueSubjects = [...new Set(affectedSubjects)]
          .map((id) => subjectById.get(id))
          .filter((s): s is SubjectV3 => s !== undefined);

        blockers.push({
          id: `feasibility-room-type-${roomType}`,
          check: 'room_type_shortfall',
          severity: 'high',
          headline: `Not enough ${roomType} rooms — ${shortfall} period(s) short`,
          detail:
            `Subjects requiring ${roomType} rooms need ${demand} periods, ` +
            `but only ${supply} room-slots are available.`,
          affected: {
            rooms: roomsOfType.map((r) => ({ id: r.room_id, name: r.room_id })),
            subjects: uniqueSubjects.map((s) => ({ id: s.subject_id, name: s.subject_name })),
          },
          quantified_impact: {
            blocked_periods: shortfall,
            blocked_percentage:
              totalDemandPeriods > 0 ? Math.round((shortfall / totalDemandPeriods) * 100) : 0,
          },
          solutions: [],
        });
      }
    }
    checks.push({ code: 'room_type_shortfall', passed });
  }

  private checkDoublePeriods(
    input: SolverInputV3,
    periodDuration: number,
    checks: FeasibilityCheck[],
    blockers: FeasibilityBlocker[],
    classById: Map<string, ClassV3>,
    subjectById: Map<string, SubjectV3>,
    totalDemandPeriods: number,
  ): void {
    let passed = true;
    const classYearGroup = new Map<string, string>();
    for (const c of input.classes) classYearGroup.set(c.class_id, c.year_group_id);

    // Build consecutive-pair availability per year group per day
    const consecutivePairsByYgDay = new Map<string, number>();
    const slotsByYgDay = new Map<string, PeriodSlotV3[]>();
    for (const slot of input.period_slots) {
      if (slot.period_type !== 'teaching') continue;
      const key = `${slot.year_group_id}|${slot.weekday}`;
      const list = slotsByYgDay.get(key) ?? [];
      list.push(slot);
      slotsByYgDay.set(key, list);
    }
    for (const [key, slots] of slotsByYgDay) {
      const sorted = slots.sort((a, b) => a.period_order - b.period_order);
      let pairs = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        if ((sorted[i + 1]?.period_order ?? 0) - (sorted[i]?.period_order ?? 0) === 1) pairs++;
      }
      consecutivePairsByYgDay.set(key, pairs);
    }

    for (const d of input.demand) {
      if (d.required_doubles <= 0) continue;
      const ygId = classYearGroup.get(d.class_id);
      if (!ygId) continue;

      // Check if the class's year group has consecutive pairs on any day
      let hasConsecutive = false;
      for (const [key, pairs] of consecutivePairsByYgDay) {
        if (key.startsWith(`${ygId}|`) && pairs > 0) {
          // Check if at least one qualified teacher is available on this day
          const day = parseInt(key.split('|')[1] ?? '0', 10);
          const qualified = input.teachers.filter((t) =>
            t.competencies.some((c) => c.subject_id === d.subject_id && c.year_group_id === ygId),
          );
          const teacherAvailOnDay = qualified.some((t) =>
            t.availability.some((a) => a.weekday === day),
          );
          if (teacherAvailOnDay) {
            hasConsecutive = true;
            break;
          }
        }
      }

      if (!hasConsecutive) {
        passed = false;
        const cls = classById.get(d.class_id);
        const subject = subjectById.get(d.subject_id);
        blockers.push({
          id: `feasibility-double-${d.class_id}-${d.subject_id}`,
          check: 'double_period_infeasible',
          severity: 'high',
          headline:
            `Double period for ${subject?.subject_name ?? d.subject_id} in ` +
            `${cls?.class_name ?? d.class_id} is impossible`,
          detail:
            `${subject?.subject_name ?? 'Subject'} requires a double period, ` +
            `but no consecutive pair of slots exists where both the class and ` +
            `a qualified teacher are available.`,
          affected: {
            classes: cls ? [{ id: d.class_id, label: cls.class_name }] : [],
            subjects: subject ? [{ id: d.subject_id, name: subject.subject_name }] : [],
          },
          quantified_impact: {
            blocked_periods: d.required_doubles * 2,
            blocked_percentage:
              totalDemandPeriods > 0
                ? Math.round(((d.required_doubles * 2) / totalDemandPeriods) * 100)
                : 0,
          },
          solutions: [],
        });
      }
    }
    checks.push({ code: 'double_period_infeasible', passed });
  }

  private checkPerDayCap(
    input: SolverInputV3,
    periodDuration: number,
    checks: FeasibilityCheck[],
    blockers: FeasibilityBlocker[],
    teacherById: Map<string, TeacherV3>,
    totalDemandPeriods: number,
  ): void {
    let passed = true;

    for (const teacher of input.teachers) {
      if (teacher.max_periods_per_day === null) continue;
      const maxPerDay = teacher.max_periods_per_day;

      // How many active days?
      const activeDays = new Set(teacher.availability.map((a) => a.weekday)).size;
      const maxWeeklyFromDaily = maxPerDay * activeDays;

      // Sum demand assigned to this teacher (competency-based upper bound)
      const teacherDemand = input.demand
        .filter((d) => teacher.competencies.some((c) => c.subject_id === d.subject_id))
        .reduce((s, d) => s + d.periods_per_week, 0);

      // This is a rough check — only flag when clearly infeasible
      const weekCap = teacher.max_periods_per_week ?? 999;
      const effectiveLoad = Math.min(teacherDemand, weekCap);

      if (effectiveLoad > maxWeeklyFromDaily && activeDays > 0) {
        passed = false;
        const shortfall = effectiveLoad - maxWeeklyFromDaily;
        blockers.push({
          id: `feasibility-daycap-${teacher.staff_profile_id}`,
          check: 'per_day_cap_conflict',
          severity: 'high',
          headline: `${teacher.name} cannot meet daily demand within per-day cap`,
          detail:
            `${teacher.name}'s max_periods_per_day (${maxPerDay}) across ${activeDays} day(s) ` +
            `= ${maxWeeklyFromDaily} periods/week, but assigned demand is ${effectiveLoad}. ` +
            `${shortfall} period(s) cannot be placed.`,
          affected: {
            teachers: [{ id: teacher.staff_profile_id, name: teacher.name }],
          },
          quantified_impact: {
            blocked_periods: shortfall,
            blocked_percentage:
              totalDemandPeriods > 0 ? Math.round((shortfall / totalDemandPeriods) * 100) : 0,
          },
          solutions: [],
        });
      }
    }
    checks.push({ code: 'per_day_cap_conflict', passed });
  }
}
