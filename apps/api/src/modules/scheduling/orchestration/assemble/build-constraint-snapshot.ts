/**
 * Builds ``ConstraintSnapshotEntry[]`` — generalised audit trail of every
 * non-default modelling decision the orchestration layer made.
 */
import type { ConstraintSnapshotEntry } from '@school/shared/scheduler';

import type { BuildDemandResult } from './build-demand';
import type { ClassRoomOverrideRecord, PinnedScheduleRecord } from './load-tenant-data';

export function buildConstraintSnapshot(
  overridesApplied: BuildDemandResult['overridesApplied'],
  pinnedSchedules: PinnedScheduleRecord[],
  classRoomOverrides: ClassRoomOverrideRecord[],
): ConstraintSnapshotEntry[] {
  const entries: ConstraintSnapshotEntry[] = [];

  // Class-subject overrides (SCHED-023)
  for (const ovr of overridesApplied) {
    entries.push({
      type: 'class_subject_override',
      description: `class ${ovr.class_id} subject ${ovr.subject_id}: ${ovr.baseline_periods ?? '?'} → ${ovr.override_periods} periods/week`,
      details: {
        class_id: ovr.class_id,
        subject_id: ovr.subject_id,
        baseline_periods: ovr.baseline_periods,
        override_periods: ovr.override_periods,
      },
    });
  }

  // Pinned entries
  for (const pin of pinnedSchedules) {
    entries.push({
      type: 'pin_inclusion',
      description: `pinned: class ${pin.class_id} at weekday ${pin.weekday} period ${pin.period_order}`,
      details: {
        schedule_id: pin.schedule_id,
        class_id: pin.class_id,
        subject_id: pin.subject_id,
        teacher_staff_id: pin.teacher_staff_id,
        weekday: pin.weekday,
        period_order: pin.period_order,
      },
    });
  }

  // Class-level room overrides (SCHED-018)
  for (const ovr of classRoomOverrides) {
    if (ovr.preferred_room_id === null && ovr.required_room_type === null) continue;
    entries.push({
      type: 'room_override',
      description: `class ${ovr.class_id}: preferred_room=${ovr.preferred_room_id ?? 'none'}, required_type=${ovr.required_room_type ?? 'any'}`,
      details: {
        class_id: ovr.class_id,
        preferred_room_id: ovr.preferred_room_id,
        required_room_type: ovr.required_room_type,
      },
    });
  }

  return entries;
}
