/**
 * Converts per-year-group period templates into a flat ``PeriodSlotV3[]``
 * with stable integer indices.
 */
import type { PeriodSlotV3, PeriodTypeV3, SupervisionModeV3 } from '@school/shared/scheduler';

import type { PeriodTemplate, YearGroupWithClasses } from './load-tenant-data';

export function buildPeriodSlots(
  yearGroups: YearGroupWithClasses[],
  periodTemplates: PeriodTemplate[],
): PeriodSlotV3[] {
  const slots: PeriodSlotV3[] = [];
  let index = 0;

  for (const yg of yearGroups) {
    const ygTemplates = periodTemplates.filter(
      (pt) => pt.year_group_id === yg.id || pt.year_group_id === null,
    );

    for (const pt of ygTemplates) {
      slots.push({
        index,
        year_group_id: yg.id,
        weekday: pt.weekday,
        period_order: pt.period_order,
        start_time: pt.start_time,
        end_time: pt.end_time,
        period_type: pt.period_type as PeriodTypeV3,
        supervision_mode: (pt.supervision_mode ?? 'none') as SupervisionModeV3,
        break_group_id: pt.break_group_id,
      });
      index++;
    }
  }

  return slots;
}
