'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimetableEntry {
  schedule_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  class_id?: string;
  class_name: string;
  room_id?: string;
  room_name?: string;
  teacher_staff_id?: string;
  teacher_name?: string;
  subject_name?: string;
}

export interface CellLabel {
  primary: string;
  secondary?: string;
  tertiary?: string;
}

export interface TimetableGridProps {
  entries: TimetableEntry[];
  weekdays?: number[];
  getCellLabel?: (entry: TimetableEntry) => CellLabel;
  onEntryClick?: (entry: TimetableEntry) => void;
  printMode?: boolean;
  title?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUBJECT_COLORS = [
  'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800',
  'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800',
  'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-800',
  'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800',
  'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800',
  'bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-200 dark:border-cyan-800',
  'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-800',
  'bg-indigo-100 text-indigo-800 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-200 dark:border-indigo-800',
];

const FALLBACK_COLOR =
  'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/30 dark:text-gray-200 dark:border-gray-700';

const PRINT_CELL_COLOR = 'bg-white text-black border-gray-400';

function getSubjectColor(
  subjectName: string | undefined,
  colorMap: Map<string, string>,
  printMode: boolean,
): string {
  if (printMode) return PRINT_CELL_COLOR;
  if (!subjectName) return FALLBACK_COLOR;
  if (!colorMap.has(subjectName)) {
    colorMap.set(
      subjectName,
      SUBJECT_COLORS[colorMap.size % SUBJECT_COLORS.length] ?? SUBJECT_COLORS[0] ?? '',
    );
  }
  return colorMap.get(subjectName)!;
}

function formatTime(time: string): string {
  const parts = time.split(':');
  const hours = parts[0] ?? '0';
  const minutes = parts[1] ?? '00';
  const h = parseInt(hours, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${minutes} ${period}`;
}

function getTimeSlots(entries: TimetableEntry[]): string[] {
  const slots = new Set<string>();
  for (const entry of entries) {
    slots.add(entry.start_time);
  }
  return Array.from(slots).sort();
}

const DEFAULT_WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function defaultCellLabel(entry: TimetableEntry): CellLabel {
  return {
    primary: entry.subject_name ?? entry.class_name,
    secondary: entry.subject_name ? entry.class_name : undefined,
    tertiary: entry.room_name ?? entry.teacher_name,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TimetableGrid({
  entries,
  weekdays,
  getCellLabel = defaultCellLabel,
  onEntryClick,
  printMode = false,
  title,
}: TimetableGridProps) {
  const t = useTranslations('scheduling');
  const subjectColorMap = React.useMemo(() => new Map<string, string>(), []);

  const todayWeekday = new Date().getDay();
  const [mobileDay, setMobileDay] = React.useState<number>(todayWeekday);

  // Determine active weekdays: prop → inferred from entries → default
  const activeWeekdays = React.useMemo(() => {
    if (weekdays && weekdays.length > 0) return weekdays;
    const found = new Set<number>();
    for (const e of entries) found.add(e.weekday);
    if (found.size === 0) return DEFAULT_WEEKDAYS;
    return Array.from(found).sort((a, b) => a - b);
  }, [entries, weekdays]);

  React.useEffect(() => {
    if (!activeWeekdays.includes(mobileDay) && activeWeekdays.length > 0) {
      setMobileDay(activeWeekdays[0]!);
    }
  }, [activeWeekdays, mobileDay]);

  const dayLabels: Record<number, string> = {
    0: t('sunday'),
    1: t('monday'),
    2: t('tuesday'),
    3: t('wednesday'),
    4: t('thursday'),
    5: t('friday'),
    6: t('saturday'),
  };

  const timeSlots = getTimeSlots(entries);
  const cellMap = React.useMemo(() => {
    const map = new Map<string, TimetableEntry>();
    for (const e of entries) {
      map.set(`${e.weekday}-${e.start_time}`, e);
    }
    return map;
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface p-12">
        <p className="text-sm text-text-tertiary">{t('noTimetableEntriesToDisplay')}</p>
      </div>
    );
  }

  const interactive = Boolean(onEntryClick) && !printMode;

  // ─── Print mode: single table, no responsive switches ─────────────────────
  if (printMode) {
    return (
      <div className="bg-white text-black p-6 print:p-0">
        {title && <h2 className="text-xl font-semibold mb-4 text-black print:text-lg">{title}</h2>}
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="border border-gray-400 bg-gray-100 px-2 py-1.5 text-start font-semibold uppercase w-24">
                {t('startTime')}
              </th>
              {activeWeekdays.map((day) => (
                <th
                  key={day}
                  className="border border-gray-400 bg-gray-100 px-2 py-1.5 text-center font-semibold uppercase"
                >
                  {dayLabels[day]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((slot) => (
              <tr key={slot}>
                <td className="border border-gray-400 bg-gray-50 px-2 py-1.5 font-mono text-[11px] align-top whitespace-nowrap">
                  {formatTime(slot)}
                </td>
                {activeWeekdays.map((day) => {
                  const cell = cellMap.get(`${day}-${slot}`);
                  return (
                    <td key={day} className="border border-gray-400 p-1.5 align-top">
                      {cell ? (
                        <div className="text-[11px] leading-tight space-y-0.5">
                          <p className="font-semibold">{getCellLabel(cell).primary}</p>
                          {getCellLabel(cell).secondary && (
                            <p className="opacity-80">{getCellLabel(cell).secondary}</p>
                          )}
                          {getCellLabel(cell).tertiary && (
                            <p className="opacity-70">{getCellLabel(cell).tertiary}</p>
                          )}
                        </div>
                      ) : null}
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

  // ─── Interactive mode: desktop grid + mobile day list ─────────────────────
  return (
    <div className="space-y-4">
      {/* Desktop: weekly grid */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-24 border-b border-border bg-surface-secondary px-3 py-2.5 text-start text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                {t('startTime')}
              </th>
              {activeWeekdays.map((day) => (
                <th
                  key={day}
                  className={`border-b border-border px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider ${
                    day === todayWeekday
                      ? 'bg-primary/10 text-primary'
                      : 'bg-surface-secondary text-text-tertiary'
                  }`}
                >
                  {dayLabels[day]}
                  {day === todayWeekday && (
                    <span className="ms-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-white normal-case">
                      {t('today')}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {timeSlots.map((slot, idx) => (
              <tr key={slot} className={idx % 2 === 0 ? '' : 'bg-surface-secondary/30'}>
                <td className="border-t border-border bg-surface-secondary/60 px-3 py-2 align-top">
                  <p className="text-xs font-mono font-medium text-text-secondary">
                    {formatTime(slot)}
                  </p>
                </td>
                {activeWeekdays.map((day) => {
                  const cell = cellMap.get(`${day}-${slot}`);
                  const isToday = day === todayWeekday;
                  return (
                    <td
                      key={day}
                      className={`border-t border-border p-1.5 align-top ${isToday ? 'bg-primary/5' : ''}`}
                    >
                      {cell ? (
                        <button
                          type="button"
                          onClick={() => onEntryClick?.(cell)}
                          disabled={!interactive}
                          className={`w-full rounded-lg border px-2.5 py-2 text-start text-xs space-y-0.5 transition-all ${getSubjectColor(cell.subject_name, subjectColorMap, printMode)} ${
                            interactive
                              ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md'
                              : 'cursor-default'
                          }`}
                        >
                          <p className="font-semibold leading-tight">
                            {getCellLabel(cell).primary}
                          </p>
                          {getCellLabel(cell).secondary && (
                            <p className="opacity-85 text-[11px] leading-tight">
                              {getCellLabel(cell).secondary}
                            </p>
                          )}
                          {getCellLabel(cell).tertiary && (
                            <p className="opacity-70 text-[11px] leading-tight">
                              {getCellLabel(cell).tertiary}
                            </p>
                          )}
                        </button>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: day tabs + stacked cells */}
      <div className="sm:hidden">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {activeWeekdays.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => setMobileDay(day)}
              className={`flex-shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                mobileDay === day
                  ? 'bg-primary text-white'
                  : day === todayWeekday
                    ? 'bg-primary/10 text-primary'
                    : 'bg-surface-secondary text-text-secondary'
              }`}
            >
              {WEEKDAY_SHORT[day] ?? day}
            </button>
          ))}
        </div>

        <p className="mt-4 mb-2 text-sm font-medium text-text-primary">
          {WEEKDAY_FULL[mobileDay] ?? ''}
        </p>
        <div className="space-y-2">
          {timeSlots.map((slot) => {
            const cell = cellMap.get(`${mobileDay}-${slot}`);
            if (!cell) return null;
            return (
              <button
                key={`${mobileDay}-${slot}`}
                type="button"
                onClick={() => onEntryClick?.(cell)}
                disabled={!interactive}
                className={`w-full rounded-xl border px-4 py-3 text-start ${getSubjectColor(cell.subject_name, subjectColorMap, printMode)} ${
                  interactive ? 'cursor-pointer hover:shadow-md' : 'cursor-default'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{getCellLabel(cell).primary}</p>
                    {getCellLabel(cell).secondary && (
                      <p className="mt-0.5 text-xs opacity-85">{getCellLabel(cell).secondary}</p>
                    )}
                    {getCellLabel(cell).tertiary && (
                      <p className="mt-0.5 text-xs opacity-70">{getCellLabel(cell).tertiary}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs font-mono font-medium opacity-80">
                    {formatTime(cell.start_time)}
                  </p>
                </div>
              </button>
            );
          })}
          {timeSlots.every((slot) => !cellMap.get(`${mobileDay}-${slot}`)) && (
            <p className="py-8 text-center text-sm text-text-tertiary">{t('noPeriods')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
