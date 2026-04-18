'use client';

import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Printer,
  Search,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type PeriodType = 'teaching' | 'break_supervision' | 'lunch_duty' | 'assembly' | 'free';

interface PeriodSlot {
  weekday: number;
  period_order: number;
  start_time: string;
  end_time: string;
  period_type: PeriodType;
  year_group_id?: string | null;
}

interface NormalizedCell {
  schedule_id: string;
  weekday: number;
  period_order: number;
  start_time: string;
  end_time: string;
  subject_name: string;
  class_name: string;
  teacher_name: string | null;
  room_name: string | null;
  is_cover_duty: boolean;
  cover_for_name: string | null;
  is_exam_invigilation?: boolean;
}

interface NormalizedTimetable {
  label: string | null;
  week_start: string | null;
  week_end: string | null;
  rotation_week_label: string | null;
  cells: NormalizedCell[];
  period_slots: PeriodSlot[];
  weekdays: number[];
  exam_session_active?: boolean;
  exam_session_message?: string;
}

interface MyEndpointEntry {
  schedule_id: string;
  weekday: number;
  period_order: number;
  start_time: string;
  end_time: string;
  class_name: string;
  subject_name: string | null;
  room_name: string | null;
  rotation_week: number | null;
  is_exam_invigilation?: boolean;
  is_cover_duty?: boolean;
  cover_for_name?: string | null;
}

interface MyEndpointResponse {
  data: MyEndpointEntry[];
  period_slots?: PeriodSlot[];
  exam_session_active?: boolean;
  exam_session_message?: string;
}

interface TimetableEntryDto {
  schedule_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  class_id: string;
  class_name: string;
  room_id?: string;
  room_name?: string;
  teacher_staff_id?: string;
  teacher_name?: string;
  subject_name?: string;
  is_cover_duty?: boolean;
  cover_for_name?: string | null;
}

interface ParentTimetableResponse {
  class_name: string;
  classroom_model: 'fixed_homeroom' | 'free_movement';
  rotation_week_label: string | null;
  week_start: string;
  week_end: string;
  weekdays: number[];
  periods: Array<{ order: number; name: string; start_time: string; end_time: string }>;
  cells: Array<{
    weekday: number;
    period_order: number;
    period_name: string;
    subject_name: string;
    teacher_name: string | null;
    room_name: string | null;
  }>;
  exam_session_active?: boolean;
  exam_session_message?: string;
}

interface TimetableEnvelope {
  data: TimetableEntryDto[];
  period_slots?: PeriodSlot[];
  exam_session_active?: boolean;
  exam_session_message?: string;
}

interface LookupItem {
  id: string;
  label: string;
  sub?: string | null;
}

type ViewMode = 'mine' | 'class' | 'teacher' | 'student' | 'child';

// ─── Constants ─────────────────────────────────────────────────────────────────

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Normalizers ──────────────────────────────────────────────────────────────

function formatTime(t: string): string {
  return t.slice(0, 5);
}

function derivePeriodOrderFromEntries(
  entries: Array<{ weekday: number; start_time: string }>,
): Map<string, number> {
  // Fallback: when no period_slots are provided, derive per-day period_order
  // from ascending start_time on that weekday. This preserves the row alignment
  // so that "the 2nd slot of the day" sits in row 2 across every day, even if
  // absolute start times differ between days.
  const byDay = new Map<number, string[]>();
  for (const e of entries) {
    const key = e.weekday;
    const list = byDay.get(key) ?? byDay.set(key, []).get(key)!;
    if (!list.includes(e.start_time)) list.push(e.start_time);
  }
  const result = new Map<string, number>();
  for (const [day, times] of byDay) {
    times.sort();
    times.forEach((t, i) => result.set(`${day}|${t}`, i + 1));
  }
  return result;
}

