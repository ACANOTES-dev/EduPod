'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Skeleton, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { useTenantCurrency } from '../../../../_components/use-tenant-currency';
import type { ModelSummary } from '../_components/workspace-types';

import { ManualActualsModal } from './_components/manual-actuals-modal';
import { RefreshButton } from './_components/refresh-button';
import { VariancePeriodSelector } from './_components/variance-period-selector';
import { VarianceTable } from './_components/variance-table';
import type {
  PeriodOption,
  VarianceListResponse,
  VariancePeriodType,
  VarianceRow,
} from './_components/variance-types';

const VALID_TYPES: VariancePeriodType[] = ['month', 'term', 'year'];
const REFRESH_POLL_MS = 5_000;
const REFRESH_TIMEOUT_MS = 60_000;

interface Props {
  params: { locale: string; id: string };
}

interface ModelDetail {
  model: ModelSummary;
}

/**
 * Period labels are stored as human-readable strings in `variance_cache`
 * (e.g. "Sept 2025", "Apr 2026", "Term 1 2025-26", "FY 2025-26"). Alphabetical
 * sort puts "Apr 2026" before "Dec 2025" and confuses users. We try to parse
 * the label as a date for chronological order; anything we can't parse falls
 * back to a stable localeCompare so non-month period types (term/year) still
 * sort sensibly.
 */
function periodSortKey(label: string): number {
  // Normalise the non-standard "Sept" abbrev to "Sep" before Date.parse.
  const fixed = label.replace(/\bSept\b/, 'Sep');
  const t = Date.parse(fixed);
  return Number.isFinite(t) ? t : Number.NaN;
}

function sortPeriods(a: PeriodOption, b: PeriodOption): number {
  const ka = periodSortKey(a.label);
  const kb = periodSortKey(b.label);
  if (Number.isFinite(ka) && Number.isFinite(kb)) return ka - kb;
  return a.label.localeCompare(b.label);
}

