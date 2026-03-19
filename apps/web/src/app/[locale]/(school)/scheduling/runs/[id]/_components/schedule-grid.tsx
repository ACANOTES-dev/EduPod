'use client';

import { GripVertical, Pin, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@school/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PeriodSlot {
  period_order: number;
  name: string;
  name_ar?: string | null;
  start_time: string;
  end_time: string;
  period_type: 'teaching' | 'break_supervision' | 'lunch_duty' | 'assembly' | 'free';
  supervision_mode?: 'none' | 'yard' | 'classroom_previous' | 'classroom_next';
}

export interface ScheduleEntry {
  id: string;
  year_group_id: string;
  class_id?: string;
  class_name?: string;
  subject_name: string;
  subject_name_ar?: string;
  teacher_name: string;
  teacher_id?: string;
  room_name?: string;
  weekday: number;
  period_order: number;
  is_pinned: boolean;
  is_manual?: boolean;
  source?: 'auto_generated' | 'manual' | 'pinned';
  // For break supervision
  supervision_teachers?: string[];
}

export interface CellViolation {
  tier: 1 | 2 | 3;
  code: string;
  message: string;
  message_ar?: string;
}

interface ScheduleGridProps {
  yearGroupId: string;
  entries: ScheduleEntry[];
  periodGrid: PeriodSlot[];
  weekdays?: number[];
  violations?: Record<string, CellViolation[]>;
  onEntryMove?: (entryId: string, toWeekday: number, toPeriodOrder: number) => void;
  onEntryAdd?: (weekday: number, periodOrder: number) => void;
  onEntryRemove?: (entryId: string) => void;
  onEntryContextMenu?: (entry: ScheduleEntry, event: React.MouseEvent) => void;
  highlightTeacherId?: string | null;
  readOnly?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS_EN: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

const WEEKDAY_LABELS_AR: Record<number, string> = {
  0: 'أحد',
  1: 'إثنين',
  2: 'ثلاثاء',
  3: 'أربعاء',
  4: 'خميس',
  5: 'جمعة',
  6: 'سبت',
};

function cellKey(yearGroupId: string, weekday: number, periodOrder: number): string {
  return `${yearGroupId}:${weekday}:${periodOrder}`;
}

function getViolationTier(violations: CellViolation[]): 1 | 2 | 3 | null {
  if (!violations.length) return null;
  if (violations.some((v) => v.tier === 1)) return 1;
  if (violations.some((v) => v.tier === 2)) return 2;
  return 3;
}

function violationOverlayClasses(tier: 1 | 2 | 3 | null): string {
  if (tier === 1 || tier === 2) return 'bg-red-50/60 dark:bg-red-900/20 ring-2 ring-red-400 dark:ring-red-600';
  if (tier === 3) return 'bg-amber-50/60 dark:bg-amber-900/20 ring-2 ring-amber-400 dark:ring-amber-600';
  return '';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleGrid({
  yearGroupId,
  entries,
  periodGrid,
  weekdays: weekdaysProp,
  violations,
  onEntryMove,
  onEntryAdd,
  onEntryRemove,
  onEntryContextMenu,
  highlightTeacherId,
  readOnly = false,
}: ScheduleGridProps) {
  const t = useTranslations('scheduling');
  const [draggedEntryId, setDraggedEntryId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{ weekday: number; periodOrder: number } | null>(null);
  const [locale, setLocale] = React.useState<string>('en');

  React.useEffect(() => {
    const htmlLang = document.documentElement.lang;
    setLocale(htmlLang === 'ar' ? 'ar' : 'en');
  }, []);

  const weekdayLabels = locale === 'ar' ? WEEKDAY_LABELS_AR : WEEKDAY_LABELS_EN;

  // Determine weekdays from the period grid or prop
  const weekdays = weekdaysProp ?? Array.from(
    new Set(periodGrid.map(() => null).length ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4])
  );
  const activeWeekdays = weekdaysProp ?? [0, 1, 2, 3, 4];

  // Sort period grid by order
  const sortedPeriods = [...periodGrid].sort((a, b) => a.period_order - b.period_order);

  // Index entries by weekday+periodOrder
  const entryIndex = React.useMemo(() => {
    const idx: Record<string, ScheduleEntry[]> = {};
    for (const entry of entries) {
      const key = `${entry.weekday}:${entry.period_order}`;
      if (!idx[key]) idx[key] = [];
      idx[key]!.push(entry);
    }
    return idx;
  }, [entries]);

  // ─── Drag and Drop ──────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, entry: ScheduleEntry) {
    if (readOnly || entry.is_pinned) {
      e.preventDefault();
      return;
    }
    setDraggedEntryId(entry.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', entry.id);
  }

  function handleDragOver(e: React.DragEvent, weekday: number, periodOrder: number) {
    if (readOnly) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget({ weekday, periodOrder });
  }

  function handleDragLeave() {
    setDropTarget(null);
  }

  function handleDrop(e: React.DragEvent, weekday: number, periodOrder: number) {
    e.preventDefault();
    setDropTarget(null);
    const entryId = e.dataTransfer.getData('text/plain') || draggedEntryId;
    setDraggedEntryId(null);
    if (entryId && onEntryMove) {
      onEntryMove(entryId, weekday, periodOrder);
    }
  }

  function handleDragEnd() {
    setDraggedEntryId(null);
    setDropTarget(null);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const gridCols = activeWeekdays.length + 1; // +1 for period labels column

  return (
    <TooltipProvider>
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <div
          className="min-w-[640px]"
          style={{
            display: 'grid',
            gridTemplateColumns: `120px repeat(${activeWeekdays.length}, 1fr)`,
            gridTemplateRows: `auto repeat(${sortedPeriods.length}, auto)`,
          }}
        >
          {/* Header: empty corner */}
          <div className="border-b border-e border-border px-3 py-3 bg-surface-secondary" />

          {/* Header: weekday labels */}
          {activeWeekdays.map((day) => (
            <div
              key={day}
              className="border-b border-e border-border px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-text-tertiary bg-surface-secondary last:border-e-0"
            >
              {weekdayLabels[day] ?? `Day ${day}`}
            </div>
          ))}

          {/* Body rows */}
          {sortedPeriods.map((period) => {
            const isBreak = period.period_type === 'break_supervision' || period.period_type === 'lunch_duty';
            const isFreeOrAssembly = period.period_type === 'assembly' || period.period_type === 'free';

            return (
              <React.Fragment key={period.period_order}>
                {/* Row header: period name + time */}
                <div
                  className={`border-b border-e border-border px-3 py-2 text-xs ${
                    isBreak
                      ? 'bg-amber-50/50 dark:bg-amber-900/10'
                      : isFreeOrAssembly
                        ? 'bg-gray-50/50 dark:bg-gray-800/20'
                        : ''
                  }`}
                >
                  <div className="font-medium text-text-primary">{period.name}</div>
                  <div className="text-text-tertiary font-mono mt-0.5">
                    {period.start_time} - {period.end_time}
                  </div>
                </div>

                {/* Cells for each weekday */}
                {activeWeekdays.map((day) => {
                  const key = `${day}:${period.period_order}`;
                  const cellEntries = entryIndex[key] ?? [];
                  const violationKey = cellKey(yearGroupId, day, period.period_order);
                  const cellViolations = violations?.[violationKey] ?? [];
                  const violationTier = getViolationTier(cellViolations);
                  const isDropping =
                    dropTarget?.weekday === day && dropTarget?.periodOrder === period.period_order;

                  return (
                    <div
                      key={key}
                      className={`border-b border-e border-border px-1.5 py-1.5 min-h-[56px] last:border-e-0 transition-colors ${
                        isBreak
                          ? 'bg-amber-50/30 dark:bg-amber-900/5'
                          : isFreeOrAssembly
                            ? 'bg-gray-50/30 dark:bg-gray-800/10'
                            : ''
                      } ${isDropping ? 'bg-brand/10 ring-2 ring-brand/30' : ''} ${
                        violationOverlayClasses(violationTier)
                      }`}
                      onDragOver={(e) => handleDragOver(e, day, period.period_order)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, day, period.period_order)}
                    >
                      <div className="flex flex-col gap-1">
                        {/* Break period display */}
                        {isBreak && cellEntries.length === 0 && (
                          <div className="rounded-lg px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-100/50 dark:bg-amber-900/20">
                            <div className="font-medium">
                              {period.supervision_mode === 'yard'
                                ? t('runs.supervision')
                                : period.supervision_mode === 'classroom_next'
                                  ? t('runs.nextTeacher')
                                  : period.supervision_mode === 'classroom_previous'
                                    ? t('runs.prevTeacher')
                                    : t('runs.breakPeriod')}
                            </div>
                          </div>
                        )}

                        {/* Teaching entries */}
                        {cellEntries.map((entry) => {
                          const isDragging = draggedEntryId === entry.id;
                          const isHighlighted =
                            highlightTeacherId != null &&
                            entry.teacher_id === highlightTeacherId;

                          return (
                            <Tooltip key={entry.id}>
                              <TooltipTrigger asChild>
                                <div
                                  draggable={!readOnly && !entry.is_pinned}
                                  onDragStart={(e) => handleDragStart(e, entry)}
                                  onDragEnd={handleDragEnd}
                                  onContextMenu={(e) => {
                                    if (onEntryContextMenu) {
                                      e.preventDefault();
                                      onEntryContextMenu(entry, e);
                                    }
                                  }}
                                  className={`relative rounded-lg px-2.5 py-1.5 text-xs transition-all ${
                                    entry.is_pinned
                                      ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-600'
                                      : entry.is_manual
                                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-300 dark:border-emerald-600'
                                        : 'bg-blue-50 dark:bg-blue-900/20 border border-dashed border-blue-300 dark:border-blue-600'
                                  } ${isDragging ? 'opacity-40' : ''} ${
                                    isHighlighted ? 'ring-2 ring-brand shadow-sm' : ''
                                  } ${
                                    !readOnly && !entry.is_pinned ? 'cursor-grab active:cursor-grabbing' : ''
                                  }`}
                                >
                                  {/* Subject */}
                                  <div className="font-medium text-text-primary pe-6 truncate">
                                    {entry.subject_name}
                                  </div>
                                  {/* Teacher */}
                                  <div className="text-text-secondary truncate">
                                    {entry.teacher_name}
                                  </div>
                                  {/* Room */}
                                  {entry.room_name && (
                                    <div className="text-text-tertiary truncate">
                                      {entry.room_name}
                                    </div>
                                  )}

                                  {/* Icons */}
                                  <div className="absolute top-1 end-1 flex items-center gap-0.5">
                                    {entry.is_pinned && (
                                      <Pin className="h-2.5 w-2.5 text-amber-500" />
                                    )}
                                    {!readOnly && !entry.is_pinned && (
                                      <GripVertical className="h-3 w-3 text-text-tertiary opacity-50" />
                                    )}
                                  </div>
                                </div>
                              </TooltipTrigger>
                              {cellViolations.length > 0 && (
                                <TooltipContent side="top" className="max-w-xs">
                                  <div className="space-y-1">
                                    {cellViolations.map((v, i) => (
                                      <div key={i} className="text-xs">
                                        <span
                                          className={`inline-block w-1.5 h-1.5 rounded-full me-1.5 ${
                                            v.tier <= 2 ? 'bg-red-400' : 'bg-amber-400'
                                          }`}
                                        />
                                        {v.message}
                                      </div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          );
                        })}

                        {/* Break supervision entries */}
                        {isBreak && cellEntries.length > 0 && (
                          <div className="rounded-lg px-2 py-1.5 text-xs bg-amber-100/50 dark:bg-amber-900/20">
                            <div className="font-medium text-amber-700 dark:text-amber-400">
                              {t('runs.supervision')}
                            </div>
                            {cellEntries.map((e) => (
                              <div key={e.id} className="text-amber-600 dark:text-amber-300 truncate">
                                {e.teacher_name}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Empty teaching slot */}
                        {cellEntries.length === 0 && !isBreak && !isFreeOrAssembly && (
                          <div
                            className={`h-10 rounded-lg border border-dashed border-border bg-transparent flex items-center justify-center ${
                              !readOnly ? 'cursor-pointer hover:bg-surface-secondary/50' : ''
                            }`}
                            onClick={() => {
                              if (!readOnly && onEntryAdd) {
                                onEntryAdd(day, period.period_order);
                              }
                            }}
                          >
                            {!readOnly && (
                              <Plus className="h-3.5 w-3.5 text-text-tertiary" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