function normalizeMyEndpoint(
  response: MyEndpointResponse,
  weekStart: Date,
  weekEnd: Date,
): NormalizedTimetable {
  const entries = response.data ?? [];
  const periodSlots = response.period_slots ?? [];

  // Build day-local period_order when the server didn't provide one.
  const derived = entries.some((e) => !e.period_order)
    ? derivePeriodOrderFromEntries(entries)
    : null;

  const cells: NormalizedCell[] = entries.map((e) => ({
    schedule_id: e.schedule_id,
    weekday: e.weekday,
    period_order: e.period_order || (derived?.get(`${e.weekday}|${e.start_time}`) ?? 1),
    start_time: formatTime(e.start_time),
    end_time: formatTime(e.end_time),
    subject_name: e.subject_name ?? '',
    class_name: e.class_name,
    teacher_name: null,
    room_name: e.room_name,
    is_cover_duty: e.is_cover_duty === true,
    cover_for_name: e.cover_for_name ?? null,
    is_exam_invigilation: e.is_exam_invigilation === true,
  }));

  const weekdays = buildWeekdays(cells, periodSlots);
  return {
    label: null,
    week_start: weekStart.toISOString(),
    week_end: weekEnd.toISOString(),
    rotation_week_label: null,
    cells,
    period_slots: periodSlots,
    weekdays,
    exam_session_active: response.exam_session_active === true,
    exam_session_message: response.exam_session_message,
  };
}

function normalizeTimetableEntries(
  envelope: TimetableEnvelope,
  weekStart: Date,
  weekEnd: Date,
): NormalizedTimetable {
  const entries = envelope.data ?? [];
  const periodSlots = envelope.period_slots ?? [];

  // Map (weekday, start_time) -> period_order using the period_slots grid
  // (authoritative). Fall back to per-day derivation if the grid is missing.
  const slotOrderByTime = new Map<string, number>();
  for (const s of periodSlots) {
    const key = `${s.weekday}|${s.start_time}`;
    if (!slotOrderByTime.has(key)) slotOrderByTime.set(key, s.period_order);
  }

  const derived = slotOrderByTime.size === 0 ? derivePeriodOrderFromEntries(entries) : null;

  const cells: NormalizedCell[] = entries.map((e) => {
    const key = `${e.weekday}|${formatTime(e.start_time)}`;
    const order = slotOrderByTime.get(key) ?? derived?.get(`${e.weekday}|${e.start_time}`) ?? 0;
    return {
      schedule_id: e.schedule_id,
      weekday: e.weekday,
      period_order: order,
      start_time: formatTime(e.start_time),
      end_time: formatTime(e.end_time),
      subject_name: e.subject_name ?? '',
      class_name: e.class_name,
      teacher_name: e.teacher_name ?? null,
      room_name: e.room_name ?? null,
      is_cover_duty: e.is_cover_duty === true,
      cover_for_name: e.cover_for_name ?? null,
    };
  });

  const weekdays = buildWeekdays(cells, periodSlots);
  return {
    label: null,
    week_start: weekStart.toISOString(),
    week_end: weekEnd.toISOString(),
    rotation_week_label: null,
    cells,
    period_slots: periodSlots,
    weekdays,
    exam_session_active: envelope.exam_session_active === true,
    exam_session_message: envelope.exam_session_message,
  };
}

function normalizeParentEndpoint(res: ParentTimetableResponse): NormalizedTimetable {
  const cells: NormalizedCell[] = res.cells.map((c) => {
    const p = res.periods.find((pp) => pp.order === c.period_order);
    return {
      schedule_id: `${c.weekday}-${c.period_order}`,
      weekday: c.weekday,
      period_order: c.period_order,
      start_time: p ? formatTime(p.start_time) : '',
      end_time: p ? formatTime(p.end_time) : '',
      subject_name: c.subject_name,
      class_name: res.class_name,
      teacher_name: c.teacher_name,
      room_name: c.room_name,
      is_cover_duty: false,
      cover_for_name: null,
    };
  });

  // Parent endpoint uses a single periods[] array that applies to every
  // weekday — expand into per-weekday period_slots so the review-style grid
  // has something to render (including any declared breaks/lunches will follow
  // once the parent endpoint surfaces period_type; for now all marked teaching).
  const periodSlots: PeriodSlot[] = [];
  for (const day of res.weekdays) {
    for (const p of res.periods) {
      periodSlots.push({
        weekday: day,
        period_order: p.order,
        start_time: formatTime(p.start_time),
        end_time: formatTime(p.end_time),
        period_type: 'teaching',
        year_group_id: null,
      });
    }
  }

  return {
    label: res.class_name,
    week_start: res.week_start,
    week_end: res.week_end,
    rotation_week_label: res.rotation_week_label,
    cells,
    period_slots: periodSlots,
    weekdays: res.weekdays,
    exam_session_active: res.exam_session_active === true,
    exam_session_message: res.exam_session_message,
  };
}

