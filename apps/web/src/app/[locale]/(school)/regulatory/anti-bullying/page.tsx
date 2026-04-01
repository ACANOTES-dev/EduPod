'use client';

import { Shield } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { StatCard } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { RegulatoryNav } from '../_components/regulatory-nav';

import type { BullyingIncidentSummary } from './_components/bullying-incident-summary';
import { BullyingIncidentSummary as BullyingIncidentSummaryComponent } from './_components/bullying-incident-summary';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AntiBullyingPage() {
  const t = useTranslations('regulatory');
  const pathname = usePathname();

  const segments = (pathname ?? '').split('/').filter(Boolean);
  const locale = segments[0] ?? 'en';

  const [summary, setSummary] = React.useState<BullyingIncidentSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchSummary() {
      setIsLoading(true);
      try {
        const data = await apiClient<BullyingIncidentSummary>(
          '/api/v1/behaviour/incidents/summary?categories=bullying',
          { silent: true },
        );
        if (!cancelled) {
          setSummary(data);
        }
      } catch (err) {
        console.error('[AntiBullyingPage.fetchSummary]', err);
        if (!cancelled) {
          setSummary(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchSummary();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Derived stats ──
  const total = summary?.total_incidents ?? 0;
  const open = summary?.open ?? 0;
  const resolved = summary?.resolved ?? 0;
  const resolutionRate = total > 0 ? `${Math.round((resolved / total) * 100)}%` : '—';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('antiBullying.pageTitle')}
        description={t('antiBullying.pageDescription')}
      />

      <RegulatoryNav />

      {/* ─── Bí Cineálta Info Banner ──────────────────────────────────────── */}
      <div className="rounded-2xl border border-primary-200 bg-primary-50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
            <Shield className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-primary-900">
              {t('antiBullying.bannerTitle')}
            </h2>
            <p className="mt-1 text-sm text-primary-800 leading-relaxed">
              {t('antiBullying.bannerDescription')}
            </p>
            <p className="mt-3">
              <Link
                href={`/${locale}/behaviour`}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-primary-300 bg-white px-4 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                {t('antiBullying.manageIncidents')}
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* ─── Summary Stats ────────────────────────────────────────────────── */}
      {!isLoading && summary !== null && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('antiBullying.statsTotal')} value={total} />
          <StatCard label={t('antiBullying.statsOpen')} value={open} />
          <StatCard label={t('antiBullying.statsResolved')} value={resolved} />
          <StatCard label={t('antiBullying.statsResolutionRate')} value={resolutionRate} />
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-surface-secondary p-5">
              <div className="h-3 w-1/2 rounded bg-surface-primary" />
              <div className="mt-2 h-8 w-1/3 rounded bg-surface-primary" />
            </div>
          ))}
        </div>
      )}

      {/* ─── Category Breakdown ───────────────────────────────────────────── */}
      <BullyingIncidentSummaryComponent data={summary} isLoading={isLoading} locale={locale} />
    </div>
  );
}
