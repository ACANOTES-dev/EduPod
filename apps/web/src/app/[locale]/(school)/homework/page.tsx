'use client';

import { BookOpen, LayoutGrid, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { EmptyState, StatCard } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { HomeworkCard } from './_components/homework-card';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HomeworkItem {
  id: string;
  title: string;
  homework_type: string;
  due_date: string;
  due_time?: string;
  status: string;
  class_entity?: { id: string; name: string };
  subject?: { id: string; name: string };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomeworkDashboardPage() {
  const t = useTranslations('homework');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [todayItems, setTodayItems] = React.useState<HomeworkItem[]>([]);
  const [recentItems, setRecentItems] = React.useState<HomeworkItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [todayRes, recentRes] = await Promise.all([
        apiClient<{ data: HomeworkItem[] }>('/api/v1/homework/today', { silent: true }),
        apiClient<{ data: HomeworkItem[] }>(
          '/api/v1/homework?status=published&sort=created_at&order=desc&pageSize=5',
          { silent: true },
        ),
      ]);
      setTodayItems(todayRes.data ?? []);
      setRecentItems(recentRes.data ?? []);
    } catch (err) {
      console.error('[HomeworkDashboard] Failed to fetch data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('title')}
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/${locale}/homework/my-classes`}>
              <span className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-primary px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-secondary transition-colors">
                <LayoutGrid className="h-4 w-4" />
                {t('myClasses.title')}
              </span>
            </Link>
            <Link href={`/${locale}/homework/new`}>
              <span className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
                <Plus className="h-4 w-4" />
                {t('setHomework')}
              </span>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('todaysAssignments')} value={todayItems.length} />
        <StatCard label={t('pendingReview')} value={0} />
        <StatCard label={t('thisWeek')} value={todayItems.length + recentItems.length} />
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold text-text-primary">{t('todaysAssignments')}</h2>
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-2xl bg-surface-secondary animate-pulse" />
            ))}
          </div>
        ) : todayItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {todayItems.map((item) => (
              <HomeworkCard
                key={item.id}
                id={item.id}
                title={item.title}
                class_name={item.class_entity?.name ?? ''}
                subject_name={item.subject?.name}
                homework_type={item.homework_type}
                due_date={item.due_date}
                status={item.status}
                onClick={() => {
                  window.location.href = `/${locale}/homework/${item.id}`;
                }}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title={t('noHomeworkToday')}
            description={t('noHomeworkTodayDesc')}
          />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-text-primary">{t('recentlyPublished')}</h2>
        {!loading && recentItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentItems.map((item) => (
              <HomeworkCard
                key={item.id}
                id={item.id}
                title={item.title}
                class_name={item.class_entity?.name ?? ''}
                subject_name={item.subject?.name}
                homework_type={item.homework_type}
                due_date={item.due_date}
                status={item.status}
                onClick={() => {
                  window.location.href = `/${locale}/homework/${item.id}`;
                }}
              />
            ))}
          </div>
        ) : !loading ? (
          <EmptyState icon={BookOpen} title={t('noRecentHomework')} description="" />
        ) : null}
      </section>
    </div>
  );
}
