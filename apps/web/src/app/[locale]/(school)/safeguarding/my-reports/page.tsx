'use client';

import { AlertTriangle, FileWarning, Lock, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { fmtLocale } from '@/lib/i18n-format';

import { canViewSafeguarding } from '../_components/visibility';

interface MyReportRow {
  concern_number: string;
  concern_type: string;
  reported_at: string;
  reporter_acknowledgement_status: string | null;
}

interface MyReportsResponse {
  data: MyReportRow[];
  meta: { page: number; pageSize: number; total: number };
}

const PAGE_SIZE = 20;

const ACK_STYLES: Record<string, string> = {
  pending: 'bg-rose-100 text-rose-700 border border-rose-200',
  assigned: 'bg-sky-100 text-sky-700 border border-sky-200',
  under_review: 'bg-amber-100 text-amber-700 border border-amber-200',
  closed: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
};

export default function SafeguardingMyReportsPage() {
  const t = useTranslations('safeguardingHub.myReports');
  const tType = useTranslations('safeguardingHub.concernType');
  const tAck = useTranslations('safeguardingHub.ackStatus');
  const tHub = useTranslations('safeguardingHub');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { roleKeys } = useRoleCheck();
  const canView = canViewSafeguarding(roleKeys);

  const [rows, setRows] = React.useState<MyReportRow[]>([]);
  const [meta, setMeta] = React.useState<MyReportsResponse['meta']>({
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiClient<MyReportsResponse>(
      `/api/v1/safeguarding/my-reports?page=${page}&pageSize=${PAGE_SIZE}`,
      { silent: true },
    )
      .then((res) => {
        if (cancelled) return;
        setRows(res.data ?? []);
        setMeta(res.meta ?? { page: 1, pageSize: PAGE_SIZE, total: 0 });
      })
      .catch((err) => {
        console.error('[SafeguardingMyReports] fetch failed', err);
        if (!cancelled) setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, page, reloadKey, t]);

  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader
          title={t('title')}
          description={t('description')}
          back={{ href: `/${locale}/safeguarding`, label: tHub('denied.backToHub') }}
        />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <p className="max-w-md text-sm text-text-secondary">{tHub('denied.body')}</p>
          <Link
            href={`/${locale}/safeguarding`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            {tHub('denied.backToHub')}
          </Link>
        </section>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(meta.total / (meta.pageSize || PAGE_SIZE)));

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/safeguarding`, label: tHub('denied.backToHub') }}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/${locale}/safeguarding/concerns/new`}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('reportCta')}
            </Link>
          </div>
        }
      />

      {/* Privacy note */}
      <section className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-800">
        <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="text-xs text-slate-700">{t('privacyBody')}</p>
      </section>

      {error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-danger-300 bg-surface px-3 py-1.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50 sm:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {tHub('retry')}
          </button>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-border bg-surface">
        {isLoading ? (
          <ul className="divide-y divide-border/50">
            {Array.from({ length: 4 }).map((_, idx) => (
              <li key={idx} className="flex items-center gap-4 px-5 py-4">
                <div className="h-10 w-10 animate-pulse rounded-xl bg-border/40" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/2 animate-pulse rounded bg-border/40" />
                  <div className="h-2 w-1/3 animate-pulse rounded bg-border/30" />
                </div>
              </li>
            ))}
          </ul>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <FileWarning className="h-8 w-8 text-text-tertiary" />
            <p className="text-sm font-medium text-text-primary">{t('empty.title')}</p>
            <p className="text-xs text-text-tertiary">{t('empty.body')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {rows.map((row) => {
              const ackKey = row.reporter_acknowledgement_status ?? 'pending';
              const ackStyle = ACK_STYLES[ackKey] ?? ACK_STYLES.pending;
              return (
                <li key={row.concern_number}>
                  <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <FileWarning className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {row.concern_number}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {tType(row.concern_type)}
                        {' · '}
                        {new Date(row.reported_at).toLocaleString(fmtLocale(locale))}
                      </p>
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ackStyle}`}
                    >
                      {tAck(ackKey)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || isLoading}
          >
            {t('pagination.prev')}
          </Button>
          <span className="text-xs text-text-tertiary">
            {t('pagination.page', { page, total: totalPages })}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
          >
            {t('pagination.next')}
          </Button>
        </div>
      )}
    </div>
  );
}
