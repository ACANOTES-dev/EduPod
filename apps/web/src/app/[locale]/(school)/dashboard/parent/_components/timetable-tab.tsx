'use client';

import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimetableCell {
  weekday: number;
  period_order: number;
  period_name: string;
  subject_name: string;
  teacher_name: string | null;
  room_name: string | null;
}

interface ParentTimetableResponse {
  class_name: string;
  classroom_model: 'fixed_homeroom' | 'free_movement';
  rotation_week_label: string | null;
  week_start: string;
  week_end: string;
  weekdays: number[];
  periods: Array<{ order: number; name: string; start_time: string; end_time: string }>;
  cells: TimetableCell[];
}

interface Child {
  id: string;
  name: string;
}

interface TimetableTabProps {
  students: Child[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SUBJECT_COLOURS = [
  'bg-blue-50 text-blue-800 border-blue-200',
  'bg-purple-50 text-purple-800 border-purple-200',
  'bg-green-50 text-green-800 border-green-200',
  'bg-orange-50 text-orange-800 border-orange-200',
  'bg-pink-50 text-pink-800 border-pink-200',
  'bg-cyan-50 text-cyan-800 border-cyan-200',
  'bg-yellow-50 text-yellow-800 border-yellow-200',
  'bg-red-50 text-red-800 border-red-200',
];

function subjectColour(subjectName: string): string {
  let hash = 0;
  for (let i = 0; i < subjectName.length; i++) {
    hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SUBJECT_COLOURS[Math.abs(hash) % SUBJECT_COLOURS.length] ?? SUBJECT_COLOURS[0]!;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Component ────────────────────────────────────────────────────────────────

export function TimetableTab({ students }: TimetableTabProps) {
  const t = useTranslations('scheduling.parentTimetable');
  const [selectedChild, setSelectedChild] = React.useState(students[0]?.id ?? '');
  const [data, setData] = React.useState<ParentTimetableResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [mobileDay, setMobileDay] = React.useState<number>(new Date().getDay());

  const todayWeekday = new Date().getDay();

  React.useEffect(() => {
    if (!selectedChild) return;
    setLoading(true);
    apiClient<ParentTimetableResponse>(`/api/v1/parent/timetable?student_id=${selectedChild}`)
      .then((res) => setData(res))
      .catch((err) => { console.error('[TimetableTab]', err); return setData(null); })
      .finally(() => setLoading(false));
  }, [selectedChild]);

  // Set mobile day to today or first available weekday
  React.useEffect(() => {
    if (data && !data.weekdays.includes(todayWeekday) && data.weekdays.length > 0) {
      setMobileDay(data.weekdays[0]!);
    }
  }, [data, todayWeekday]);

  const cellMap = React.useMemo(() => {
    const map = new Map<string, TimetableCell>();
    if (data) {
      for (const c of data.cells) {
        map.set(`${c.weekday}-${c.period_order}`, c);
      }
    }
    return map;
  }, [data]);

  return (
    <div className="space-y-5">
      {/* Student selector */}
      {students.length > 1 && (
        <Select value={selectedChild} onValueChange={setSelectedChild}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('selectStudent')} />
          </SelectTrigger>
          <SelectContent>
            {students.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : !data ? (
        <p className="py-8 text-center text-sm text-text-secondary">{t('noTimetable')}</p>
      ) : (
        <>
          {/* Week info */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
            <span className="font-medium text-text-primary">{data.class_name}</span>
            {data.rotation_week_label && (
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {data.rotation_week_label}
              </span>
            )}
            <span className="text-text-tertiary">
              {new Date(data.week_start).toLocaleDateString()} –{' '}
              {new Date(data.week_end).toLocaleDateString()}
            </span>
          </div>

          {/* Desktop: weekly grid */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-20 border border-border bg-surface-secondary px-3 py-2 text-start text-xs font-semibold text-text-tertiary">
                    {t('period')}
                  </th>
                  {data.weekdays.map((wd) => (
                    <th
                      key={wd}
                      className={`border border-border px-3 py-2 text-center text-xs font-semibold ${
                        wd === todayWeekday
                          ? 'bg-primary/10 text-primary'
                          : 'bg-surface-secondary text-text-tertiary'
                      }`}
                    >
                      {WEEKDAY_SHORT[wd] ?? wd}
                      {wd === todayWeekday && (
                        <span className="ms-1 rounded-full bg-primary px-1 py-0.5 text-[9px] text-white">
                          {t('today')}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.periods.map((period) => (
                  <tr key={period.order}>
                    <td className="border border-border bg-surface-secondary px-3 py-2 text-xs font-medium text-text-secondary">
                      <p>{period.name}</p>
                      <p className="text-text-tertiary font-normal">{period.start_time}</p>
                    </td>
                    {data.weekdays.map((wd) => {
                      const cell = cellMap.get(`${wd}-${period.order}`);
                      const isToday = wd === todayWeekday;
                      return (
                        <td
                          key={wd}
                          className={`border border-border p-1.5 align-top ${isToday ? 'bg-primary/5' : 'bg-surface'}`}
                        >
                          {cell ? (
                            <div
                              className={`rounded-lg border p-2 text-xs space-y-0.5 ${subjectColour(cell.subject_name)}`}
                            >
                              <p className="font-semibold">{cell.subject_name}</p>
                              {cell.teacher_name && (
                                <p className="opacity-75">{cell.teacher_name}</p>
                              )}
                              {data.classroom_model === 'free_movement' && cell.room_name && (
                                <p className="opacity-60">{cell.room_name}</p>
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

          {/* Mobile: day tabs + list */}
          <div className="sm:hidden">
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
                        : 'bg-surface-secondary text-text-secondary'
                  }`}
                >
                  {WEEKDAY_SHORT[wd] ?? wd}
                </button>
              ))}
            </div>

            <div className="mt-3">
              <p className="mb-2 text-sm font-medium text-text-primary">
                {WEEKDAY_FULL[mobileDay] ?? ''}
              </p>
              <div className="space-y-2">
                {data.periods.map((period) => {
                  const cell = cellMap.get(`${mobileDay}-${period.order}`);
                  return (
                    <div
                      key={period.order}
                      className={`rounded-xl border p-3 ${
                        cell
                          ? subjectColour(cell.subject_name)
                          : 'border-border bg-surface-secondary'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {cell ? (
                            <>
                              <p className="text-sm font-semibold">{cell.subject_name}</p>
                              {cell.teacher_name && (
                                <p className="text-xs opacity-75 mt-0.5">{cell.teacher_name}</p>
                              )}
                              {data.classroom_model === 'free_movement' && cell.room_name && (
                                <p className="text-xs opacity-60">{cell.room_name}</p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-text-tertiary">{t('free')}</p>
                          )}
                        </div>
                        <div className="text-end shrink-0">
                          <p className="text-xs font-medium text-text-secondary">{period.name}</p>
                          <p className="text-xs text-text-tertiary">{period.start_time}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
