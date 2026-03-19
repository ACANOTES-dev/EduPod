'use client';

import { useCallback, useEffect, useState } from 'react';

import { CalendarDays, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { EmptyState, StatCard, StatusBadge } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface TimetableEntry {
  schedule_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  class_id: string;
  class_name: string;
  room_id?: string;
  room_name?: string;
}

interface SessionEntry {
  session: {
    id: string;
    class_id: string;
    status: string;
  };
  class_name: string;
  marked_count: number;
  enrolled_count: number;
}

interface TeacherDashboardData {
  greeting: string;
  todays_schedule: TimetableEntry[];
  todays_sessions: SessionEntry[];
  pending_submissions: number;
}

export default function TeacherDashboardPage() {
  const t = useTranslations('dashboard');
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await apiClient<{ data: TeacherDashboardData }>('/api/v1/dashboard/teacher', { silent: true });
      setData(result.data);
    } catch {
      // Fall back to empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  return (
    <div className="space-y-8">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {loading ? t('welcome') : data?.greeting ?? t('welcome')}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{t('teacherSummary')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('todaysLessons')} value={data?.todays_schedule?.length ?? 0} />
        <StatCard label={t('attendanceSessions')} value={data?.todays_sessions?.length ?? 0} />
        <StatCard label={t('pendingSubmissions')} value={data?.pending_submissions ?? 0} />
      </div>

      {/* Today's Schedule */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-text-primary">{t('todaysSchedule')}</h2>
        {loading ? (
          <div className="rounded-2xl bg-surface-secondary p-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-surface animate-pulse" />
            ))}
          </div>
        ) : data && data.todays_schedule.length > 0 ? (
          <div className="rounded-2xl bg-surface-secondary p-4 space-y-1">
            {data.todays_schedule.map((entry) => (
              <div
                key={entry.schedule_id}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-surface transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-text-tertiary w-24">
                    {entry.start_time} – {entry.end_time}
                  </span>
                  <span className="font-medium text-text-primary">{entry.class_name}</span>
                </div>
                {entry.room_name && (
                  <span className="text-xs text-text-tertiary">{entry.room_name}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title={t('noLessonsToday')}
            description={t('noLessonsTodayDesc')}
          />
        )}
      </section>

      {/* Attendance Sessions */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-text-primary">{t('attendanceSessions')}</h2>
        {loading ? (
          <div className="rounded-2xl bg-surface-secondary p-4 space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-surface animate-pulse" />
            ))}
          </div>
        ) : data && data.todays_sessions.length > 0 ? (
          <div className="rounded-2xl bg-surface-secondary p-4 space-y-1">
            {data.todays_sessions.map((entry) => (
              <Link
                key={entry.session.id}
                href={`/attendance/mark/${entry.session.id}`}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-surface transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-text-primary group-hover:text-primary-600 transition-colors">
                    {entry.class_name}
                  </span>
                  <StatusBadge
                    status={entry.session.status === 'open' ? 'warning' : 'success'}
                  >
                    {entry.session.status === 'open' ? 'Pending' : 'Submitted'}
                  </StatusBadge>
                </div>
                <span className="text-xs text-text-tertiary">
                  {entry.marked_count} / {entry.enrolled_count}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ClipboardCheck}
            title={t('noSessionsToday')}
            description={t('noSessionsTodayDesc')}
          />
        )}
      </section>
    </div>
  );
}
