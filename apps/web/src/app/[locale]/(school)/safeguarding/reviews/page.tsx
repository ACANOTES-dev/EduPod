'use client';

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Binoculars,
  CheckCircle2,
  Clock,
  Lock,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

import { canViewSafeguarding } from '../_components/visibility';
import {
  deriveReviewStatus,
  type BreakGlassGrantRow,
  type ReviewStatus,
} from '../break-glass/_components/break-glass-types';

const BUCKET_STYLES: Record<'overdue' | 'pending', { pill: string; icon: typeof Clock }> = {
  overdue: { pill: 'bg-danger-100 text-danger-700', icon: AlertTriangle },
  pending: { pill: 'bg-warning-100 text-warning-800', icon: Clock },
};

interface ReviewRow extends BreakGlassGrantRow {
  status: ReviewStatus;
}

function reviewNeedsAttention(status: ReviewStatus): status is 'overdue' | 'not_yet_due' {
  return status === 'overdue' || status === 'not_yet_due';
}

export default function SafeguardingReviewsPage() {
  const t = useTranslations('safeguardingHub.reviews');
  const tHub = useTranslations('safeguardingHub');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { roleKeys } = useRoleCheck();
  const canView = canViewSafeguarding(roleKeys);

  const [rows, setRows] = React.useState<ReviewRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!canView) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiClient<{ data: BreakGlassGrantRow[] }>('/api/v1/safeguarding/break-glass')
      .then((res) => {
        if (cancelled) return;
        const annotated = (res.data ?? []).map<ReviewRow>((row) => ({
          ...row,
          status: deriveReviewStatus(row),
        }));
        setRows(annotated.filter((r) => reviewNeedsAttention(r.status)));
      })
      .catch((err) => {
        console.error('[SafeguardingReviewsPage]', err);
        if (!cancelled) setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, t]);

  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader title={t('title')} description={t('description')} />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <p className="max-w-md text-sm text-text-secondary">{tHub('denied.body')}</p>
          <Link
            href={`/${locale}/wellbeing`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            {tHub('denied.backToHub')}
          </Link>
        </section>
      </div>
    );
  }

  const overdue = rows.filter((r) => r.status === 'overdue');
  const pending = rows.filter((r) => r.status === 'not_yet_due');

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link
            href={`/${locale}/safeguarding`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            {tHub('denied.backToHub')}
          </Link>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-text-secondary">
          {t('loading')}
        </div>
      )}

      {!isLoading && !error && rows.length === 0 && (
        <section className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="max-w-md space-y-1">
            <h3 className="text-base font-semibold text-text-primary">{t('empty.title')}</h3>
            <p className="text-sm text-text-secondary">{t('empty.body')}</p>
          </div>
        </section>
      )}

      {overdue.length > 0 && (
        <ReviewSection
          label={t('sections.overdue', { count: overdue.length })}
          rows={overdue}
          bucket="overdue"
          locale={locale}
          t={t}
        />
      )}

      {pending.length > 0 && (
        <ReviewSection
          label={t('sections.pending', { count: pending.length })}
          rows={pending}
          bucket="pending"
          locale={locale}
          t={t}
        />
      )}
    </div>
  );
}

interface ReviewSectionProps {
  label: string;
  rows: ReviewRow[];
  bucket: 'overdue' | 'pending';
  locale: string;
  t: ReturnType<typeof useTranslations>;
}

function ReviewSection({ label, rows, bucket, locale, t }: ReviewSectionProps) {
  const style = BUCKET_STYLES[bucket];
  const BucketIcon = style.icon;

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <BucketIcon className="h-4 w-4 text-text-secondary" />
          <h2 className="text-sm font-semibold text-text-primary">{label}</h2>
        </div>
      </header>
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/${locale}/safeguarding/break-glass/${row.id}`}
              className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-secondary"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                <Binoculars className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {row.granted_to.name}
                </p>
                <p className="truncate text-xs text-text-tertiary">
                  {t('grantedBy', { name: row.granted_by.name })}
                  {' · '}
                  {t('expiredAt', { at: formatDateTime(row.expires_at) })}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.pill}`}
              >
                <BucketIcon className="h-3 w-3" />
                {t(`status.${bucket}`)}
              </span>
              <ArrowRight className="h-4 w-4 text-text-tertiary opacity-60 rtl:rotate-180" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