function buildWeekdays(cells: NormalizedCell[], slots: PeriodSlot[]): number[] {
  const set = new Set<number>();
  for (const c of cells) set.add(c.weekday);
  for (const s of slots) set.add(s.weekday);
  return [...set].sort((a, b) => a - b);
}

// ─── Rendering ─────────────────────────────────────────────────────────────────

function ExamSuspensionBanner({
  message,
  hasInvigilation,
}: {
  message: string;
  hasInvigilation: boolean;
}) {
  const t = useTranslations('scheduling.myTimetable');
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <Calendar className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium text-amber-800">{message}</p>
        {hasInvigilation ? (
          <p className="text-xs text-amber-700">{t('examInvigilationHint')}</p>
        ) : null}
      </div>
    </div>
  );
}

function CoverAlert({ cells }: { cells: NormalizedCell[] }) {
  const t = useTranslations('scheduling.myTimetable');
  const covers = cells.filter((c) => c.is_cover_duty);
  if (covers.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3">
      <AlertCircle className="h-4 w-4 shrink-0 text-warning-600 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium text-warning-800">{t('coverDutyAlert')}</p>
        {covers.map((c) => (
          <p key={c.schedule_id} className="text-xs text-warning-700">
            {c.start_time}: {t('coveringFor', { name: c.cover_for_name ?? '—' })}
          </p>
        ))}
      </div>
    </div>
  );
}

