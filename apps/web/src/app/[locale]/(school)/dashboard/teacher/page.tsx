'use client';

import { BookOpen, CalendarDays, ClipboardCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, StatCard, StatusBadge } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface HomeworkItem {
  id: string;
  title: string;
  homework_type: string;
  class_name: string;
}

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
  const t = useTranslations();
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [homeworkData, setHomeworkData] = useState<{ today: HomeworkItem[]; unverified: number }>({
    today: [],
    unverified: 0,
  });
  const [homeworkLoading, setHomeworkLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await apiClient<{ data: TeacherDashboardData }>('/api/v1/dashboard/teacher', {
        silent: true,
      });
      setData(result.data);
    } catch (err) {
      console.error('[fetchDashboard]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHomework = useCallback(async () => {
    try {
      const [todayRes, unverifiedRes] = await Promise.all([
        apiClient<{ data: HomeworkItem[] }>('/api/v1/homework/today', { silent: true }),
        apiClient<{ count: number }>('/api/v1/homework/completions/unverified', { silent: true }),
      ]);
      setHomeworkData({
        today: todayRes.data ?? [],
        unverified: unverifiedRes.count ?? 0,
      });
    } catch {
      console.error('[Dashboard] Failed to fetch homework');
    } finally {
      setHomeworkLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
    void fetchHomework();
  }, [fetchDashboard, fetchHomework]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {loading ? t('dashboard.welcome') : (data?.greeting ?? t('dashboard.welcome'))}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{t('dashboard.teacherSummary')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('dashboard.todaysLessons')} value={data?.todays_schedule?.length ?? 0} />
        <StatCard
          label={t('dashboard.attendanceSessions')}
          value={data?.todays_sessions?.length ?? 0}
        />
        <StatCard
          label={t('dashboard.pendingSubmissions')}
          value={data?.pending_submissions ?? 0}
        />
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold text-text-primary">
          {t('dashboard.todaysSchedule')}
        </h2>
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
            title={t('dashboard.noLessonsToday')}
            description={t('dashboard.noLessonsTodayDesc')}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-text-primary">
          {t('dashboard.attendanceSessions')}
        </h2>
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
                  <StatusBadge status={entry.session.status === 'open' ? 'warning' : 'success'}>
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
            title={t('dashboard.noSessionsToday')}
            description={t('dashboard.noSessionsTodayDesc')}
          />
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">
            {t('homework.dashboardCard.title')}
          </h2>
          {homeworkData.unverified > 0 && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
              {homeworkData.unverified} {t('homework.dashboardCard.unverified')}
            </span>
          )}
        </div>
        {homeworkLoading ? (
          <div className="rounded-2xl bg-surface-secondary p-4 space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-surface animate-pulse" />
            ))}
          </div>
        ) : homeworkData.today.length > 0 ? (
          <div className="rounded-2xl bg-surface-secondary p-4 space-y-1">
            {homeworkData.today.slice(0, 5).map((item) => (
              <Link
                key={item.id}
                href={`/homework/${item.id}`}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm hover:bg-surface transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-text-primary group-hover:text-primary-600 transition-colors">
                    {item.title}
                  </span>
                  <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                    {item.homework_type}
                  </span>
                </div>
                <span className="text-xs text-text-tertiary">{item.class_name}</span>
              </Link>
            ))}
            <div className="mt-2 flex justify-end">
              <Link
                href="/homework"
                className="text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                {t('homework.dashboardCard.viewAll')} →
              </Link>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title={t('homework.noHomeworkToday')}
            description={t('homework.noHomeworkTodayDesc')}
          />
        )}
      </section>
    </div>
  );
}
