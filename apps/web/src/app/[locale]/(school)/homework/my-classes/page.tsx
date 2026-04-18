'use client';

import { AlertCircle, BookOpen, ChevronRight, ClipboardCheck, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { EmptyState } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MyClassRow {
  class_id: string;
  class_name: string;
  subject_id: string | null;
  subject_name: string | null;
  year_group_id: string | null;
  year_group_name: string | null;
  periods_per_week: number;
  active_homework_count: number;
  overdue_homework_count: number;
  pending_grading_count: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomeworkMyClassesPage() {
  const t = useTranslations('homework.myClasses');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [classes, setClasses] = React.useState<MyClassRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const res = await apiClient<{ data: MyClassRow[] }>('/api/v1/homework/my-classes', {
          silent: true,
        });
        if (!cancelled) setClasses(res.data ?? []);
      } catch (err) {
        console.error('[HomeworkMyClasses] Failed to fetch', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 rounded-2xl bg-surface-secondary animate-pulse" />
          ))}
        </div>
      ) : classes.length === 0 ? (
        <EmptyState icon={BookOpen} title={t('empty')} description={t('emptyDesc')} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => (
            <ClassTile key={c.class_id} row={c} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

function ClassTile({ row, locale }: { row: MyClassRow; locale: string }) {
  const t = useTranslations('homework.myClasses');
  const listHref = `/${locale}/homework/by-class/${row.class_id}`;
  const newHref = buildNewHref(locale, row);

  return (
    <div className="group flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-primary p-5 shadow-sm transition hover:border-border-strong hover:shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-text-primary">{row.class_name}</h3>
          <p className="mt-0.5 truncate text-sm text-text-secondary">
            {row.subject_name ?? t('subjectlessClass')}
            {row.year_group_name ? ` · ${row.year_group_name}` : ''}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-secondary px-2 py-0.5 text-xs text-text-secondary">
          {t('periodsPerWeek', { count: row.periods_per_week })}
        </span>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <StatCell
          icon={BookOpen}
          value={row.active_homework_count}
          label={t('activeHomework')}
          tone="default"
        />
        <StatCell
          icon={AlertCircle}
          value={row.overdue_homework_count}
          label={t('overdueHomework')}
          tone={row.overdue_homework_count > 0 ? 'warning' : 'default'}
        />
        <StatCell
          icon={ClipboardCheck}
          value={row.pending_grading_count}
          label={t('pendingGrading')}
          tone={row.pending_grading_count > 0 ? 'info' : 'default'}
        />
      </dl>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <Link
          href={listHref}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-border-subtle px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-surface-secondary"
        >
          {t('viewHomework')}
          <ChevronRight className="h-4 w-4" />
        </Link>
        <Link
          href={newHref}
          className="inline-flex items-center justify-center gap-1 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-primary-700"
          aria-label={t('newHomeworkFor', { className: row.class_name })}
        >
          <Plus className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

function StatCell({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
  tone: 'default' | 'warning' | 'info';
}) {
  const toneClass =
    tone === 'warning'
      ? 'text-red-600'
      : tone === 'info'
        ? 'text-amber-600'
        : 'text-text-secondary';
  return (
    <div className="flex flex-col items-center rounded-lg bg-surface-secondary px-2 py-2">
      <Icon className={`h-4 w-4 ${toneClass}`} />
      <span className={`text-lg font-semibold ${toneClass}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-text-tertiary">{label}</span>
    </div>
  );
}

function buildNewHref(locale: string, row: MyClassRow): string {
  const params = new URLSearchParams({ class_id: row.class_id });
  if (row.subject_id) params.set('subject_id', row.subject_id);
  return `/${locale}/homework/new?${params.toString()}`;
}
