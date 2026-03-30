'use client';

import { Button } from '@school/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CalendarHomework {
  id: string;
  title: string;
  homework_type: string;
  due_date: string;
}

interface HomeworkCalendarProps {
  month: number;
  year: number;
  homework: CalendarHomework[];
  onHomeworkClick: (id: string) => void;
  onMonthChange: (month: number, year: number) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const DOT_COLORS: Record<string, string> = {
  written: 'bg-blue-500',
  reading: 'bg-green-500',
  research: 'bg-purple-500',
  revision: 'bg-amber-500',
  project_work: 'bg-rose-500',
  online_activity: 'bg-cyan-500',
};

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOffset(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HomeworkCalendar({ month, year, homework, onHomeworkClick, onMonthChange }: HomeworkCalendarProps) {
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  const daysInMonth = getDaysInMonth(year, month);
  const offset = getFirstDayOffset(year, month);
  const today = new Date().toISOString().slice(0, 10);

  const hwByDate = React.useMemo(() => {
    const map: Record<string, CalendarHomework[]> = {};
    for (const h of homework) {
      const key = h.due_date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(h);
    }
    return map;
  }, [homework]);

  const handlePrev = () => {
    if (month === 0) onMonthChange(11, year - 1);
    else onMonthChange(month - 1, year);
  };

  const handleNext = () => {
    if (month === 11) onMonthChange(0, year + 1);
    else onMonthChange(month + 1, year);
  };

  const monthName = new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={handlePrev}>
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <span className="text-sm font-semibold text-text-primary">{monthName}</span>
        <Button variant="ghost" size="icon" onClick={handleNext}>
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-1 text-center text-xs font-semibold text-text-tertiary">{d}</div>
        ))}
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const items = hwByDate[dateStr] ?? [];
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;

          return (
            <button
              key={day}
              type="button"
              onClick={() => items.length > 0 && setSelectedDate(isSelected ? null : dateStr)}
              className={`flex min-h-[44px] flex-col items-center justify-start rounded-lg p-1 text-xs transition-colors ${
                isToday ? 'bg-primary-100 dark:bg-primary-900/20' : ''
              } ${isSelected ? 'ring-2 ring-primary-500' : ''} ${items.length > 0 ? 'cursor-pointer hover:bg-surface-secondary' : 'cursor-default'}`}
            >
              <span className={`font-medium ${isToday ? 'text-primary-600' : 'text-text-primary'}`}>{day}</span>
              {items.length > 0 && (
                <div className="mt-0.5 flex gap-0.5">
                  {items.slice(0, 3).map((h) => (
                    <span key={h.id} className={`h-1.5 w-1.5 rounded-full ${DOT_COLORS[h.homework_type] ?? 'bg-gray-400'}`} />
                  ))}
                  {items.length > 3 && <span className="text-[8px] text-text-tertiary">+{items.length - 3}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && hwByDate[selectedDate] && (
        <div className="rounded-xl border border-border p-3 space-y-1">
          {hwByDate[selectedDate].map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => onHomeworkClick(h.id)}
              className="w-full rounded-lg px-3 py-2 text-start text-sm font-medium text-text-primary hover:bg-surface-secondary transition-colors"
            >
              {h.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
