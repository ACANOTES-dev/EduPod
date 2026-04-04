'use client';

import { Moon, RefreshCw, Sun } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BoardSlot {
  absent_teacher_name: string;
  substitute_name: string | null;
  period_name: string;
  period_order: number;
  room_name: string | null;
  subject_name: string;
  class_name: string;
  status: 'unassigned' | 'assigned' | 'confirmed';
}

interface UpcomingAbsence {
  absence_date: string;
  teacher_name: string;
  full_day: boolean;
  period_from: number | null;
  period_to: number | null;
  assigned_count: number;
  total_slots: number;
}

interface BoardData {
  today_date: string;
  slots: BoardSlot[];
  upcoming: UpcomingAbsence[];
  school_name: string;
  school_logo_url: string | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubstitutionBoardPage() {
  const t = useTranslations('scheduling.board');
  const searchParams = useSearchParams();
  const isKiosk = searchParams?.get('kiosk') === 'true';

  const [dark, setDark] = React.useState(true);
  const [data, setData] = React.useState<BoardData | null>(null);
  const [lastRefresh, setLastRefresh] = React.useState<Date>(new Date());
  const [countdown, setCountdown] = React.useState(60);

  const fetchBoard = React.useCallback(async () => {
    try {
      const res = await apiClient<BoardData>('/api/v1/scheduling/substitution-board');
      setData(res);
      setLastRefresh(new Date());
      setCountdown(60);
    } catch (err) {
      console.error('[fetchBoard]', err);
    }
  }, []);

  // Initial fetch
  React.useEffect(() => {
    void fetchBoard();
  }, [fetchBoard]);

  // Auto-refresh every 60 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      void fetchBoard();
    }, 60_000);
    return () => clearInterval(interval);
  }, [fetchBoard]);

  // Countdown timer
  React.useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 60 : c - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [lastRefresh]);

  const bg = dark ? 'bg-gray-950 text-white' : 'bg-white text-gray-900';
  const cardBg = dark ? 'bg-gray-900 border-gray-800' : 'bg-gray-50 border-gray-200';
  const headerBg = dark ? 'bg-gray-900 border-gray-800' : 'bg-gray-100 border-gray-200';
  const rowHover = dark ? 'hover:bg-gray-800' : 'hover:bg-gray-100';
  const mutedText = dark ? 'text-gray-400' : 'text-gray-500';
  const borderColor = dark ? 'border-gray-800' : 'border-gray-200';

  const today = data?.today_date
    ? new Date(data.today_date).toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

  return (
    <div className={`min-h-screen ${bg} transition-colors duration-300`}>
      {/* Header — hidden in kiosk mode */}
      {!isKiosk && (
        <div className={`flex items-center justify-between border-b ${borderColor} px-8 py-4`}>
          <div className="flex items-center gap-4">
            {data?.school_logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.school_logo_url}
                alt={t('schoolLogo')}
                className="h-10 w-auto object-contain"
              />
            )}
            <div>
              <p className="text-sm font-semibold">{data?.school_name ?? t('schoolName')}</p>
              <p className={`text-xs ${mutedText}`}>{today}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 text-sm ${mutedText}`}>
              <RefreshCw className={`h-3.5 w-3.5 ${countdown <= 10 ? 'animate-spin' : ''}`} />
              <span>{t('refreshIn', { seconds: countdown })}</span>
            </div>
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              className={`rounded-lg border p-2 transition-colors ${dark ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`}
              aria-label={dark ? t('lightMode') : t('darkMode')}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="space-y-8 px-8 py-8">
        {/* Today's title */}
        <div>
          <h1 className="text-4xl font-bold tracking-tight">{t('todaysSubstitutions')}</h1>
          {isKiosk && <p className={`mt-1 text-lg ${mutedText}`}>{today}</p>}
        </div>

        {/* Today's substitutions table */}
        <div className={`overflow-hidden rounded-2xl border ${cardBg}`}>
          {!data || data.slots.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <p className={`text-xl ${mutedText}`}>{t('noSubstitutionsToday')}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className={`border-b ${borderColor} ${headerBg}`}>
                  {[
                    t('period'),
                    t('absentTeacher'),
                    t('substitute'),
                    t('subject'),
                    t('class'),
                    t('room'),
                    t('statusCol'),
                  ].map((h) => (
                    <th
                      key={h}
                      className={`px-6 py-4 text-start text-base font-semibold ${mutedText} uppercase tracking-wide`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data.slots]
                  .sort((a, b) => a.period_order - b.period_order)
                  .map((slot, i) => (
                    <tr
                      key={i}
                      className={`border-b ${borderColor} last:border-b-0 ${rowHover} transition-colors`}
                    >
                      <td className="px-6 py-5 text-xl font-bold">{slot.period_name}</td>
                      <td className="px-6 py-5 text-lg text-red-400">{slot.absent_teacher_name}</td>
                      <td className="px-6 py-5 text-lg font-semibold text-green-400">
                        {slot.substitute_name ?? (
                          <span className="text-yellow-400">{t('tbd')}</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-lg">{slot.subject_name}</td>
                      <td className="px-6 py-5 text-lg">{slot.class_name}</td>
                      <td className="px-6 py-5 text-lg">{slot.room_name ?? '—'}</td>
                      <td className="px-6 py-5">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                            slot.status === 'confirmed'
                              ? 'bg-green-900/50 text-green-300'
                              : slot.status === 'assigned'
                                ? 'bg-blue-900/50 text-blue-300'
                                : 'bg-yellow-900/50 text-yellow-300'
                          }`}
                        >
                          {slot.status}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Upcoming absences */}
        {data && data.upcoming.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">{t('upcomingAbsences')}</h2>
            <div className={`overflow-hidden rounded-2xl border ${cardBg}`}>
              <table className="w-full">
                <thead>
                  <tr className={`border-b ${borderColor} ${headerBg}`}>
                    {[t('date'), t('teacher'), t('coverage'), t('coverageStatus')].map((h) => (
                      <th
                        key={h}
                        className={`px-6 py-4 text-start text-base font-semibold ${mutedText} uppercase tracking-wide`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.upcoming.map((abs, i) => (
                    <tr
                      key={i}
                      className={`border-b ${borderColor} last:border-b-0 ${rowHover} transition-colors`}
                    >
                      <td className="px-6 py-4 text-lg font-medium">
                        {new Date(abs.absence_date).toLocaleDateString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>
                      <td className="px-6 py-4 text-lg">{abs.teacher_name}</td>
                      <td className="px-6 py-4 text-lg">
                        {abs.full_day ? t('fullDay') : t('partialDay')}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                            abs.assigned_count >= abs.total_slots
                              ? 'bg-green-900/50 text-green-300'
                              : abs.assigned_count > 0
                                ? 'bg-yellow-900/50 text-yellow-300'
                                : 'bg-red-900/50 text-red-300'
                          }`}
                        >
                          {abs.assigned_count}/{abs.total_slots} {t('covered')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer refresh indicator — kiosk mode */}
        {isKiosk && (
          <div className={`flex items-center justify-end gap-2 text-sm ${mutedText}`}>
            <RefreshCw className="h-3.5 w-3.5" />
            <span>{t('autoRefreshKiosk', { seconds: countdown })}</span>
          </div>
        )}
      </div>
    </div>
  );
}