export default function VariancePage({ params }: Props) {
  const t = useTranslations('financeBudgetingVariance');
  const tRefresh = useTranslations('financeBudgetingVariance.refresh');
  const router = useRouter();
  const searchParams = useSearchParams();
  const currencyCode = useTenantCurrency();
  const locale = params.locale ?? 'en';
  const modelId = params.id;

  // ─── State ─────────────────────────────────────────────────────────────

  const [model, setModel] = React.useState<ModelSummary | null>(null);
  const [rows, setRows] = React.useState<VarianceRow[]>([]);
  const [refreshedAt, setRefreshedAt] = React.useState<string | null>(null);
  const [availablePeriods, setAvailablePeriods] = React.useState<PeriodOption[]>([]);

  const initialType = (searchParams?.get('period_type') as VariancePeriodType | null) ?? null;
  const initialLabel = searchParams?.get('period_label') ?? null;

  const [period, setPeriod] = React.useState<PeriodOption>(() => ({
    type: initialType && VALID_TYPES.includes(initialType) ? initialType : 'month',
    label: initialLabel ?? '',
  }));
  const [isLoadingModel, setIsLoadingModel] = React.useState<boolean>(true);
  const [isLoadingVariance, setIsLoadingVariance] = React.useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);
  const [modalRow, setModalRow] = React.useState<VarianceRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // ─── Load the model once ───────────────────────────────────────────────

  React.useEffect(() => {
    let cancelled = false;
    setIsLoadingModel(true);
    setError(null);
    void (async () => {
      try {
        const res = await apiClient<{ data: ModelDetail } | ModelDetail>(
          `/api/v1/budgeting/financial-models/${modelId}`,
        );
        if (cancelled) return;
        const detail = 'model' in res ? res : (res as { data: ModelDetail }).data;
        setModel(detail.model);
      } catch (err) {
        if (cancelled) return;
        console.error('[Variance.loadModel]', err);
        setError(err instanceof Error ? err.message : t('loadError'));
      } finally {
        if (!cancelled) setIsLoadingModel(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modelId, t]);

  // ─── Load variance ─────────────────────────────────────────────────────

  const fetchVariance = React.useCallback(
    async (type: VariancePeriodType, label?: string): Promise<VarianceListResponse | null> => {
      const qs = new URLSearchParams({ period_type: type });
      if (label) qs.set('period_label', label);
      try {
        const res = await apiClient<VarianceListResponse>(
          `/api/v1/budgeting/financial-models/${modelId}/variance?${qs.toString()}`,
        );
        return res;
      } catch (err) {
        console.error('[Variance.fetch]', err);
        toast.error(err instanceof Error ? err.message : t('loadError'));
        return null;
      }
    },
    [modelId, t],
  );

  // Bootstrap available periods + initial selection. We always do an
  // unfiltered fetch first to discover the period list; then if the URL
  // pinned a specific label, refetch with that filter.
  React.useEffect(() => {
    if (!model) return;
    let cancelled = false;
    setIsLoadingVariance(true);
    void (async () => {
      const res = await fetchVariance(period.type, undefined);
      if (cancelled) return;

      // Derive distinct period_labels per type from the rows.
      const seen = new Map<string, PeriodOption>();
      for (const row of res?.data ?? []) {
        const key = `${period.type}:${row.period_label}`;
        if (!seen.has(key)) {
          seen.set(key, { type: period.type, label: row.period_label });
        }
      }
      const periods = Array.from(seen.values()).sort(sortPeriods);
      setAvailablePeriods(periods);

      const targetLabel = period.label || periods[periods.length - 1]?.label || '';
      // If the period in URL is in the discovered list, narrow the rows.
      if (targetLabel && periods.some((p) => p.label === targetLabel)) {
        const narrowed = await fetchVariance(period.type, targetLabel);
        if (cancelled) return;
        setRows(narrowed?.data ?? []);
        setRefreshedAt(narrowed?.meta.refreshed_at ?? null);
        setPeriod({ type: period.type, label: targetLabel });
      } else {
        setRows(res?.data ?? []);
        setRefreshedAt(res?.meta.refreshed_at ?? null);
        if (targetLabel) setPeriod({ type: period.type, label: targetLabel });
      }
      setIsLoadingVariance(false);
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally only re-run when model is established — period changes
    // re-fetch via the dedicated effect below so we don't re-derive periods.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  // Re-fetch when the user changes the period selection.
  const periodLabelKey = period.label;
  const periodTypeKey = period.type;
  React.useEffect(() => {
    if (!model || !periodLabelKey) return;
    let cancelled = false;
    setIsLoadingVariance(true);
    void (async () => {
      const res = await fetchVariance(periodTypeKey, periodLabelKey);
      if (cancelled) return;
      setRows(res?.data ?? []);
      setRefreshedAt(res?.meta.refreshed_at ?? null);
      setIsLoadingVariance(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [model, periodTypeKey, periodLabelKey, fetchVariance]);

  // ─── URL state ─────────────────────────────────────────────────────────

  const setPeriodAndUrl = React.useCallback(
    (next: PeriodOption) => {
      setPeriod(next);
      const url = new URL(window.location.href);
      url.searchParams.set('period_type', next.type);
      if (next.label) url.searchParams.set('period_label', next.label);
      else url.searchParams.delete('period_label');
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    },
    [router],
  );

  // ─── Refresh trigger + polling loop ────────────────────────────────────

  const triggerRefresh = React.useCallback(async (): Promise<void> => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const baseline = refreshedAt;
    try {
      await apiClient(`/api/v1/budgeting/financial-models/${modelId}/variance/refresh`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('[Variance.refresh]', err);
      toast.error(err instanceof Error ? err.message : tRefresh('failed'));
      setIsRefreshing(false);
      return;
    }

    const startedAt = Date.now();
    const tick = async (): Promise<void> => {
      if (Date.now() - startedAt > REFRESH_TIMEOUT_MS) {
        toast.message(tRefresh('slow'));
        setIsRefreshing(false);
        return;
      }
      // First fetch unfiltered so we can re-derive the period list from the
      // newly materialised rows. On the very first refresh `period.label` is
      // empty, so we MUST pick a default period before showing rows — otherwise
      // every materialised period bleeds into the table at once and React
      // collides on duplicate row keys.
      const unfiltered = await fetchVariance(period.type, undefined);
      const next = unfiltered?.meta.refreshed_at ?? null;
      if (next && next !== baseline) {
        const seen = new Map<string, PeriodOption>();
        for (const row of unfiltered?.data ?? []) {
          const key = `${period.type}:${row.period_label}`;
          if (!seen.has(key)) {
            seen.set(key, { type: period.type, label: row.period_label });
          }
        }
        const periods = Array.from(seen.values()).sort(sortPeriods);
        setAvailablePeriods(periods);
        const targetLabel = period.label || periods[periods.length - 1]?.label || '';
        if (targetLabel) {
          const narrowed = await fetchVariance(period.type, targetLabel);
          setRows(narrowed?.data ?? []);
          setPeriod({ type: period.type, label: targetLabel });
        } else {
          setRows(unfiltered?.data ?? []);
        }
        setRefreshedAt(next);
        toast.success(tRefresh('completed'));
        setIsRefreshing(false);
        return;
      }
      window.setTimeout(() => void tick(), REFRESH_POLL_MS);
    };
    window.setTimeout(() => void tick(), REFRESH_POLL_MS);
  }, [isRefreshing, refreshedAt, modelId, fetchVariance, period, tRefresh]);

  // ─── Render guards ────────────────────────────────────────────────────

  if (isLoadingModel || !model) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      </div>
    );
  }

  const hasSnapshot = model.current_snapshot_id !== null;
  const fiscalStart = new Date(model.fiscal_year_start);
  const fiscalNotStarted = fiscalStart > new Date();
  const ready = hasSnapshot && !fiscalNotStarted;

  return (
    <div className="flex min-w-0 flex-col gap-4 p-6 pb-10">
      <PageHeader
        title={t('title')}
        description={model.name}
        back={{
          href: `/${locale}/finance/budgeting/models/${modelId}`,
          label: t('backToWorkspace'),
        }}
      />

      {!ready ? (
        <NotReadyEmptyState
          model={model}
          locale={locale}
          modelId={modelId}
          hasSnapshot={hasSnapshot}
        />
      ) : (
        <>
          <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <VariancePeriodSelector
              selected={period}
              available={availablePeriods}
              onChange={setPeriodAndUrl}
            />
            <RefreshButton
              onTrigger={triggerRefresh}
              isRefreshing={isRefreshing}
              refreshedAt={refreshedAt}
              locale={locale}
            />
          </header>

          {isLoadingVariance ? (
            <Skeleton className="h-72 rounded-2xl" />
          ) : rows.length === 0 ? (
            <EmptyVarianceState />
          ) : (
            <VarianceTable
              rows={rows}
              currencyCode={currencyCode}
              locale={locale}
              canManage
              onLogManualActual={(row) => setModalRow(row)}
            />
          )}
        </>
      )}

      <ManualActualsModal
        open={modalRow !== null}
        onClose={() => setModalRow(null)}
        modelId={modelId}
        row={modalRow}
        period={period}
        onSaved={() => {
          // Re-fetch the current period so the new actual is reflected.
          void (async () => {
            const res = await fetchVariance(period.type, period.label || undefined);
            setRows(res?.data ?? []);
            setRefreshedAt(res?.meta.refreshed_at ?? null);
          })();
        }}
      />
    </div>
  );
}

function NotReadyEmptyState({
  model,
  locale,
  modelId,
  hasSnapshot,
}: {
  model: ModelSummary;
  locale: string;
  modelId: string;
  hasSnapshot: boolean;
}) {
  const t = useTranslations('financeBudgetingVariance.notReady');

  if (!hasSnapshot) {
    return (
      <div className="flex min-w-0 flex-col items-center gap-3 rounded-3xl border border-dashed border-border bg-surface p-10 text-center">
        <h2 className="text-lg font-semibold text-text-primary">{t('noSnapshot.title')}</h2>
        <p className="max-w-md text-sm text-text-secondary">{t('noSnapshot.body')}</p>
        <Button asChild>
          <Link href={`/${locale}/finance/budgeting/models/${modelId}/snapshots`}>
            {t('noSnapshot.cta')}
          </Link>
        </Button>
      </div>
    );
  }

  // Fiscal year not yet started.
  return (
    <div className="flex min-w-0 flex-col items-center gap-3 rounded-3xl border border-dashed border-border bg-surface p-10 text-center">
      <h2 className="text-lg font-semibold text-text-primary">
        {t('yearNotStarted.title', {
          fiscalYear: model.fiscal_year_start.slice(0, 4),
        })}
      </h2>
      <p className="max-w-md text-sm text-text-secondary">
        {t('yearNotStarted.body', {
          date: new Date(model.fiscal_year_start).toLocaleDateString(locale),
        })}
      </p>
    </div>
  );
}

function EmptyVarianceState() {
  const t = useTranslations('financeBudgetingVariance.empty');
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 rounded-3xl border border-dashed border-border bg-surface p-10 text-center">
      <h2 className="text-base font-semibold text-text-primary">{t('title')}</h2>
      <p className="max-w-md text-sm text-text-secondary">{t('body')}</p>
    </div>
  );
}
