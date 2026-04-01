'use client';

import { ChevronLeft, ChevronRight, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button } from '@school/ui';

import type { ScheduleEntry } from './schedule-grid';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeacherWorkload {
  teacherId: string;
  name: string;
  totalPeriods: number;
  supervisionDuties: number;
  maxPeriodsPerWeek: number | null;
  maxPeriodsPerDay: number | null;
  dailyBreakdown: Record<number, number>;
}

interface WorkloadSidebarProps {
  entries: ScheduleEntry[];
  teacherConfigs?: Array<{
    staff_profile_id: string;
    name: string;
    max_periods_per_week: number | null;
    max_periods_per_day: number | null;
  }>;
  onHighlightTeacher?: (teacherId: string | null) => void;
  highlightTeacherId?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAY_SHORT: Record<number, string> = {
  0: 'S',
  1: 'M',
  2: 'T',
  3: 'W',
  4: 'T',
  5: 'F',
  6: 'S',
};

function computeWorkloads(
  entries: ScheduleEntry[],
  configs?: WorkloadSidebarProps['teacherConfigs'],
): TeacherWorkload[] {
  const byTeacher = new Map<string, TeacherWorkload>();

  for (const entry of entries) {
    if (!entry.teacher_id || !entry.teacher_name) continue;

    let workload = byTeacher.get(entry.teacher_id);
    if (!workload) {
      const config = configs?.find((c) => c.staff_profile_id === entry.teacher_id);
      workload = {
        teacherId: entry.teacher_id,
        name: entry.teacher_name,
        totalPeriods: 0,
        supervisionDuties: 0,
        maxPeriodsPerWeek: config?.max_periods_per_week ?? null,
        maxPeriodsPerDay: config?.max_periods_per_day ?? null,
        dailyBreakdown: {},
      };
      byTeacher.set(entry.teacher_id, workload);
    }

    workload.totalPeriods += 1;
    workload.dailyBreakdown[entry.weekday] = (workload.dailyBreakdown[entry.weekday] ?? 0) + 1;
  }

  return Array.from(byTeacher.values()).sort((a, b) => b.totalPeriods - a.totalPeriods);
}

function loadColour(total: number, max: number | null): string {
  if (max === null) {
    // No limit set: use reasonable default thresholds
    if (total > 30) return 'text-red-600 dark:text-red-400';
    if (total > 20) return 'text-amber-600 dark:text-amber-400';
    return 'text-green-600 dark:text-green-400';
  }
  const ratio = total / max;
  if (ratio > 1) return 'text-red-600 dark:text-red-400';
  if (ratio >= 0.8) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function loadBgColour(total: number, max: number | null): string {
  if (max === null) {
    if (total > 30) return 'bg-red-100 dark:bg-red-900/20';
    if (total > 20) return 'bg-amber-100 dark:bg-amber-900/20';
    return 'bg-green-100 dark:bg-green-900/20';
  }
  const ratio = total / max;
  if (ratio > 1) return 'bg-red-100 dark:bg-red-900/20';
  if (ratio >= 0.8) return 'bg-amber-100 dark:bg-amber-900/20';
  return 'bg-green-100 dark:bg-green-900/20';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WorkloadSidebar({
  entries,
  teacherConfigs,
  onHighlightTeacher,
  highlightTeacherId,
}: WorkloadSidebarProps) {
  const t = useTranslations('scheduling');
  const [collapsed, setCollapsed] = React.useState(false);

  const workloads = React.useMemo(
    () => computeWorkloads(entries, teacherConfigs),
    [entries, teacherConfigs],
  );

  const maxDailyPeriods = React.useMemo(() => {
    let max = 0;
    for (const w of workloads) {
      for (const count of Object.values(w.dailyBreakdown)) {
        if (count > max) max = count;
      }
    }
    return max || 1;
  }, [workloads]);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-border bg-surface p-2 gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(false)}
          className="h-8 w-8 p-0"
          title={t('runs.workloadTitle')}
        >
          <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <User className="h-4 w-4 text-text-tertiary" />
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
          {workloads.length}
        </Badge>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-primary">{t('runs.workloadTitle')}</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(true)}
          className="h-7 w-7 p-0"
        >
          <ChevronRight className="h-4 w-4 rtl:rotate-180" />
        </Button>
      </div>

      {/* Teacher list */}
      <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
        {workloads.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-text-tertiary">
            {t('runs.noTeachers')}
          </div>
        )}

        {workloads.map((w) => {
          const isHighlighted = highlightTeacherId === w.teacherId;
          const colour = loadColour(w.totalPeriods, w.maxPeriodsPerWeek);
          const bgColour = loadBgColour(w.totalPeriods, w.maxPeriodsPerWeek);

          return (
            <button
              key={w.teacherId}
              type="button"
              onClick={() => {
                if (onHighlightTeacher) {
                  onHighlightTeacher(isHighlighted ? null : w.teacherId);
                }
              }}
              className={`w-full text-start px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-surface-secondary/50 transition-colors ${
                isHighlighted ? 'bg-brand/5 ring-1 ring-inset ring-brand/20' : ''
              }`}
            >
              {/* Name + total */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-primary truncate">{w.name}</span>
                <span
                  className={`text-xs font-mono font-semibold shrink-0 px-1.5 py-0.5 rounded ${bgColour} ${colour}`}
                >
                  {w.totalPeriods}
                  {w.maxPeriodsPerWeek != null && (
                    <span className="opacity-60">/{w.maxPeriodsPerWeek}</span>
                  )}
                </span>
              </div>

              {/* Daily mini-bar chart */}
              <div className="flex items-end gap-px mt-1.5 h-4">
                {[0, 1, 2, 3, 4].map((day) => {
                  const count = w.dailyBreakdown[day] ?? 0;
                  const height = maxDailyPeriods > 0 ? (count / maxDailyPeriods) * 100 : 0;
                  return (
                    <div
                      key={day}
                      className="flex-1 flex flex-col items-center gap-0"
                      title={`${WEEKDAY_SHORT[day]}: ${count}`}
                    >
                      <div
                        className={`w-full rounded-t-sm ${
                          count > 0 ? 'bg-brand/40' : 'bg-surface-secondary'
                        }`}
                        style={{ height: `${Math.max(height, 8)}%`, minHeight: '2px' }}
                      />
                    </div>
                  );
                })}
              </div>

              {/* Supervision count if any */}
              {w.supervisionDuties > 0 && (
                <div className="mt-1 text-[10px] text-text-tertiary">
                  {t('runs.supervisionCount', { count: w.supervisionDuties })}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
