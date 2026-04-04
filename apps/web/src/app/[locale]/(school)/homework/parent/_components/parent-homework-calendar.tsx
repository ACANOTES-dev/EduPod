'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge } from '@school/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  homework_type: string;
  due_date: string;
  due_time: string | null;
  max_points: number | null;
  subject: { id: string; name: string } | null;
  class_entity: { id: string; name: string };
  completion: {
    status: string;
    completed_at: string | null;
    points_awarded: number | null;
  } | null;
}

interface ParentHomeworkCalendarProps {
  assignments: Assignment[];
  month: number; // 0-11
  year: number;
  onMonthChange: (month: number, year: number) => void;
}

// ─── Type colours ─────────────────────────────────────────────────────────────

const TYPE_DOT_COLOURS: Record<string, string> = {
  written: 'bg-blue-500',
  reading: 'bg-green-500',
  research: 'bg-purple-500',
  revision: 'bg-amber-500',
  project_work: 'bg-indigo-500',
  online_activity: 'bg-cyan-500',
};

const TYPE_PILL_COLOURS: Record<string, string> = {
  written: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  reading: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  research: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  revision: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  project_work: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  online_activity: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Monday = 0, Sunday = 6
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;
  const totalDays = lastDay.getDate();
  return { startDow, totalDays };
}

function formatMonthYear(year: number, month: number): string {
  const date = new Date(year, month, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function isToday(year: number, month: number, day: number): boolean {
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ParentHomeworkCalendar({
  assignments,
  month,
  year,
  onMonthChange,
}: ParentHomeworkCalendarProps) {
  const t = useTranslations('homework');
  const [expandedDay, setExpandedDay] = React.useState<number | null>(null);

  // Group assignments by day of month
  const assignmentsByDay = React.useMemo(() => {
    const map = new Map<number, Assignment[]>();
    for (const a of assignments) {
      const d = new Date(a.due_date);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        const list = map.get(day) ?? [];
        list.push(a);
        map.set(day, list);
      }
    }
    return map;
  }, [assignments, month, year]);

  const { startDow, totalDays } = getMonthDays(year, month);

  const DAY_LABELS = [
    t('parent.calendar.mon'),
    t('parent.calendar.tue'),
    t('parent.calendar.wed'),
    t('parent.calendar.thu'),
    t('parent.calendar.fri'),
    t('parent.calendar.sat'),
    t('parent.calendar.sun'),
  ];

  const handlePrevMonth = () => {
    if (month === 0) onMonthChange(11, year - 1);
    else onMonthChange(month - 1, year);
  };

  const handleNextMonth = () => {
    if (month === 11) onMonthChange(0, year + 1);
    else onMonthChange(month + 1, year);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="rounded-lg p-2 text-text-secondary hover:bg-surface-secondary transition-colors"
        >
          <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
        </button>
        <h3 className="text-sm font-semibold text-text-primary">{formatMonthYear(year, month)}</h3>
        <button
          type="button"
          onClick={handleNextMonth}
          className="rounded-lg p-2 text-text-secondary hover:bg-surface-secondary transition-colors"
        >
          <ChevronRight className="h-5 w-5 rtl:rotate-180" />
        </button>
      </div>

      {/* Desktop grid (hidden on mobile) */}
      <div className="hidden md:block">
        {/* Day headers */}
        <div className="grid grid-cols-7 gap-px">
          {DAY_LABELS.map((label) => (
            <div key={label} className="py-2 text-center text-xs font-medium text-text-tertiary">
              {label}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-px rounded-xl border border-border overflow-hidden">
          {/* Empty cells before first day */}
          {Array.from({ length: startDow }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[80px] bg-surface-secondary/50 p-1" />
          ))}

          {/* Day cells */}
          {Array.from({ length: totalDays }).map((_, i) => {
            const day = i + 1;
            const dayAssignments = assignmentsByDay.get(day) ?? [];
            const today = isToday(year, month, day);

            return (
              <button
                key={day}
                type="button"
                onClick={() => setExpandedDay(expandedDay === day ? null : day)}
                className={`min-h-[80px] bg-surface p-1.5 text-start transition-colors hover:bg-surface-secondary ${
                  expandedDay === day ? 'ring-2 ring-primary-600' : ''
                }`}
              >
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    today ? 'bg-primary-600 text-white' : 'text-text-primary'
                  }`}
                >
                  {day}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayAssignments.slice(0, 3).map((a) => (
                    <div
                      key={a.id}
                      className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${
                        TYPE_PILL_COLOURS[a.homework_type] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {a.title}
                    </div>
                  ))}
                  {dayAssignments.length > 3 && (
                    <span className="text-[10px] text-text-tertiary">
                      +{dayAssignments.length - 3}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Expanded day detail */}
        {expandedDay != null && (assignmentsByDay.get(expandedDay) ?? []).length > 0 && (
          <div className="mt-2 rounded-xl border border-border bg-surface p-4">
            <h4 className="mb-3 text-sm font-semibold text-text-primary">
              {expandedDay} {formatMonthYear(year, month)}
            </h4>
            <div className="space-y-2">
              {(assignmentsByDay.get(expandedDay) ?? []).map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-3 rounded-lg bg-surface-secondary p-3"
                >
                  <div
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      TYPE_DOT_COLOURS[a.homework_type] ?? 'bg-gray-400'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-primary">{a.title}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {a.subject && (
                        <Badge variant="secondary" className="text-xs">
                          {a.subject.name}
                        </Badge>
                      )}
                      <span className="text-xs text-text-tertiary">{a.class_entity.name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mobile list view */}
      <div className="md:hidden space-y-3">
        {Array.from({ length: totalDays }).map((_, i) => {
          const day = i + 1;
          const dayAssignments = assignmentsByDay.get(day) ?? [];
          if (dayAssignments.length === 0) return null;
          const today = isToday(year, month, day);

          return (
            <div key={day} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    today ? 'bg-primary-600 text-white' : 'bg-surface-secondary text-text-primary'
                  }`}
                >
                  {day}
                </span>
                <span className="text-xs text-text-tertiary">
                  {dayAssignments.length}{t('item')}{dayAssignments.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-1.5">
                {dayAssignments.map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        TYPE_DOT_COLOURS[a.homework_type] ?? 'bg-gray-400'
                      }`}
                    />
                    <span className="text-sm text-text-primary truncate">{a.title}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
