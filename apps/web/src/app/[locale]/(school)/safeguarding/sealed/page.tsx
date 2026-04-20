'use client';

import { AlertTriangle, ArrowLeft, ChevronRight, FolderLock, Lock, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';

import { sealedRowLabel, type SafeguardingConcernRow } from '../_components/summary';
import { canViewSealedRecords } from '../_components/visibility';

export default function SafeguardingSealedPage() {
  const t = useTranslations('safeguardingHub.sealed');
  const tHub = useTranslations('safeguardingHub');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { roleKeys } = useRoleCheck();

  const [rows, setRows] = React.useState<SafeguardingConcernRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const canView = canViewSealedRecords(roleKeys);

  React.useEffect(() => {
    if (!canView) return;

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiClient<{ data: SafeguardingConcernRow[] }>(
      '/api/v1/safeguarding/concerns?status=sealed&pageSize=100',
    )
      .then((res) => {
        if (!cancelled) setRows(res.data);
      })
      .catch((err) => {
        console.error('[SafeguardingSealed] fetch failed', err);
        if (!cancelled) setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canView, reloadKey, t]);

  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader title={t('title')} description={t('description')} />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <p className="max-w-md text-sm text-text-secondary">{t('denied.body')}</p>
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

      {/* Redaction notice */}
      <section className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-800">
        <FolderLock className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-0.5">
          <p className="font-semibold">{t('notice.title')}</p>
          <p className="text-xs text-zinc-600">{t('notice.body')}</p>
        </div>
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
            <FolderLock className="h-8 w-8 text-text-tertiary" />
            <p className="text-sm font-medium text-text-primary">{t('empty.title')}</p>
            <p className="text-xs text-text-tertiary">{t('empty.body')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/${locale}/safeguarding/concerns/${row.id}`}
                  className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-surface-secondary"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
                    <FolderLock className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-semibold text-text-primary">
                      {sealedRowLabel(row, {
                        unknownApprover: t('unknownApprover'),
                        noDate: t('unknownDate'),
                      })}
                    </p>
                    <p className="truncate text-xs text-text-tertiary">{t('openDetails')}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-text-tertiary opacity-60 group-hover:opacity-100 rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
