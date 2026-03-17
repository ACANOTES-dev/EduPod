'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimetableEntry {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  class_name: string;
  room_name?: string;
  teacher_name?: string;
  subject_name?: string;
}

interface TimetableGridProps {
  entries: TimetableEntry[];
  weekdays?: number[];
  onEntryClick?: (entry: TimetableEntry) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUBJECT_COLORS = [
  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
];

function getSubjectColor(subjectName: string | undefined, colorMap: Map<string, string>): string {
  if (!subjectName) return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
  if (!colorMap.has(subjectName)) {
    colorMap.set(subjectName, SUBJECT_COLORS[colorMap.size % SUBJECT_COLORS.length]);
  }
  return colorMap.get(subjectName)!;
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
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

// ─── Component ────────────────────────────────────────────────────────────────

export function TimetableGrid({ entries, weekdays = DEFAULT_WEEKDAYS, onEntryClick }: TimetableGridProps) {
  const t = useTranslations('scheduling');

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
  const subjectColorMap = React.useMemo(() => new Map<string, string>(), []);

  const getEntriesForSlot = (slot: string, day: number): TimetableEntry[] => {
    return entries.filter((e) => e.start_time === slot && e.weekday === day);
  };

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border bg-surface p-12">
        <p className="text-sm text-text-tertiary">No timetable entries to display</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary w-20">
              {t('startTime')}
            </th>
            {weekdays.map((day) => (
              <th
                key={day}
                className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary"
              >
                {dayLabels[day]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {timeSlots.map((slot) => (
            <tr key={slot} className="border-b border-border last:border-b-0">
              <td className="px-3 py-2 text-xs font-mono text-text-tertiary align-top whitespace-nowrap">
                {formatTime(slot)}
              </td>
              {weekdays.map((day) => {
                const cellEntries = getEntriesForSlot(slot, day);
                return (
                  <td key={day} className="px-2 py-1.5 align-top">
                    <div className="flex flex-col gap-1">
                      {cellEntries.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => onEntryClick?.(entry)}
                          className={`w-full rounded-lg px-2.5 py-1.5 text-start text-xs transition-opacity hover:opacity-80 ${getSubjectColor(entry.subject_name, subjectColorMap)} ${
                            onEntryClick ? 'cursor-pointer' : 'cursor-default'
                          }`}
                        >
                          <div className="font-medium">{entry.class_name}</div>
                          {entry.room_name && (
                            <div className="opacity-75">{entry.room_name}</div>
                          )}
                          {entry.teacher_name && (
                            <div className="opacity-75">{entry.teacher_name}</div>
                          )}
                        </button>
                      ))}
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
