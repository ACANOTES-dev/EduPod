/**
 * Converts pinned schedule rows to ``PinnedAssignmentV3[]``, resolving
 * (weekday, period_order) pairs to integer period_index values.
 */
import type { PeriodSlotV3, PinnedAssignmentV3 } from '@school/shared/scheduler';

import type { PinnedScheduleRecord } from './load-tenant-data';

export function buildPinned(
  pinnedSchedules: PinnedScheduleRecord[],
  periodSlots: PeriodSlotV3[],
): PinnedAssignmentV3[] {
  // Build lookup: (year_group_id, weekday, period_order) → index
  const slotLookup = new Map<string, number>();
  const fallbackLookup = new Map<string, number>();
  for (const slot of periodSlots) {
    slotLookup.set(`${slot.year_group_id}|${slot.weekday}|${slot.period_order}`, slot.index);
    const fbKey = `${slot.weekday}|${slot.period_order}`;
    if (!fallbackLookup.has(fbKey)) {
      fallbackLookup.set(fbKey, slot.index);
    }
  }

  return pinnedSchedules.map((pin) => {
    const ygKey = `${pin.year_group_id ?? ''}|${pin.weekday}|${pin.period_order}`;
    const fbKey = `${pin.weekday}|${pin.period_order}`;
    const periodIndex = slotLookup.get(ygKey) ?? fallbackLookup.get(fbKey) ?? 0;

    return {
      schedule_id: pin.schedule_id,
      class_id: pin.class_id,
      subject_id: pin.subject_id,
      period_index: periodIndex,
      teacher_staff_id: pin.teacher_staff_id,
      room_id: pin.room_id,
    };
  });
}
