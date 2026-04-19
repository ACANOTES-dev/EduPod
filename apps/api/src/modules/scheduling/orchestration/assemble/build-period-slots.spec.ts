import { buildPeriodSlots } from './build-period-slots';
import type { PeriodTemplate, YearGroupWithClasses } from './load-tenant-data';

const YG1 = '11111111-1111-1111-1111-111111111111';

function yg(id: string): YearGroupWithClasses {
  return {
    id,
    name: 'Year 6',
    tenant_id: 't',
    created_at: new Date(),
    updated_at: new Date(),
    classes: [],
  } as unknown as YearGroupWithClasses;
}

function template(
  overrides: Partial<PeriodTemplate> & Pick<PeriodTemplate, 'weekday' | 'period_order'>,
): PeriodTemplate {
  return {
    id: `pt-${overrides.weekday}-${overrides.period_order}-${overrides.year_group_id ?? 'null'}`,
    tenant_id: 't',
    academic_year_id: 'ay',
    year_group_id: null,
    period_name: '',
    period_name_ar: '',
    start_time: '08:00',
    end_time: '08:45',
    period_type: 'teaching',
    supervision_mode: 'none',
    break_group_id: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as unknown as PeriodTemplate;
}

describe('buildPeriodSlots', () => {
  it('prefers year-group templates over school-default NULL rows for the same (weekday, period_order)', () => {
    const yearGroups = [yg(YG1)];
    const templates: PeriodTemplate[] = [
      // Year-group-specific: real 45-min grid
      template({
        weekday: 1,
        period_order: 1,
        year_group_id: YG1,
        start_time: '08:00',
        end_time: '08:45',
      }),
      template({
        weekday: 1,
        period_order: 2,
        year_group_id: YG1,
        start_time: '08:45',
        end_time: '09:30',
      }),
      // School-default NULL leftover: phantom 60-min grid with same (1, 1) and (1, 2)
      template({
        weekday: 1,
        period_order: 1,
        year_group_id: null,
        start_time: '08:00',
        end_time: '09:00',
      }),
      template({
        weekday: 1,
        period_order: 2,
        year_group_id: null,
        start_time: '09:00',
        end_time: '10:00',
      }),
    ];

    const slots = buildPeriodSlots(yearGroups, templates);

    // Two slots total — the year-group-specific ones. The school-default
    // phantoms must be suppressed because the year group covers those
    // (weekday, period_order) tuples.
    expect(slots).toHaveLength(2);
    expect(
      slots.map((s) => `${s.weekday}:${s.period_order}:${s.start_time}-${s.end_time}`),
    ).toEqual(['1:1:08:00-08:45', '1:2:08:45-09:30']);
  });

  it('falls back to school-default NULL templates for (weekday, period_order) not covered by the year group', () => {
    const yearGroups = [yg(YG1)];
    const templates: PeriodTemplate[] = [
      // Year-group only covers Monday P1.
      template({
        weekday: 1,
        period_order: 1,
        year_group_id: YG1,
        start_time: '08:00',
        end_time: '08:45',
      }),
      // School default also provides Monday P2 — should fill the gap.
      template({
        weekday: 1,
        period_order: 2,
        year_group_id: null,
        start_time: '09:00',
        end_time: '10:00',
      }),
    ];

    const slots = buildPeriodSlots(yearGroups, templates);

    expect(slots).toHaveLength(2);
    expect(slots.map((s) => `${s.weekday}:${s.period_order}`)).toEqual(['1:1', '1:2']);
    // P2 came from the NULL default.
    expect(slots[1]!.start_time).toBe('09:00');
  });

  it('produces no duplicates for the real-world NHQS-like scenario (7 YG slots + 7 NULL phantoms for Monday)', () => {
    const yearGroups = [yg(YG1)];
    const templates: PeriodTemplate[] = [];
    // Year-group Monday grid: P1-P7 at 45-min cadence.
    for (let p = 1; p <= 7; p++) {
      templates.push(
        template({
          weekday: 1,
          period_order: p,
          year_group_id: YG1,
          start_time: '08:00',
          end_time: '08:45',
        }),
      );
    }
    // Orphan NULL school-default: also P1-P7 at 60-min cadence. These
    // must be fully suppressed.
    for (let p = 1; p <= 7; p++) {
      templates.push(
        template({
          weekday: 1,
          period_order: p,
          year_group_id: null,
          start_time: '08:00',
          end_time: '09:00',
        }),
      );
    }

    const slots = buildPeriodSlots(yearGroups, templates);

    // 7, not 14 — the NHQS pilot bug would show 14 before this fix.
    expect(slots).toHaveLength(7);
  });
});
