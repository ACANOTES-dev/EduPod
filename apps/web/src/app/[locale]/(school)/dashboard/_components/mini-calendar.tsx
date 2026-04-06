'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function getCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Day of week: 0=Sun, we want 0=Mon
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const daysInMonth = lastDay.getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { day: number; currentMonth: boolean }[] = [];

  // Previous month padding
  for (let i = startDow - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, currentMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, currentMonth: true });
  }

  // Next month padding
  const remaining = 42 - cells.length; // 6 rows x 7
  for (let d = 1; d <= remaining; d++) {
    cells.push({ day: d, currentMonth: false });
  }

  return cells;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise a Date or ISO string to "YYYY-MM-DD" for quick Set lookups. */
function toDateKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface MiniCalendarProps {
  /** ISO date strings (or Date objects) that have at least one event. */
  eventDates?: Array<string | Date>;
}

export function MiniCalendar({ eventDates = [] }: MiniCalendarProps) {
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = useMemo(() => getCalendarDays(year, month), [year, month]);

  const monthLabel = new Intl.DateTimeFormat('en', { month: 'long' }).format(viewDate);

  const prev = useCallback(() => {
    setViewDate(new Date(year, month - 1, 1));
  }, [year, month]);

  const next = useCallback(() => {
    setViewDate(new Date(year, month + 1, 1));
  }, [year, month]);

  const isToday = (day: number, currentMonth: boolean) =>
    currentMonth &&
    day === today.getDate() &&
    month === today.getMonth() &&
    year === today.getFullYear();

  // Build a Set of "YYYY-MM-DD" keys for O(1) lookup
  const eventDateSet = useMemo(() => new Set(eventDates.map(toDateKey)), [eventDates]);

  const todayKey = useMemo(() => toDateKey(today), [today]);

  /** Check if a cell date has an event. */
  const hasEvent = (day: number, currentMonth: boolean): boolean => {
    if (!currentMonth) return false;
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return eventDateSet.has(key);
  };

  /** Check if a cell date is in the past (before today). */
  const isPast = (day: number): boolean => {
    const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return key < todayKey;
  };

  // Only show 5 rows if 42-cell grid has an empty last row
  const cell35 = cells[35];
  const rowCount = cells.length > 35 && cell35 && !cell35.currentMonth && cell35.day === 1 ? 5 : 6;
  const displayCells = cells.slice(0, rowCount * 7);

  return (
    <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[16px] font-semibold text-text-primary">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prev}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={next}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0 mb-1">
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            className="flex h-8 items-center justify-center text-[11px] font-medium text-text-tertiary"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0">
        {displayCells.map((cell, i) => {
          const cellIsToday = isToday(cell.day, cell.currentMonth);
          const cellHasEvent = hasEvent(cell.day, cell.currentMonth);
          const cellIsPast = isPast(cell.day);

          return (
            <div
              key={i}
              className={`flex h-9 w-full flex-col items-center justify-center rounded-full transition-colors ${
                cellIsToday
                  ? 'bg-primary-600 text-white font-bold'
                  : cell.currentMonth
                    ? 'text-text-primary font-medium hover:bg-surface-secondary cursor-pointer'
                    : 'text-text-tertiary/50'
              }`}
            >
              <span className="text-[12px] leading-none">{cell.day}</span>
              {cellHasEvent && (
                <span
                  className={`mt-0.5 inline-block h-1 w-1 rounded-full ${
                    cellIsToday ? 'bg-white' : cellIsPast ? 'bg-text-tertiary/40' : 'bg-primary-600'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
