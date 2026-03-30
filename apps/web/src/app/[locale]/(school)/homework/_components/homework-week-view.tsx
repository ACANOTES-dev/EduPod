'use client';

import { Button } from '@school/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeekHomework {
  id: string;
  title: string;
  homework_type: string;
  due_date: string;
  status: string;
}

interface HomeworkWeekViewProps {
  weekStart: string;
  homework: WeekHomework[];
  onHomeworkClick: (id: string) => void;
  onWeekChange: (newWeekStart: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const TYPE_BG: Record<string, string> = {
  written: 'bg-blue-100 border-blue-300 dark:bg-blue-900/30 dark:border-blue-700',
  reading: 'bg-green-100 border-green-300 dark:bg-green-900/30 dark:border-green-700',
  research: 'bg-purple-100 border-purple-300 dark:bg-purple-900/30 dark:border-purple-700',
  revision: 'bg-amber-100 border-amber-300 dark:bg-amber-900/30 dark:border-amber-700',
  project_work: 'bg-rose-100 border-rose-300 dark:bg-rose-900/30 dark:border-rose-700',
  online_activity: 'bg-cyan-100 border-cyan-300 dark:bg-cyan-900/30 dark:border-cyan-700',
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatShort(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HomeworkWeekView({ weekStart, homework, onHomeworkClick, onWeekChange }: HomeworkWeekViewProps) {
  const dates = DAYS.map((_, i) => addDays(weekStart, i));
  const today = new Date().toISOString().slice(0, 10);

  const byDay = React.useMemo(() => {
    const map: Record<string, WeekHomework[]> = {};
    for (const d of dates) map[d] = [];
    for (const h of homework) {
      const key = h.due_date.slice(0, 10);
      if (map[key]) map[key].push(h);
    }
    return map;
  }, [homework, dates]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => onWeekChange(addDays(weekStart, -7))}>
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <span className="text-sm font-medium text-text-primary">
          {formatShort(weekStart)} — {formatShort(addDays(weekStart, 4))}
        </span>
        <Button variant="ghost" size="icon" onClick={() => onWeekChange(addDays(weekStart, 7))}>
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        {dates.map((date, i) => (
          <div
            key={date}
            className={`min-h-[120px] rounded-xl border p-2 ${date === today ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/10' : 'border-border bg-surface-secondary'}`}
          >
            <p className="mb-2 text-xs font-semibold text-text-tertiary">{DAYS[i]} {formatShort(date)}</p>
            <div className="space-y-1">
              {(byDay[date] ?? []).map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => onHomeworkClick(h.id)}
                  className={`w-full truncate rounded-lg border px-2 py-1 text-start text-xs font-medium transition-colors hover:opacity-80 ${TYPE_BG[h.homework_type] ?? 'bg-gray-100 border-gray-300'}`}
                >
                  {h.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