// Review-style grid — matches the post-generate run review UI. Rows are the
// union of period_order values across the week; each cell resolves its own
// day-accurate start/end via the period_slots grid, and break/lunch/free
// slots render as styled non-teaching rows so the grid no longer drops the
// school's break row (see `ClassTimetable` in runs/[id]/review/page.tsx).
function WeeklyGrid({
  data,
  todayWeekday,
  hideClassLabel,
  hideTeacherName,
}: {
  data: NormalizedTimetable;
  todayWeekday: number;
  hideClassLabel: boolean;
  hideTeacherName: boolean;
}) {
  const cellByKey = React.useMemo(() => {
    const m = new Map<string, NormalizedCell>();
    for (const c of data.cells) m.set(`${c.weekday}:${c.period_order}`, c);
    return m;
  }, [data.cells]);

  const slotByKey = React.useMemo(() => {
    const m = new Map<string, PeriodSlot>();
    for (const s of data.period_slots) m.set(`${s.weekday}:${s.period_order}`, s);
    return m;
  }, [data.period_slots]);

  const periodOrders = React.useMemo(() => {
    const set = new Set<number>();
    for (const s of data.period_slots) set.add(s.period_order);
    for (const c of data.cells) set.add(c.period_order);
    return [...set].sort((a, b) => a - b);
  }, [data.period_slots, data.cells]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[640px] table-fixed">
        <thead>
          <tr className="border-b border-border">
            {data.weekdays.map((day) => (
              <th
                key={day}
                className={`px-3 py-3 text-start text-xs font-semibold uppercase tracking-wider ${
                  day === todayWeekday ? 'text-primary' : 'text-text-tertiary'
                }`}
              >
                {WEEKDAY_SHORT[day] ?? `Day ${day}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periodOrders.map((period) => (
            <tr key={period} className="border-b border-border last:border-b-0">
              {data.weekdays.map((day) => {
                const entry = cellByKey.get(`${day}:${period}`);
                const slot = slotByKey.get(`${day}:${period}`);
                const isNonTeaching =
                  slot != null &&
                  (slot.period_type === 'break_supervision' ||
                    slot.period_type === 'lunch_duty' ||
                    slot.period_type === 'assembly' ||
                    slot.period_type === 'free');

                if (isNonTeaching && !entry) {
                  return (
                    <td key={day} className="px-2 py-1.5 align-top">
                      <div
                        className={`h-14 rounded-lg border border-dashed flex flex-col items-center justify-center text-[11px] font-semibold uppercase tracking-wide ${
                          slot.period_type === 'lunch_duty'
                            ? 'border-sky-200 bg-sky-50 text-sky-700'
                            : 'border-amber-200 bg-amber-50 text-amber-800'
                        }`}
                      >
                        <span>{periodTypeLabel(slot.period_type)}</span>
                        {slot.start_time && slot.end_time && (
                          <span className="font-mono text-[10px] font-normal opacity-75">
                            {slot.start_time}–{slot.end_time}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                }

                if (entry) {
                  const start = slot?.start_time || entry.start_time;
                  const end = slot?.end_time || entry.end_time;
                  return (
                    <td key={day} className="px-2 py-1.5 align-top">
                      <div
                        className={`rounded-lg px-2.5 py-2 text-xs ${
                          entry.is_exam_invigilation
                            ? 'bg-amber-50 border border-amber-200 text-amber-900'
                            : entry.is_cover_duty
                              ? 'bg-warning-50 border border-warning-200'
                              : 'bg-emerald-50 border border-dashed border-emerald-200'
                        }`}
                      >
                        {entry.subject_name && (
                          <div className="font-medium text-text-primary truncate">
                            {entry.subject_name}
                          </div>
                        )}
                        {!hideClassLabel && (
                          <div className="text-text-secondary truncate">{entry.class_name}</div>
                        )}
                        {!hideTeacherName && entry.teacher_name && (
                          <div className="text-text-secondary truncate">{entry.teacher_name}</div>
                        )}
                        {entry.room_name && (
                          <div className="text-text-tertiary truncate">{entry.room_name}</div>
                        )}
                        {(start || end) && (
                          <div className="font-mono text-[10px] text-text-tertiary mt-0.5 truncate">
                            {start}
                            {start && end ? '–' : ''}
                            {end}
                          </div>
                        )}
                      </div>
                    </td>
                  );
                }

                return (
                  <td key={day} className="px-2 py-1.5 align-top">
                    <div className="h-14 rounded-lg border border-dashed border-border/60 bg-background/40 flex items-center justify-center text-[10px] font-medium text-text-tertiary/70">
                      Free
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function periodTypeLabel(type: PeriodType): string {
  switch (type) {
    case 'break_supervision':
      return 'Break';
    case 'lunch_duty':
      return 'Lunch';
    case 'assembly':
      return 'Assembly';
    case 'free':
      return 'Free';
    default:
      return '';
  }
}

function DailyList({
  data,
  day,
  hideClassLabel,
  hideTeacherName,
}: {
  data: NormalizedTimetable;
  day: number;
  hideClassLabel: boolean;
  hideTeacherName: boolean;
}) {
  const t = useTranslations('scheduling.myTimetable');
  // Merge teaching cells + non-teaching slots into a single day-ordered list.
  const dayCells = data.cells.filter((c) => c.weekday === day);
  const daySlots = data.period_slots.filter(
    (s) =>
      s.weekday === day &&
      (s.period_type === 'break_supervision' ||
        s.period_type === 'lunch_duty' ||
        s.period_type === 'assembly'),
  );
  const cellMap = new Map(dayCells.map((c) => [c.period_order, c]));
  const slotMap = new Map(daySlots.map((s) => [s.period_order, s]));
  const orders = [...new Set([...cellMap.keys(), ...slotMap.keys()])].sort((a, b) => a - b);

  if (orders.length === 0) {
    return <p className="py-8 text-center text-sm text-text-secondary">{t('noPeriods')}</p>;
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => {
        const cell = cellMap.get(order);
        const slot = slotMap.get(order);
        if (cell) {
          const start = slot?.start_time || cell.start_time;
          const end = slot?.end_time || cell.end_time;
          return (
            <div
              key={`cell-${order}`}
              className={`rounded-xl border p-4 ${
                cell.is_exam_invigilation
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : cell.is_cover_duty
                    ? 'border-warning-200 bg-warning-50'
                    : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {cell.subject_name && (
                    <p className="text-sm font-semibold truncate">{cell.subject_name}</p>
                  )}
                  {!hideClassLabel && (
                    <p className="text-xs opacity-80 mt-0.5">{cell.class_name}</p>
                  )}
                  {!hideTeacherName && cell.teacher_name && (
                    <p className="text-xs opacity-75">{cell.teacher_name}</p>
                  )}
                  {cell.room_name && <p className="text-xs opacity-70">{cell.room_name}</p>}
                </div>
                <div className="text-end shrink-0">
                  {(start || end) && (
                    <p className="font-mono text-xs text-text-tertiary">
                      {start}
                      {start && end ? '–' : ''}
                      {end}
                    </p>
                  )}
                  {cell.is_cover_duty && (
                    <p className="text-xs text-warning-700 mt-0.5">{t('coverDutyBadge')}</p>
                  )}
                </div>
              </div>
            </div>
          );
        }
        if (slot) {
          return (
            <div
              key={`slot-${order}`}
              className={`rounded-xl border border-dashed px-4 py-3 text-xs font-semibold uppercase tracking-wide ${
                slot.period_type === 'lunch_duty'
                  ? 'border-sky-200 bg-sky-50 text-sky-700'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              <span>{periodTypeLabel(slot.period_type)}</span>
              {slot.start_time && slot.end_time && (
                <span className="ms-2 font-mono text-[10px] font-normal opacity-75">
                  {slot.start_time}–{slot.end_time}
                </span>
              )}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

// ─── Lookup picker ────────────────────────────────────────────────────────────

// Single-input combobox: user types, matches render inline as an autocomplete
// popover, Enter picks the top match. Replaces the old "search box filters a
// separate select dropdown" pattern, which required two clicks and confused
// admins who expected to type and hit Enter.
function LookupPicker({
  items,
  value,
  onChange,
  placeholder,
  loading,
}: {
  items: LookupItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  loading: boolean;
}) {
  const [q, setQ] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Keep the visible text in sync with the externally-selected value when it
  // changes (parent resets it on mode change, etc.).
  React.useEffect(() => {
    if (!value) {
      setQ('');
      return;
    }
    const match = items.find((i) => i.id === value);
    if (match) setQ(match.label);
  }, [value, items]);

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items.slice(0, 30);
    return items
      .filter(
        (i) => i.label.toLowerCase().includes(term) || (i.sub ?? '').toLowerCase().includes(term),
      )
      .slice(0, 30);
  }, [items, q]);

  // Close the popover on outside click.
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [q, open]);

  const handleSelect = (item: LookupItem) => {
    onChange(item.id);
    setQ(item.label);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = filtered[activeIndex] ?? filtered[0];
      if (pick) handleSelect(pick);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative max-w-md">
      <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
      <Input
        value={q}
        placeholder={loading ? '…' : placeholder}
        disabled={loading}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          // If the user types over an existing selection, clear it until
          // they re-select. Prevents the stale id from driving the grid
          // while the input no longer matches the chosen entity.
          if (value) onChange('');
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="ps-9"
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-[320px] overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
          <ul role="listbox">
            {filtered.map((i, idx) => (
              <li
                key={i.id}
                role="option"
                aria-selected={idx === activeIndex}
                onMouseDown={(e) => {
                  // Prevent the input from losing focus before onClick.
                  e.preventDefault();
                }}
                onClick={() => handleSelect(i)}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`px-3 py-2 text-sm cursor-pointer flex items-baseline justify-between gap-2 ${
                  idx === activeIndex
                    ? 'bg-surface-secondary text-text-primary'
                    : 'text-text-secondary hover:bg-surface-secondary/60'
                }`}
              >
                <span className="truncate">{i.label}</span>
                {i.sub ? (
                  <span className="text-xs text-text-tertiary truncate">{i.sub}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {open && q.trim() !== '' && filtered.length === 0 && !loading && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg px-3 py-2 text-sm text-text-tertiary">
          No matches
        </div>
      )}
    </div>
  );
}

// ─── Calendar subscription modal (unchanged) ──────────────────────────────────

function CalendarModal({
  open,
  onOpenChange,
  url,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  url: string;
}) {
  const t = useTranslations('scheduling.myTimetable');
  const [copied, setCopied] = React.useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('calendarSubscription')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-secondary">{t('calendarDesc')}</p>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-secondary p-3">
          <code className="flex-1 min-w-0 truncate text-xs text-text-primary">{url}</code>
          <Button size="sm" variant="outline" onClick={() => void handleCopy()}>
            <Copy className="h-3.5 w-3.5 me-1" />
            {copied ? t('copied') : t('copy')}
          </Button>
        </div>
        <p className="text-xs text-text-tertiary">{t('calendarHint')}</p>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyTimetablePage() {
  const t = useTranslations('scheduling.myTimetable');
  const { hasAnyRole, hasRole } = useRoleCheck();
  const isAdmin = hasAnyRole('school_owner', 'school_principal', 'school_vice_principal');
  const isTeacher = hasRole('teacher') && !isAdmin;
  const isStudent = hasRole('student') && !isTeacher && !isAdmin;
  const isParent = hasRole('parent') && !isStudent && !isTeacher && !isAdmin;

  const modes = React.useMemo<ViewMode[]>(() => {
    if (isAdmin) return ['class', 'teacher', 'student'];
    if (isTeacher) return ['mine', 'class'];
    if (isParent) return ['child'];
    return ['mine']; // student or fallback
  }, [isAdmin, isTeacher, isParent]);

  const [mode, setMode] = React.useState<ViewMode>(modes[0] ?? 'mine');
  const [selectedId, setSelectedId] = React.useState('');
  const [data, setData] = React.useState<NormalizedTimetable | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [mobileDay, setMobileDay] = React.useState<number>(new Date().getDay());
  const [calOpen, setCalOpen] = React.useState(false);
  const [calUrl, setCalUrl] = React.useState('');

  const [academicYearId, setAcademicYearId] = React.useState<string>('');
  const [classes, setClasses] = React.useState<LookupItem[]>([]);
  const [teachers, setTeachers] = React.useState<LookupItem[]>([]);
  const [students, setStudents] = React.useState<LookupItem[]>([]);
  const [children, setChildren] = React.useState<LookupItem[]>([]);
  const [pickerLoading, setPickerLoading] = React.useState(false);

  const todayWeekday = new Date().getDay();

  React.useEffect(() => {
    if (modes.length > 0 && !modes.includes(mode)) {
      setMode(modes[0]!);
      setSelectedId('');
    }
  }, [modes, mode]);

  const { weekStart, weekEnd, weekDateIso } = React.useMemo(() => {
    const today = new Date();
    const mondayOffset = (today.getDay() + 6) % 7;
    const ws = new Date(today);
    ws.setDate(today.getDate() - mondayOffset + weekOffset * 7);
    ws.setHours(0, 0, 0, 0);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    return { weekStart: ws, weekEnd: we, weekDateIso: we.toISOString().slice(0, 10) };
  }, [weekOffset]);

  React.useEffect(() => {
    if (!isAdmin && !isTeacher) return;
    apiClient<{ data: Array<{ id: string; name: string }> }>('/api/v1/academic-years?pageSize=20', {
      silent: true,
    })
      .then((res) => {
        const first = res.data?.[0];
        if (first) setAcademicYearId(first.id);
      })
      .catch((err) => {
        console.error('[MyTimetablePage]', err);
      });
  }, [isAdmin, isTeacher]);

  React.useEffect(() => {
    setPickerLoading(true);
    const load = async () => {
      try {
        if ((mode === 'class' || mode === 'teacher' || mode === 'student') && isAdmin) {
          if (mode === 'class' && classes.length === 0) {
            const res = await apiClient<{
              data: Array<{ id: string; name: string; subject?: { name: string } | null }>;
            }>('/api/v1/classes?pageSize=200&status=active');
            setClasses(
              (res.data ?? []).map((c) => ({
                id: c.id,
                label: c.name,
                sub: c.subject?.name ?? null,
              })),
            );
          } else if (mode === 'teacher' && teachers.length === 0) {
            const res = await apiClient<{
              data: Array<{ id: string; full_name: string; department?: string | null }>;
            }>('/api/v1/scheduling/teachers');
            setTeachers(
              (res.data ?? []).map((t) => ({
                id: t.id,
                label: t.full_name,
                sub: t.department ?? null,
              })),
            );
          } else if (mode === 'student' && students.length === 0) {
            // The students endpoint caps pageSize at 100; page through until
            // the backend returns less than a full page. Tenants with 200+
            // active students (NHQS has 214) need multiple requests.
            const collected: Array<{
              id: string;
              first_name: string;
              last_name: string;
              student_number: string | null;
            }> = [];
            let page = 1;
            const pageSize = 100;
            for (; page <= 20; page++) {
              const res = await apiClient<{
                data: Array<{
                  id: string;
                  first_name: string;
                  last_name: string;
                  student_number: string | null;
                }>;
              }>(`/api/v1/students?pageSize=${pageSize}&page=${page}&status=active`);
              const batch = res.data ?? [];
              collected.push(...batch);
              if (batch.length < pageSize) break;
            }
            setStudents(
              collected.map((s) => ({
                id: s.id,
                label: `${s.first_name} ${s.last_name}`.trim(),
                sub: s.student_number ?? null,
              })),
            );
          }
        } else if (mode === 'class' && isTeacher && classes.length === 0) {
          const res = await apiClient<{
            data: Array<{ id: string; name: string; subject?: { name: string } | null }>;
          }>('/api/v1/classes?pageSize=200&status=active');
          setClasses(
            (res.data ?? []).map((c) => ({
              id: c.id,
              label: c.name,
              sub: c.subject?.name ?? null,
            })),
          );
        } else if (mode === 'child' && isParent && children.length === 0) {
          const res = await apiClient<{
            students: Array<{ student_id: string; first_name: string; last_name: string }>;
          }>('/api/v1/dashboard/parent', { silent: true });
          const list = (res.students ?? []).map((s) => ({
            id: s.student_id,
            label: `${s.first_name} ${s.last_name}`.trim(),
          }));
          setChildren(list);
          if (list.length > 0 && !selectedId) setSelectedId(list[0]!.id);
        }
      } catch (err) {
        console.error('[MyTimetablePage]', err);
      } finally {
        setPickerLoading(false);
      }
    };
    void load();
  }, [
    mode,
    isAdmin,
    isTeacher,
    isParent,
    classes.length,
    teachers.length,
    students.length,
    children.length,
    selectedId,
  ]);

  const fetchTimetable = React.useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      if (mode === 'mine') {
        if (isStudent) {
          const res = await apiClient<ParentTimetableResponse>('/api/v1/parent/timetable/self', {
            silent: true,
          });
          setData(normalizeParentEndpoint(res));
        } else {
          const res = await apiClient<MyEndpointResponse>(
            `/api/v1/scheduling/timetable/my?week_date=${weekDateIso}`,
          );
          setData(normalizeMyEndpoint(res, weekStart, weekEnd));
        }
      } else if (mode === 'class' && selectedId && academicYearId) {
        const res = await apiClient<TimetableEnvelope>(
          `/api/v1/timetables/class/${selectedId}?academic_year_id=${academicYearId}&week_start=${weekDateIso}`,
        );
        setData(normalizeTimetableEntries(res, weekStart, weekEnd));
      } else if (mode === 'teacher' && selectedId && academicYearId) {
        const res = await apiClient<TimetableEnvelope>(
          `/api/v1/timetables/teacher/${selectedId}?academic_year_id=${academicYearId}&week_start=${weekDateIso}`,
        );
        setData(normalizeTimetableEntries(res, weekStart, weekEnd));
      } else if (mode === 'student' && selectedId && academicYearId) {
        const res = await apiClient<TimetableEnvelope>(
          `/api/v1/timetables/student/${selectedId}?academic_year_id=${academicYearId}&week_start=${weekDateIso}`,
        );
        setData(normalizeTimetableEntries(res, weekStart, weekEnd));
      } else if (mode === 'child' && selectedId) {
        const res = await apiClient<ParentTimetableResponse>(
          `/api/v1/parent/timetable?student_id=${selectedId}`,
          { silent: true },
        );
        setData(normalizeParentEndpoint(res));
      }
    } catch (err) {
      console.error('[MyTimetablePage]', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [mode, selectedId, academicYearId, weekDateIso, weekStart, weekEnd, isStudent]);

  React.useEffect(() => {
    const needsSelection = mode !== 'mine' && !selectedId;
    const needsAcademicYear =
      (mode === 'class' || mode === 'teacher' || mode === 'student') && !academicYearId;
    if (needsSelection || needsAcademicYear) {
      setData(null);
      setLoading(false);
      return;
    }
    void fetchTimetable();
  }, [fetchTimetable, mode, selectedId, academicYearId]);

  const handleExportCalendar = async () => {
    try {
      const res = await apiClient<{ url: string }>('/api/v1/calendar/subscription-url');
      setCalUrl(res.url);
      setCalOpen(true);
    } catch (err) {
      console.error('[MyTimetablePage]', err);
      toast.error(t('calendarError'));
    }
  };

  const handlePrint = () => window.print();

  const weekDateRange = data?.week_start
    ? `${new Date(data.week_start).toLocaleDateString()} – ${new Date(data.week_end ?? data.week_start).toLocaleDateString()}`
    : `${weekStart.toLocaleDateString()} – ${weekEnd.toLocaleDateString()}`;

  const pageDescription = (() => {
    if (isAdmin) return t('descriptionAdmin');
    if (isTeacher) return t('descriptionTeacher');
    if (isParent) return t('descriptionParent');
    return t('description');
  })();

  const lookupItems =
    mode === 'class'
      ? classes
      : mode === 'teacher'
        ? teachers
        : mode === 'student'
          ? students
          : mode === 'child'
            ? children
            : [];

  const pickerLabel = (() => {
    if (mode === 'class') return t('pickClass');
    if (mode === 'teacher') return t('pickTeacher');
    if (mode === 'student') return t('pickStudent');
    if (mode === 'child') return t('pickChild');
    return '';
  })();

  // Class-scoped views (class, student, child, mine-student) all filter to a
  // single class — no need to repeat the class label in every cell.
  // Teacher-scoped views ('teacher', 'mine' as teacher) benefit from class
  // labels because a teacher teaches across multiple classes.
  const hideClassLabel =
    mode === 'class' || mode === 'student' || mode === 'child' || (mode === 'mine' && isStudent);
  // Same logic for teacher names — when the viewer IS a teacher looking at
  // their own grid ('mine'), the teacher name is self-evident.
  const hideTeacherName = mode === 'teacher' || (mode === 'mine' && isTeacher);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={pageDescription}
        actions={
          !isAdmin && !isParent ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void handleExportCalendar()}>
                <Calendar className="h-4 w-4 me-2" />
                {t('exportCalendar')}
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 me-2" />
                {t('print')}
              </Button>
            </div>
          ) : null
        }
      />

      {/* Mode tabs (hidden for students) */}
      {modes.length > 1 && (
        <div className="flex gap-1 border-b border-border">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setSelectedId('');
                setData(null);
              }}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                mode === m
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {t(`mode.${m}`)}
            </button>
          ))}
        </div>
      )}

      {/* Picker */}
      {mode !== 'mine' && (
        <LookupPicker
          items={lookupItems}
          value={selectedId}
          onChange={setSelectedId}
          placeholder={pickerLabel}
          loading={pickerLoading}
        />
      )}

      {/* Week navigation */}
      {(mode === 'mine' || mode === 'class' || mode === 'teacher' || mode === 'student') &&
        !isStudent && (
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset((o) => o - 1)}>
              <ChevronLeft className="h-4 w-4 rtl:rotate-180 me-1" />
              {t('prevWeek')}
            </Button>
            <div className="flex items-center gap-2">
              {data?.rotation_week_label && (
                <Badge variant="secondary" className="text-sm px-3 py-1">
                  {data.rotation_week_label}
                </Badge>
              )}
              <span className="text-xs text-text-tertiary">{weekDateRange}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset((o) => o + 1)}>
              {t('nextWeek')}
              <ChevronRight className="h-4 w-4 rtl:rotate-180 ms-1" />
            </Button>
          </div>
        )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : !data ? (
        mode !== 'mine' && !selectedId ? (
          <p className="py-8 text-center text-sm text-text-secondary">{t('pickToBegin')}</p>
        ) : (
          <p className="py-8 text-center text-sm text-text-secondary">{t('noTimetable')}</p>
        )
      ) : (
        <>
          {data.label && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{data.label}</span>
            </div>
          )}

          {data.exam_session_active ? (
            <ExamSuspensionBanner
              message={data.exam_session_message ?? t('examSuspensionBanner')}
              hasInvigilation={data.cells.some((c) => c.is_exam_invigilation)}
            />
          ) : null}

          <CoverAlert cells={data.cells} />

          {data.exam_session_active && data.cells.length === 0 ? null : (
            <>
              <div className="hidden md:block print:block">
                <WeeklyGrid
                  data={data}
                  todayWeekday={todayWeekday}
                  hideClassLabel={hideClassLabel}
                  hideTeacherName={hideTeacherName}
                />
              </div>

              <div className="md:hidden">
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {data.weekdays.map((wd) => (
                    <button
                      key={wd}
                      type="button"
                      onClick={() => setMobileDay(wd)}
                      className={`flex-shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                        mobileDay === wd
                          ? 'bg-primary text-white'
                          : wd === todayWeekday
                            ? 'bg-primary/10 text-primary'
                            : 'bg-surface-secondary text-text-secondary hover:bg-surface'
                      }`}
                    >
                      {WEEKDAY_SHORT[wd] ?? wd}
                    </button>
                  ))}
                </div>
                <div className="mt-4">
                  <DailyList
                    data={data}
                    day={mobileDay}
                    hideClassLabel={hideClassLabel}
                    hideTeacherName={hideTeacherName}
                  />
                </div>
              </div>
            </>
          )}
        </>
      )}

      <CalendarModal open={calOpen} onOpenChange={setCalOpen} url={calUrl} />
    </div>
  );
}
