/**
 * Converts per-year-group period templates into a flat ``PeriodSlotV3[]``
 * with stable integer indices.
 *
 * Per-year-group templates take precedence over school-default (NULL
 * year_group_id) templates for the same (weekday, period_order). Prior
 * behaviour concatenated both sets unfiltered — which on NHQS (8 orphan
 * NULL-year-group rows: 7 Monday + 1 Tuesday on a 60-min grid) doubled
 * the Monday slot count from 7 to 14 and gave the solver freedom to
 * place lessons at 13:00-14:00 on a Monday that officially ends at
 * 12:45. The fix: a year-group that defines its own grid for a
 * (weekday, period_order) tuple suppresses the school-default row for
 * the same tuple.
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
    const ygTemplates = periodTemplates.filter((pt) => pt.year_group_id === yg.id);
    const defaultTemplates = periodTemplates.filter((pt) => pt.year_group_id === null);

    // Year-group-specific coverage first — these wins.
    const covered = new Set<string>();
    for (const pt of ygTemplates) {
      covered.add(`${pt.weekday}:${pt.period_order}`);
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

    // School-default templates fill *only* the (weekday, period_order)
    // gaps the year group didn't cover. This keeps the fallback useful
    // for new year groups that haven't customised their grid yet, while
    // preventing the duplicate-slot bug for year groups that have.
    for (const pt of defaultTemplates) {
      if (covered.has(`${pt.weekday}:${pt.period_order}`)) continue;
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
