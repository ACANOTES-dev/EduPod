/* eslint-disable max-lines -- translation registry: one entry per diagnostic code × solutions */
/**
 * English diagnostic translations.
 *
 * Every code in DIAGNOSTIC_CODES must have an entry here.
 * The coverage spec asserts this at test time.
 */
import type { DiagnosticCode } from '../diagnostic-codes';
import type { DiagnosticTranslation } from '../diagnostic-types';

export const EN_TRANSLATIONS: Record<DiagnosticCode, DiagnosticTranslation> = {
  // ─── Feasibility sweep ──────────────────────────────────────────────────────

  global_capacity_shortfall: {
    headline: (ctx) =>
      `Not enough total teaching capacity — ${ctx.shortfall_periods ?? 0} period(s) short`,
    detail: (ctx) =>
      `Your school needs ${ctx.demand_periods ?? 0} teaching periods per week, ` +
      `but qualified teachers can only cover ${ctx.supply_periods ?? 0}. ` +
      `${ctx.shortfall_periods ?? 0} period(s) cannot be scheduled.`,
    solution_templates: [
      {
        id: 'global_add_teachers',
        effort: 'long',
        headline: () => 'Hire or qualify more teachers',
        detail: (ctx) =>
          `Add ${ctx.additional_teachers ?? 1} more qualified teacher(s) to cover the gap.`,
        link_template: () => '/scheduling/competencies',
      },
      {
        id: 'global_reduce_demand',
        effort: 'medium',
        headline: () => 'Reduce curriculum demand',
        detail: () =>
          'Lower min_periods_per_week for lower-priority subjects to bring demand within capacity.',
        link_template: () => '/scheduling/curriculum',
      },
    ],
  },

  subject_capacity_shortfall: {
    headline: (ctx) =>
      `Not enough ${ctx.subject?.name ?? 'subject'} teachers — ${ctx.shortfall_periods ?? 0} period(s) short`,
    detail: (ctx) =>
      `${ctx.subject?.name ?? 'This subject'} needs ${ctx.demand_periods ?? 0} teaching periods, ` +
      `but qualified teachers can only cover ${ctx.supply_periods ?? 0}.`,
    solution_templates: [
      {
        id: 'subject_broaden_comp',
        effort: 'quick',
        headline: (ctx) => `Broaden ${ctx.subject?.name ?? 'subject'} competencies`,
        detail: (ctx) =>
          `Add ${ctx.subject?.name ?? 'this subject'} as a competency for teachers who teach related subjects.`,
        link_template: () => '/scheduling/competencies',
      },
      {
        id: 'subject_raise_cap',
        effort: 'medium',
        headline: () => 'Raise teacher weekly caps',
        detail: () => 'Increase max_periods_per_week for qualified teachers.',
        link_template: () => '/scheduling/teacher-config',
      },
    ],
  },

  unreachable_class_subject: {
    headline: (ctx) =>
      `No teacher can teach ${ctx.subject?.name ?? 'subject'} to ${ctx.class_label ?? 'class'}`,
    detail: (ctx) =>
      `${ctx.class_label ?? 'This class'} needs ${ctx.subject?.name ?? 'this subject'}, ` +
      `but no qualified teacher has availability that overlaps with the class's schedule.`,
    solution_templates: [
      {
        id: 'unreachable_add_comp',
        effort: 'quick',
        headline: () => 'Qualify a teacher for this class',
        detail: (ctx) =>
          `Add a teacher competency for ${ctx.subject?.name ?? 'this subject'} ` +
          `in ${ctx.year_group?.name ?? 'this year group'}.`,
        link_template: () => '/scheduling/competencies',
      },
      {
        id: 'unreachable_extend_avail',
        effort: 'medium',
        headline: () => 'Extend teacher availability',
        detail: () =>
          'Widen the available hours so at least one qualified teacher overlaps with the class.',
        link_template: () => '/scheduling/availability',
      },
    ],
  },

  class_weekly_overbook: {
    headline: (ctx) =>
      `${ctx.class_label ?? 'Class'} has more required periods than slots in the week`,
    detail: (ctx) =>
      `Mandatory subjects demand more periods than the ${ctx.slot_count ?? 0} available slots ` +
      `(after accounting for pinned entries). ${ctx.blocked_periods ?? 0} period(s) cannot fit.`,
    solution_templates: [
      {
        id: 'overbook_reduce_demand',
        effort: 'medium',
        headline: () => 'Reduce subject demand for this class',
        detail: () => 'Lower min_periods_per_week for one or more subjects in this class.',
        link_template: () => '/scheduling/curriculum',
      },
      {
        id: 'overbook_remove_pins',
        effort: 'quick',
        headline: () => 'Remove some pinned entries',
        detail: () => 'Unpin manually fixed slots to free capacity for the solver.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  pin_conflict_teacher: {
    headline: (ctx) =>
      `${ctx.teacher?.name ?? 'A teacher'} is pinned to two classes at the same time`,
    detail: (ctx) =>
      `Two or more pinned entries assign ${ctx.teacher?.name ?? 'this teacher'} ` +
      `to overlapping slots. The solver cannot honour both.`,
    solution_templates: [
      {
        id: 'pin_teacher_remove',
        effort: 'quick',
        headline: () => 'Remove one conflicting pin',
        detail: () => 'Unpin one of the overlapping entries and let the solver place it.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  pin_conflict_class: {
    headline: (ctx) => `${ctx.class_label ?? 'A class'} is pinned to two subjects at the same time`,
    detail: (ctx) =>
      `Two or more pinned entries assign ${ctx.class_label ?? 'this class'} ` +
      `to the same slot. Only one can be scheduled.`,
    solution_templates: [
      {
        id: 'pin_class_remove',
        effort: 'quick',
        headline: () => 'Remove one conflicting pin',
        detail: () => 'Unpin one of the overlapping entries.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  pin_conflict_room: {
    headline: (ctx) => `${ctx.room?.name ?? 'A room'} is pinned to two entries at the same time`,
    detail: (ctx) =>
      `Two or more pinned entries assign ${ctx.room?.name ?? 'this room'} ` +
      `to the same slot. Only one class can use it.`,
    solution_templates: [
      {
        id: 'pin_room_remove',
        effort: 'quick',
        headline: () => 'Remove one conflicting pin',
        detail: () => 'Unpin one of the overlapping room assignments.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  room_type_shortfall: {
    headline: (ctx) =>
      `Not enough ${ctx.room?.name ?? 'specialised'} rooms for ${ctx.subject?.name ?? 'subject'}`,
    detail: (ctx) =>
      `${ctx.subject?.name ?? 'This subject'} requires a specific room type, ` +
      `but room capacity (rooms × slots) falls short of demand by ${ctx.shortfall_periods ?? 0} period(s).`,
    solution_templates: [
      {
        id: 'room_add',
        effort: 'long',
        headline: () => 'Add more rooms of this type',
        detail: () => 'Create or designate additional rooms matching the required type.',
        link_template: () => '/scheduling/rooms',
      },
      {
        id: 'room_reduce_demand',
        effort: 'medium',
        headline: () => 'Remove the room type requirement',
        detail: () =>
          'Allow the subject to be taught in any room if a dedicated room is not strictly needed.',
        link_template: () => '/scheduling/curriculum',
      },
    ],
  },

  double_period_infeasible: {
    headline: (ctx) =>
      `Double period for ${ctx.subject?.name ?? 'subject'} in ${ctx.class_label ?? 'class'} is impossible`,
    detail: (ctx) =>
      `${ctx.subject?.name ?? 'This subject'} requires a double period, ` +
      `but no consecutive pair of slots exists where both the class and a qualified teacher are available.`,
    solution_templates: [
      {
        id: 'double_extend_avail',
        effort: 'medium',
        headline: () => 'Extend teacher availability on one day',
        detail: () =>
          'Ensure at least one qualified teacher has two consecutive free slots on a single day.',
        link_template: () => '/scheduling/availability',
      },
      {
        id: 'double_remove_req',
        effort: 'quick',
        headline: () => 'Remove the double-period requirement',
        detail: () =>
          'Set requires_double_period to false in the curriculum if singles are acceptable.',
        link_template: () => '/scheduling/curriculum',
      },
    ],
  },

  per_day_cap_conflict: {
    headline: (ctx) =>
      `${ctx.teacher?.name ?? 'A teacher'} cannot meet their daily demand within their per-day cap`,
    detail: (ctx) =>
      `${ctx.teacher?.name ?? 'This teacher'}'s max_periods_per_day (${ctx.cap_value ?? 0}) ` +
      `across their active days is less than their total assigned demand. ` +
      `${ctx.blocked_periods ?? 0} period(s) cannot be placed.`,
    solution_templates: [
      {
        id: 'day_cap_raise',
        effort: 'quick',
        headline: () => 'Raise the daily period cap',
        detail: (ctx) => `Increase max_periods_per_day for ${ctx.teacher?.name ?? 'this teacher'}.`,
        link_template: () => '/scheduling/teacher-config',
      },
      {
        id: 'day_cap_spread',
        effort: 'medium',
        headline: () => 'Spread load across more teachers',
        detail: () =>
          'Qualify additional teachers for the subject to reduce per-teacher daily load.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  // ─── IIS constraint types (§B) ────────────────────────────────────────────

  teacher_unavailable: {
    headline: (ctx) => `${ctx.teacher?.name ?? 'A teacher'} is not available when needed`,
    detail: (ctx) =>
      `${ctx.teacher?.name ?? 'This teacher'} is needed to teach ` +
      `${ctx.subject?.name ?? 'a subject'}, but has no availability in the required slots.`,
    solution_templates: [
      {
        id: 'iis_extend_avail',
        effort: 'quick',
        headline: () => 'Extend teacher availability',
        detail: () => 'Add availability for the required time slots.',
        link_template: () => '/scheduling/availability',
      },
    ],
  },

  teacher_overloaded: {
    headline: (ctx) => `${ctx.teacher?.name ?? 'A teacher'} is over their weekly load limit`,
    detail: (ctx) =>
      `${ctx.teacher?.name ?? 'This teacher'} is already at their maximum periods per week. ` +
      `Additional lessons cannot be assigned.`,
    solution_templates: [
      {
        id: 'iis_raise_cap',
        effort: 'quick',
        headline: () => 'Raise their weekly period cap',
        detail: () => 'Increase max_periods_per_week in Teacher Config.',
        link_template: () => '/scheduling/teacher-config',
      },
    ],
  },

  room_capacity_exceeded: {
    headline: (ctx) => `${ctx.room?.name ?? 'A room'} is over-scheduled`,
    detail: (ctx) =>
      `${ctx.room?.name ?? 'This room'} is assigned to more classes than it has slots for.`,
    solution_templates: [
      {
        id: 'iis_add_room',
        effort: 'long',
        headline: () => 'Add another room',
        detail: () => 'Create an additional room to spread the load.',
        link_template: () => '/scheduling/rooms',
      },
    ],
  },

  class_conflict: {
    headline: (ctx) => `${ctx.class_label ?? 'A class'} is double-booked`,
    detail: (ctx) =>
      `${ctx.class_label ?? 'This class'} is assigned two different subjects ` +
      `at the same time. The solver must choose one.`,
    solution_templates: [
      {
        id: 'iis_reduce_demand',
        effort: 'medium',
        headline: () => 'Reduce subject demand',
        detail: () => 'Lower the total required periods for one of the competing subjects.',
        link_template: () => '/scheduling/curriculum',
      },
    ],
  },

  subject_demand_exceeds_capacity: {
    headline: (ctx) =>
      `${ctx.subject?.name ?? 'A subject'} demand exceeds available teaching capacity`,
    detail: (ctx) =>
      `${ctx.subject?.name ?? 'This subject'} requires ${ctx.demand_periods ?? 0} periods, ` +
      `but only ${ctx.supply_periods ?? 0} can be covered. ` +
      `${ctx.shortfall_periods ?? 0} period(s) must go unplaced.`,
    solution_templates: [
      {
        id: 'iis_broaden',
        effort: 'quick',
        headline: () => 'Broaden teacher competencies',
        detail: () => 'Qualify more teachers for this subject.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  pin_blocks_placement: {
    headline: () => 'Pinned entries prevent optimal placement',
    detail: () =>
      'One or more manually pinned entries block the solver from placing lessons. ' +
      'Unpinning them would let the solver find a better arrangement.',
    solution_templates: [
      {
        id: 'iis_unpin',
        effort: 'quick',
        headline: () => 'Review and unpin',
        detail: () =>
          'Unpin entries that are not strictly required to give the solver more flexibility.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  double_period_blocked: {
    headline: (ctx) => `Double period for ${ctx.subject?.name ?? 'a subject'} cannot be scheduled`,
    detail: (ctx) =>
      `${ctx.subject?.name ?? 'This subject'} requires consecutive slots, ` +
      `but no valid pair exists given the current constraints.`,
    solution_templates: [
      {
        id: 'iis_double_avail',
        effort: 'medium',
        headline: () => 'Free up consecutive slots',
        detail: () =>
          'Ensure teacher availability allows two back-to-back periods on at least one day.',
        link_template: () => '/scheduling/availability',
      },
    ],
  },

  student_overlap_conflict: {
    headline: (ctx) => `Classes ${ctx.class_label ?? ''} share students and clash`,
    detail: () =>
      'Two classes that share students are scheduled at the same time. ' +
      'Students cannot attend both.',
    solution_templates: [
      {
        id: 'iis_overlap_separate',
        effort: 'medium',
        headline: () => 'Separate overlapping classes',
        detail: () =>
          'Ensure these classes are not scheduled in the same period, or remove the student overlap.',
        link_template: () => '/scheduling/curriculum',
      },
    ],
  },

  // ─── Post-solve categories ────────────────────────────────────────────────

  teacher_supply_shortage: {
    headline: (ctx) =>
      `Not enough ${ctx.subject?.name ?? 'subject'} teachers for ${ctx.year_group?.name ?? 'year group'}`,
    detail: (ctx) =>
      `${ctx.subject?.name ?? 'This subject'} needs ${ctx.demand_periods ?? 0} periods/week, ` +
      `but only ${ctx.supply_periods ?? 0} can be covered by qualified teachers. ` +
      `${ctx.blocked_periods ?? 0} period(s) went unplaced.`,
    solution_templates: [
      {
        id: 'supply_broaden',
        effort: 'quick',
        headline: () => 'Broaden teacher competencies',
        detail: (ctx) =>
          `Add ${ctx.subject?.name ?? 'this subject'} as a competency for related-subject teachers.`,
        link_template: () => '/scheduling/competencies',
      },
      {
        id: 'supply_raise_cap',
        effort: 'medium',
        headline: () => 'Raise weekly period caps',
        detail: () => 'Increase max_periods_per_week for qualified teachers.',
        link_template: () => '/scheduling/teacher-config',
      },
      {
        id: 'supply_hire',
        effort: 'long',
        headline: (ctx) => `Hire ${ctx.additional_teachers ?? 1} more teacher(s)`,
        detail: (ctx) =>
          `Onboard ${ctx.additional_teachers ?? 1} additional staff qualified for ${ctx.subject?.name ?? 'this subject'}.`,
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  workload_cap_hit: {
    headline: (ctx) => `${ctx.teacher?.name ?? 'Teacher(s)'} at weekly load cap`,
    detail: (ctx) =>
      `${ctx.teacher?.name ?? 'These teachers'} are scheduled at or beyond their ` +
      `${ctx.cap_value ?? 25}-period weekly maximum.`,
    solution_templates: [
      {
        id: 'workload_raise',
        effort: 'quick',
        headline: () => 'Raise weekly caps',
        detail: () => 'Increase max_periods_per_week (check welfare/contract limits first).',
        link_template: () => '/scheduling/teacher-config',
      },
      {
        id: 'workload_spread',
        effort: 'medium',
        headline: () => 'Spread load to more teachers',
        detail: () => 'Broaden competency coverage so other staff can pick up periods.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  availability_pinch: {
    headline: (ctx) =>
      `Tight availability for ${ctx.subject?.name ?? 'subject'} in ${ctx.year_group?.name ?? 'year group'}`,
    detail: (ctx) =>
      `Qualified teachers have ~${ctx.supply_periods ?? 0} available periods/week — ` +
      `not enough to cover the ${ctx.blocked_periods ?? 0} unplaced period(s).`,
    solution_templates: [
      {
        id: 'avail_extend',
        effort: 'quick',
        headline: () => 'Extend availability windows',
        detail: () => 'Widen weekly working hours for qualified teachers.',
        link_template: () => '/scheduling/availability',
      },
      {
        id: 'avail_qualify',
        effort: 'medium',
        headline: () => 'Qualify more teachers',
        detail: (ctx) =>
          `Make additional staff eligible for ${ctx.subject?.name ?? 'this subject'}.`,
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  pin_conflict: {
    headline: () => 'Conflicting pinned entries detected',
    detail: () =>
      'Two or more manually pinned entries conflict — same teacher, class, or room in the same slot. ' +
      'The solver cannot honour both.',
    solution_templates: [
      {
        id: 'pin_review',
        effort: 'quick',
        headline: () => 'Review and unpin conflicting entries',
        detail: () => 'Open the pinned entries view and remove one of the conflicting pins.',
        link_template: () => '/scheduling/competencies',
      },
    ],
  },

  unassigned_slots: {
    headline: (ctx) =>
      `${ctx.subject?.name ?? 'Subject'} in ${ctx.year_group?.name ?? 'year group'}: ` +
      `${ctx.blocked_periods ?? 0} period(s) unplaced`,
    detail: (ctx) =>
      `The solver could not place ${ctx.blocked_periods ?? 0} period(s) for ` +
      `${ctx.subject?.name ?? 'this subject'}. The grid may be saturated for this subject.`,
    solution_templates: [
      {
        id: 'unassigned_pin',
        effort: 'quick',
        headline: () => 'Pin priority lessons manually',
        detail: () =>
          'Anchor the most important periods to specific slots so the solver routes around them.',
        link_template: () => '/scheduling/competencies',
      },
      {
        id: 'unassigned_grid',
        effort: 'medium',
        headline: () => 'Open up the period grid',
        detail: () => 'Check for unused teaching slots or room closures blocking viable periods.',
        link_template: () => '/scheduling/period-grid',
      },
    ],
  },

  solver_budget_exhausted: {
    headline: () => 'Solver ran out of time',
    detail: (ctx) =>
      `The solver used its full time budget and could not place ${ctx.blocked_periods ?? 0} period(s). ` +
      `These might be placeable with more time, or may indicate a structural issue.`,
    solution_templates: [
      {
        id: 'budget_retry',
        effort: 'quick',
        headline: () => 'Re-run with a longer time budget',
        detail: () =>
          'Increase max_solver_duration_seconds and run again. The solver may find placements with more time.',
        link_template: () => '/scheduling/runs',
      },
      {
        id: 'budget_simplify',
        effort: 'medium',
        headline: () => 'Simplify constraints',
        detail: () =>
          'Remove non-essential pins or reduce soft preference weights to give the solver more room.',
        link_template: () => '/scheduling/curriculum',
      },
    ],
  },
};
