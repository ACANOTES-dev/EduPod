'use client';

import { ArrowRight, CheckCircle2, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

import type { DatabaseType } from './database-toggle';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PodRecord {
  external_id: string;
  first_name: string;
  last_name: string;
  pps_number?: string;
  [key: string]: unknown;
}

interface DiffEntry {
  student_id: string;
  mapping_id: string;
  status: 'new' | 'changed' | 'unchanged';
  current_hash: string;
  stored_hash: string | null;
  record?: PodRecord;
}

interface DiffPreviewSectionProps {
  databaseType: DatabaseType;
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function DiffSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="h-4 w-32 animate-pulse rounded bg-border/60" />
      <div className="mt-4 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 w-full animate-pulse rounded bg-surface-secondary" />
        ))}
      </div>
    </div>
  );
}

// ─── Diff Preview Section ───────────────────────────────────────────────────

export function DiffPreviewSection({ databaseType }: DiffPreviewSectionProps) {
  const t = useTranslations('regulatory.ppod');
  const locale = useLocale();

  const [entries, setEntries] = React.useState<DiffEntry[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    apiClient<{ data: DiffEntry[] } | DiffEntry[]>(
      `/api/v1/regulatory/ppod/diff?database_type=${databaseType}`,
      { silent: true },
    )
      .then((res) => {
        if (cancelled) return;
        const list = Array.isArray(res) ? res : (res.data ?? []);
        setEntries(list);
      })
      .catch((err) => {
        console.error('[DiffPreviewSection] fetch failed', err);
        if (!cancelled) setError(t('diffLoadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [databaseType, t]);

  if (isLoading) return <DiffSkeleton />;

  if (error) {
    return (
      <div className="rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
        {error}
      </div>
    );
  }

  const newEntries = entries?.filter((e) => e.status === 'new') ?? [];
  const changedEntries = entries?.filter((e) => e.status === 'changed') ?? [];
  const totalChanges = newEntries.length + changedEntries.length;

  if (totalChanges === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-5">
        <CheckCircle2 className="h-5 w-5 text-success-600" />
        <p className="text-sm text-text-secondary">{t('diffInSync')}</p>
      </div>
    );
  }

  const previewEntries = [...newEntries, ...changedEntries].slice(0, 5);

  return (
    <div className="rounded-2xl border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-text-primary">{t('diffTitle')}</h2>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-700">
            <Plus className="h-3 w-3" />
            {t('diffNewCount', { count: newEntries.length })}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">
            <RefreshCw className="h-3 w-3" />
            {t('diffChangedCount', { count: changedEntries.length })}
          </span>
        </div>
        <Link
          href={`/${locale}/regulatory/ppod/students`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
        >
          {t('diffViewAll')}
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
        </Link>
      </header>
      <ul className="divide-y divide-border/60">
        {previewEntries.map((entry) => {
          const name = entry.record
            ? `${entry.record.first_name} ${entry.record.last_name}`.trim()
            : entry.student_id;
          return (
            <li
              key={entry.mapping_id}
              className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={
                    entry.status === 'new'
                      ? 'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700'
                      : 'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warning-100 text-warning-700'
                  }
                >
                  {entry.status === 'new' ? (
                    <Plus className="h-3.5 w-3.5" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="truncate font-medium text-text-primary">{name}</span>
              </div>
              <span className="text-xs text-text-tertiary">
                {entry.status === 'new' ? t('diffStatusNew') : t('diffStatusChanged')}
              </span>
            </li>
          );
        })}
      </ul>
      {totalChanges > previewEntries.length && (
        <footer className="border-t border-border/60 px-5 py-2.5 text-xs text-text-tertiary">
          {t('diffMoreCount', { count: totalChanges - previewEntries.length })}
        </footer>
      )}
    </div>
  );
}
