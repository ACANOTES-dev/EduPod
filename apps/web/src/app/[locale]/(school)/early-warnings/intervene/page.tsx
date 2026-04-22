'use client';

import { AlertCircle, ClipboardList, Flame, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import type { RiskProfileListItem, RiskProfileListResponse } from '@/lib/early-warning';

const PAGE_SIZE = 100;

export default function EarlyWarningsIntervenePage() {
  const t = useTranslations('earlyWarningsHub.intervene');
  const locale = useLocale();

  const [rows, setRows] = React.useState<RiskProfileListItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const redPromise = apiClient<RiskProfileListResponse>(
      `/api/v1/early-warnings?pageSize=${PAGE_SIZE}&tier=red`,
      { silent: true },
    ).catch((err) => {
      console.error('[EarlyWarningsIntervene] red fetch failed', err);
      return null;
    });

    const amberPromise = apiClient<RiskProfileListResponse>(
      `/api/v1/early-warnings?pageSize=${PAGE_SIZE}&tier=amber`,
      { silent: true },
    ).catch((err) => {
      console.error('[EarlyWarningsIntervene] amber fetch failed', err);
      return null;
    });

    void Promise.all([redPromise, amberPromise]).then(([red, amber]) => {
      if (cancelled) return;

      const merged: RiskProfileListItem[] = [];
      if (red?.data) merged.push(...red.data);
      if (amber?.data) merged.push(...amber.data);
      setRows(merged);

      if (!red && !amber) {
        setError(t('loadError'));
      }
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [t]);

  const red = rows.filter((r) => r.risk_tier === 'red');
  const amber = rows.filter((r) => r.risk_tier === 'amber');

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-24">
      <PageHeader
        title={t('title')}
        description={t('description')}
        back={{ href: `/${locale}/early-warnings`, label: t('back') }}
      />

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!isLoading && rows.length === 0 && !error && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-sm text-text-secondary">{t('empty')}</p>
        </div>
      )}

      {isLoading && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center text-sm text-text-secondary">
          {t('loading')}
        </div>
      )}

      {red.length > 0 && (
        <InterveneSection
          icon={Flame}
          label={t('redLabel', { count: red.length })}
          rows={red}
          tone="red"
          locale={locale}
          t={t}
        />
      )}
      {amber.length > 0 && (
        <InterveneSection
          icon={TriangleAlert}
          label={t('amberLabel', { count: amber.length })}
          rows={amber}
          tone="amber"
          locale={locale}
          t={t}
        />
      )}
    </div>
  );
}

interface InterveneSectionProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  rows: RiskProfileListItem[];
  tone: 'red' | 'amber';
  locale: string;
  t: ReturnType<typeof useTranslations>;
}

function InterveneSection({ icon: Icon, label, rows, tone, locale, t }: InterveneSectionProps) {
  const borderTone = tone === 'red' ? 'border-danger-200' : 'border-amber-200';
  const iconTone = tone === 'red' ? 'text-danger-700' : 'text-amber-700';

  return (
    <section className={`rounded-3xl border bg-surface p-5 ${borderTone}`}>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
        <Icon className={`h-5 w-5 ${iconTone}`} />
        {label}
      </h2>
      <ul className="mt-4 flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text-primary">{row.student_name}</p>
              <p className="text-xs text-text-secondary">
                {row.year_group_name ?? '—'}
                {row.class_name ? ` · ${row.class_name}` : ''}
                {row.top_signal ? ` · ${row.top_signal}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/${locale}/pastoral/concerns/new`}>
                <Button variant="outline" size="sm">
                  {t('actions.logConcern')}
                </Button>
              </Link>
              <Link href={`/${locale}/pastoral/interventions/new`}>
                <Button size="sm">
                  <ClipboardList className="me-1.5 h-3.5 w-3.5" />
                  {t('actions.startIntervention')}
                </Button>
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
