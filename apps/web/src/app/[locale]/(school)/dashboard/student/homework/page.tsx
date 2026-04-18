'use client';

import { AlertCircle, BookOpen, ChevronRight, Clock, FileText } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { EmptyState } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentHomeworkRow {
  id: string;
  title: string;
  description: string | null;
  homework_type: string;
  due_date: string;
  due_time: string | null;
  class_entity: { id: string; name: string };
  subject: { id: string; name: string } | null;
  submissions?: Array<{
    id: string;
    status: string;
    is_late: boolean;
    points_awarded: number | null;
  }>;
}

type Tab = 'today' | 'thisWeek' | 'overdue';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentHomeworkListPage() {
  const t = useTranslations('homework');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [tab, setTab] = React.useState<Tab>('today');
  const [rows, setRows] = React.useState<StudentHomeworkRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const endpoint = {
      today: '/api/v1/student/homework/today',
      thisWeek: '/api/v1/student/homework/this-week',
      overdue: '/api/v1/student/homework/overdue',
    }[tab];

    void (async () => {
      setLoading(true);
      try {
        const res = await apiClient<{ data: StudentHomeworkRow[] }>(endpoint, { silent: true });
        if (!cancelled) setRows(res.data ?? []);
      } catch (err) {
        console.error('[StudentHomework] Failed to fetch', err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader title={t('studentHomework.title')} description={t('studentHomework.subtitle')} />

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1">
        {(['today', 'thisWeek', 'overdue'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`min-h-11 flex-1 min-w-28 rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === key
                ? 'bg-primary-600 text-white'
                : 'text-text-secondary hover:bg-surface-secondary'
            }`}
          >
            {t(`studentHomework.tab.${key}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={t(`studentHomework.empty.${tab}`)}
          description={t('studentHomework.emptyDesc')}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <HomeworkRowCard key={row.id} row={row} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function HomeworkRowCard({ row, locale }: { row: StudentHomeworkRow; locale: string }) {
  const t = useTranslations('homework');
  const submission = row.submissions?.[0];
  const href = `/${locale}/dashboard/student/homework/${row.id}`;

  const stateLabel: { text: string; tone: 'default' | 'info' | 'success' | 'warning' } = submission
    ? submission.status === 'graded'
      ? {
          text:
            submission.points_awarded != null
              ? `${t('studentHomework.graded')} · ${submission.points_awarded}`
              : t('studentHomework.graded'),
          tone: 'success',
        }
      : submission.status === 'returned_for_revision'
        ? { text: t('studentHomework.returned'), tone: 'warning' }
        : {
            text: submission.is_late
              ? t('studentHomework.submittedLate')
              : t('studentHomework.submitted'),
            tone: 'info',
          }
    : { text: t('studentHomework.notSubmitted'), tone: 'default' };

  const toneClass =
    stateLabel.tone === 'success'
      ? 'text-success-600 bg-success-50'
      : stateLabel.tone === 'warning'
        ? 'text-amber-600 bg-amber-50'
        : stateLabel.tone === 'info'
          ? 'text-primary-600 bg-primary-50'
          : 'text-text-secondary bg-surface-secondary';

  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-2xl border border-border-subtle bg-surface-primary p-4 shadow-sm transition hover:border-border-strong hover:shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-text-primary">{row.title}</h3>
          <p className="mt-0.5 truncate text-sm text-text-secondary">
            {row.subject?.name ?? t('subjectlessClass')}
            {` · ${row.class_entity.name}`}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-text-tertiary" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2 py-0.5 text-text-secondary">
          <Clock className="h-3 w-3" />
          {formatDate(row.due_date)}
          {row.due_time ? ` · ${row.due_time}` : ''}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${toneClass}`}>
          <FileText className="h-3 w-3" />
          {stateLabel.text}
        </span>
        {submission?.is_late && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-red-600">
            <AlertCircle className="h-3 w-3" />
            {t('studentHomework.late')}
          </span>
        )}
      </div>
    </Link>
  );
}
