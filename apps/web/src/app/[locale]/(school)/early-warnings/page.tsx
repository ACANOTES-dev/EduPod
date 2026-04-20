'use client';

import {
  AlertCircle,
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  Flame,
  RefreshCw,
  Settings,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import type { RiskProfileListItem, RiskProfileListResponse } from '@/lib/early-warning';

import { aggregateTrend } from './_components/aggregate-trend';
import { AtRiskList } from './_components/at-risk-list';
import { CohortPanels } from './_components/cohort-panels';
import {
  computeInsights,
  filterByDomain,
  groupByYearTier,
  topClassesByAtRisk,
  type InsightSummary,
} from './_components/compute-insights';
import { DomainChips, type DomainFilter } from './_components/domain-chips';
import { InsightsPanel } from './_components/insights-panel';
import { KpiLargeTile } from './_components/kpi-large-tile';
import { StudentDetailPanel } from './_components/student-detail-panel';

// ─── Types ────────────────────────────────────────────────────────────────────

type AiFlagState = 'unknown' | 'enabled' | 'disabled';

interface AiFlagRow {
  module_key: string;
  enabled: boolean;
}

interface TierSummary {
  green: number;
  yellow: number;
  amber: number;
  red: number;
}

// ─── AI flag resolver (matches pattern used in behaviour sub-hub) ────────────

async function resolveAiFlag(moduleKey: string): Promise<AiFlagState> {
  try {
    const res = await apiClient<{ data: AiFlagRow[] } | AiFlagRow[]>('/api/v1/ai-flags', {
      silent: true,
    });
    const rows = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
    const row = rows.find((r) => r.module_key === moduleKey);
    if (!row) return 'unknown';
    return row.enabled ? 'enabled' : 'disabled';
  } catch {
    return 'unknown';
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const FLAGGED_PAGE_SIZE = 100;

export default function EarlyWarningsHubPage() {
  const t = useTranslations('earlyWarningsHub');
  const locale = useLocale();

  const [rows, setRows] = React.useState<RiskProfileListItem[]>([]);
  const [summary, setSummary] = React.useState<TierSummary | null>(null);
  const [totalFlagged, setTotalFlagged] = React.useState(0);
  const [newThisWeek, setNewThisWeek] = React.useState<number | null>(null);
  const [activeInterventions, setActiveInterventions] = React.useState<number | null>(null);

  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [domain, setDomain] = React.useState<DomainFilter>('all');
  const [aiFlag, setAiFlag] = React.useState<AiFlagState>('unknown');
  const [insights, setInsights] = React.useState<InsightSummary | null>(null);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(false);

  // ── Fetch data ─────────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const flaggedPromise = apiClient<RiskProfileListResponse>(
      `/api/v1/early-warnings?pageSize=${FLAGGED_PAGE_SIZE}&tier=amber`,
      { silent: true },
    ).catch((err) => {
      console.error('[EarlyWarningsHub] flagged amber fetch failed', err);
      return null;
    });

    const redPromise = apiClient<RiskProfileListResponse>(
      `/api/v1/early-warnings?pageSize=${FLAGGED_PAGE_SIZE}&tier=red`,
      { silent: true },
    ).catch((err) => {
      console.error('[EarlyWarningsHub] flagged red fetch failed', err);
      return null;
    });

    const summaryPromise = apiClient<{ data: TierSummary }>('/api/v1/early-warnings/summary', {
      silent: true,
    })
      .then((res) => res?.data ?? null)
      .catch((err) => {
        console.error('[EarlyWarningsHub] summary fetch failed', err);
        return null;
      });

    const interventionsPromise = apiClient<{ meta?: { total?: number } }>(
      '/api/v1/pastoral/interventions?status=active&pageSize=1',
      { silent: true },
    )
      .then((res) => res?.meta?.total ?? null)
      .catch(() => null);

    void Promise.all([redPromise, flaggedPromise, summaryPromise, interventionsPromise]).then(
      ([redRes, amberRes, summaryRes, interventionsRes]) => {
        if (cancelled) return;

        const merged: RiskProfileListItem[] = [];
        if (redRes?.data) merged.push(...redRes.data);
        if (amberRes?.data) merged.push(...amberRes.data);

        setRows(merged);
        setSummary(summaryRes);
        setTotalFlagged((redRes?.meta?.total ?? 0) + (amberRes?.meta?.total ?? 0));
        setActiveInterventions(interventionsRes);

        // Derive a crude "new this week" count from transitions we can see in
        // trend_data last-vs-first. Without a dedicated backend count, this
        // is a heuristic: students whose latest trend value is strictly above
        // their first trend value (i.e. trending worse).
        setNewThisWeek(
          merged.filter((r) => {
            if (r.trend_data.length < 2) return false;
            const first = r.trend_data[0] ?? 0;
            const last = r.trend_data[r.trend_data.length - 1] ?? 0;
            return last > first;
          }).length,
        );

        setInsights(computeInsights(merged));

        if (!redRes && !amberRes && !summaryRes) {
          setError(t('loadError'));
        }
        setIsLoading(false);
      },
    );

    void resolveAiFlag('early_warning').then((state) => {
      if (!cancelled) setAiFlag(state);
    });

    return () => {
      cancelled = true;
    };
  }, [reloadKey, t]);

  // ── Derived data ───────────────────────────────────────────────────────
  const filteredRows = React.useMemo(() => filterByDomain(rows, domain), [rows, domain]);

  const domainCounts: Record<DomainFilter, number> = React.useMemo(
    () => ({
      all: rows.length,
      attendance: filterByDomain(rows, 'attendance').length,
      grades: filterByDomain(rows, 'grades').length,
      behaviour: filterByDomain(rows, 'behaviour').length,
      wellbeing: filterByDomain(rows, 'wellbeing').length,
      engagement: filterByDomain(rows, 'engagement').length,
    }),
    [rows],
  );

  const yearGroupRows = React.useMemo(() => groupByYearTier(rows), [rows]);
  const classRows = React.useMemo(() => topClassesByAtRisk(rows), [rows]);

  const redCount = summary?.red ?? 0;
  const amberCount = summary?.amber ?? 0;
  const aiVisible = aiFlag === 'enabled';

  // Build small sparklines for KPI tiles by aggregating individual trend_data.
  const redSparkline = React.useMemo(
    () => aggregateTrend(rows.filter((r) => r.risk_tier === 'red')),
    [rows],
  );
  const amberSparkline = React.useMemo(
    () => aggregateTrend(rows.filter((r) => r.risk_tier === 'amber')),
    [rows],
  );

  // ── Handlers ───────────────────────────────────────────────────────────
  const openDetail = React.useCallback((row: RiskProfileListItem) => {
    setSelectedId(row.student_id);
    setPanelOpen(true);
  }, []);

  const handleAcknowledged = React.useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  const handleReload = React.useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex min-w-0 flex-col gap-8 pb-24">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/${locale}/early-warnings/cohort`}>
              <Button variant="outline">
                <BarChart3 className="me-2 h-4 w-4" />
                {t('header.cohort')}
              </Button>
            </Link>
            <Link href={`/${locale}/early-warnings/settings`}>
              <Button variant="outline">
                <Settings className="me-2 h-4 w-4" />
                {t('header.settings')}
              </Button>
            </Link>
          </div>
        }
      />

      {/* ── Error banner ──────────────────────────────────────────────── */}
      {error && (
        <div className="flex flex-col gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={handleReload}
            className="inline-flex items-center gap-1.5 self-start rounded-lg border border-danger-300 bg-surface px-3 py-1.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50 sm:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t('retry')}
          </button>
        </div>
      )}

      {/* ── Hero KPI strip ────────────────────────────────────────────── */}
      <section
        aria-label={t('kpis.ariaLabel')}
        className="relative overflow-hidden rounded-3xl border border-amber-200/60 bg-gradient-to-br from-amber-50/70 via-surface to-rose-50/20 p-5 shadow-sm"
      >
        <div className="pointer-events-none absolute -top-24 start-[-5rem] h-48 w-48 rounded-full bg-amber-200/30 blur-3xl" />
        <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiLargeTile
            icon={Flame}
            label={t('kpis.red')}
            value={redCount}
            subtitle={t('kpis.redSubtitle')}
            severity="red"
            isLoading={isLoading}
            sparkline={redSparkline}
            href={`/${locale}/early-warnings?tier=red`}
          />
          <KpiLargeTile
            icon={TriangleAlert}
            label={t('kpis.amber')}
            value={amberCount}
            subtitle={t('kpis.amberSubtitle')}
            severity="amber"
            isLoading={isLoading}
            sparkline={amberSparkline}
            href={`/${locale}/early-warnings?tier=amber`}
          />
          <KpiLargeTile
            icon={Sparkles}
            label={t('kpis.newFlags')}
            value={newThisWeek ?? undefined}
            subtitle={t('kpis.newFlagsSubtitle')}
            severity="blue"
            isLoading={isLoading}
          />
          <KpiLargeTile
            icon={ClipboardCheck}
            label={t('kpis.activeInterventions')}
            value={activeInterventions ?? undefined}
            subtitle={t('kpis.activeInterventionsSubtitle')}
            severity="green"
            isLoading={isLoading}
            href={`/${locale}/pastoral/interventions`}
          />
        </div>
      </section>

      {/* ── AI insights (gated) ──────────────────────────────────────── */}
      {aiVisible && (
        <InsightsPanel insights={insights} isLoading={isLoading} onRefresh={handleReload} />
      )}

      {/* ── Domain drill-down + at-risk list ─────────────────────────── */}
      <section
        aria-labelledby="early-warnings-matrix-heading"
        className="flex min-w-0 flex-col gap-4"
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="early-warnings-matrix-heading"
              className="text-xl font-semibold tracking-tight text-text-primary"
            >
              {t('matrix.title')}
            </h2>
            <p className="mt-0.5 text-sm text-text-secondary">{t('matrix.description')}</p>
          </div>
          <span className="text-xs text-text-tertiary">
            {t('matrix.totalFlagged', { count: rows.length })}
          </span>
        </div>
        <DomainChips value={domain} onChange={setDomain} counts={domainCounts} />
        <AtRiskList rows={filteredRows} isLoading={isLoading} onSelect={openDetail} />
      </section>

      {/* ── Cohort analysis ──────────────────────────────────────────── */}
      <CohortPanels
        yearGroups={yearGroupRows}
        classes={classRows}
        totalFlagged={totalFlagged || rows.length}
        isLoading={isLoading}
      />

      {/* ── Intervention CTA bar ─────────────────────────────────────── */}
      {!isLoading && rows.length > 0 && (
        <div className="sticky bottom-4 z-10 mt-2">
          <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-primary-200 bg-primary-50/80 px-4 py-3 shadow-lg backdrop-blur sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
                <ClipboardList className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  {t('cta.title', { count: rows.length })}
                </p>
                <p className="text-xs text-text-secondary">{t('cta.description')}</p>
              </div>
            </div>
            <Link href={`/${locale}/early-warnings/intervene`} className="sm:ms-auto">
              <Button>
                {t('cta.button')}
                <span aria-hidden="true" className="ms-2 rtl:rotate-180">
                  →
                </span>
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* ── Detail slide-over ────────────────────────────────────────── */}
      <StudentDetailPanel
        studentId={selectedId}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onAcknowledged={handleAcknowledged}
      />
    </div>
  );
}
