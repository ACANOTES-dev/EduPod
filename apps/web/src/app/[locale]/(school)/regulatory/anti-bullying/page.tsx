'use client';

import { AlertTriangle, CalendarClock, CheckCircle2, FileText, Layers, Shield } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { HubTile } from '@/components/hub-tile';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { apiClient, unwrap } from '@/lib/api-client';

import { CategoryBreakdown, type CategoryBreakdownEntry } from './_components/category-breakdown';
import { RecentIncidentsList, type RecentIncident } from './_components/recent-incidents-list';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AntiBullyingSummary {
  academic_year: string;
  total_incidents: number;
  open: number;
  resolved: number;
  resolved_this_term: number;
  days_since_last_incident: number | null;
  by_category: CategoryBreakdownEntry[];
  by_month: Array<{ month: string; count: number }>;
  recent_incidents: RecentIncident[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AntiBullyingPage() {
  const t = useTranslations('regulatory.antiBullying');
  const locale = useLocale();

  const [summary, setSummary] = React.useState<AntiBullyingSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiClient<{ data: AntiBullyingSummary } | AntiBullyingSummary>(
      '/api/v1/regulatory/anti-bullying/summary',
      { silent: true },
    )
      .then((res) => {
        if (!cancelled) setSummary(unwrap(res));
      })
      .catch((err) => {
        console.error('[AntiBullyingPage] fetch', err);
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const daysSinceLabel = React.useMemo(() => {
    if (!summary) return '—';
    if (summary.days_since_last_incident === null) return t('noIncidentsYet');
    return String(summary.days_since_last_incident);
  }, [summary, t]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pageTitle')}
        description={t('pageDescription')}
        back={{ href: `/${locale}/regulatory`, label: t('backToRegulatory') }}
        actions={
          <Link href={`/${locale}/behaviour/incidents`}>
            <Button variant="outline" className="min-h-[44px]">
              <FileText className="me-2 h-4 w-4" />
              {t('manageIncidents')}
            </Button>
          </Link>
        }
      />

      {/* ── Framework banner ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-slate-50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-700">
            <Shield className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-text-primary">{t('bannerTitle')}</h2>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              {t('bannerDescription')}
            </p>
          </div>
        </div>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <section
        aria-label={t('kpi.ariaLabel')}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <KpiTile
          icon={AlertTriangle}
          label={t('kpi.open')}
          value={summary?.open}
          isLoading={isLoading}
          accent={summary && summary.open > 0 ? 'text-danger-600' : 'text-text-tertiary'}
          tooltip={t('kpi.openTooltip')}
        />
        <KpiTile
          icon={CheckCircle2}
          label={t('kpi.resolvedThisTerm')}
          value={summary?.resolved_this_term}
          isLoading={isLoading}
          accent="text-success-700"
          tooltip={t('kpi.resolvedThisTermTooltip')}
        />
        <KpiTile
          icon={Layers}
          label={t('kpi.thisYear')}
          value={summary?.total_incidents}
          isLoading={isLoading}
          accent="text-cyan-700"
          tooltip={t('kpi.thisYearTooltip')}
        />
        <KpiTile
          icon={CalendarClock}
          label={t('kpi.daysSinceLast')}
          value={daysSinceLabel}
          isLoading={isLoading}
          accent="text-primary-700"
          tooltip={t('kpi.daysSinceLastTooltip')}
        />
      </section>

      {/* ── Hub tiles ─────────────────────────────────────────────────── */}
      <section aria-label={t('tiles.ariaLabel')} className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <HubTile
          icon={AlertTriangle}
          title={t('tiles.openIncidents.title')}
          description={t('tiles.openIncidents.description')}
          href="/behaviour/incidents?status=open"
          accent="from-rose-400 to-rose-600"
          iconBg="bg-rose-100 text-rose-700"
          glow="from-rose-400/10"
          count={summary?.open}
          animationIndex={0}
          moduleKey="behaviour"
        />
        <HubTile
          icon={FileText}
          title={t('tiles.annualReview.title')}
          description={t('tiles.annualReview.description')}
          href="/regulatory/submissions?domain=anti_bullying"
          accent="from-indigo-400 to-indigo-600"
          iconBg="bg-indigo-100 text-indigo-700"
          glow="from-indigo-400/10"
          animationIndex={1}
        />
        <HubTile
          icon={Shield}
          title={t('tiles.policy.title')}
          description={t('tiles.policy.description')}
          href="/regulatory"
          accent="from-slate-400 to-slate-600"
          iconBg="bg-slate-100 text-slate-700"
          glow="from-slate-400/10"
          animationIndex={2}
        />
      </section>

      {/* ── Category breakdown ────────────────────────────────────────── */}
      <CategoryBreakdown entries={summary?.by_category ?? []} isLoading={isLoading} />

      {/* ── Recent incidents ──────────────────────────────────────────── */}
      <RecentIncidentsList
        incidents={summary?.recent_incidents ?? []}
        isLoading={isLoading}
      />
    </div>
  );
}
