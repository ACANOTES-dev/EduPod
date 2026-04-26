'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  mergeDriverOverrides,
  runEngine,
  type Drivers,
  type EngineOutputs,
} from '@school/shared/budgeting';
import { Button, Skeleton } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { useTenantCurrency } from '../../../../_components/use-tenant-currency';
import type { DetailResponse, ScenarioDetail } from '../_components/workspace-types';

import { CompareCards } from './_components/compare-cards';
import { CompareChart } from './_components/compare-chart';
import { CompareKpiStrip, type ScenarioColumn } from './_components/compare-kpi-strip';
import { CompareTable } from './_components/compare-table';
import { ViewToggle, type CompareView } from './_components/view-toggle';

interface Props {
  params: { locale: string; id: string };
}

interface ColumnComputed extends ScenarioColumn {
  mergedDrivers: Drivers;
  overrides: ScenarioDetail['driver_overrides'] | null;
  engineRun: EngineOutputs;
}

const VALID_VIEWS: CompareView[] = ['chart', 'cards', 'table'];

export default function CompareScenariosPage({ params }: Props) {
  const t = useTranslations('financeBudgetingCompare');
  const tWorkspace = useTranslations('financeBudgetingWorkspace.yearSelector');
  const router = useRouter();
  const searchParams = useSearchParams();
  const currencyCode = useTenantCurrency();
  const locale = params.locale ?? 'en';
  const modelId = params.id;

  const initialView = (searchParams?.get('view') as CompareView | null) ?? 'chart';
  const initialYear = Number(searchParams?.get('year') ?? '1');

  const [detail, setDetail] = React.useState<DetailResponse | null>(null);
  const [scenarios, setScenarios] = React.useState<ScenarioDetail[]>([]);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [view, setViewState] = React.useState<CompareView>(
    VALID_VIEWS.includes(initialView) ? initialView : 'chart',
  );
  const [activeYear, setActiveYearState] = React.useState<number>(
    Number.isFinite(initialYear) && initialYear >= 1 ? initialYear : 1,
  );

  // Load.
  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    void (async () => {
      try {
        const detailRes = await apiClient<{ data: DetailResponse } | DetailResponse>(
          `/api/v1/budgeting/financial-models/${modelId}`,
        );
        if (cancelled) return;
        const d = 'data' in detailRes ? detailRes.data : detailRes;

        let scens: ScenarioDetail[] = [];
        if (d.scenarios.length > 0) {
          const scenRes = await apiClient<{ data: ScenarioDetail[] } | ScenarioDetail[]>(
            `/api/v1/budgeting/financial-models/${modelId}/scenarios`,
          );
          if (cancelled) return;
          scens = Array.isArray(scenRes)
            ? scenRes
            : ((scenRes as { data: ScenarioDetail[] }).data ?? []);
        }

        setDetail(d);
        setScenarios(scens);
      } catch (err) {
        if (cancelled) return;
        console.error('[CompareScenarios.load]', err);
        setError(err instanceof Error ? err.message : t('loadError'));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [modelId, t]);

  const setView = React.useCallback(
    (next: CompareView) => {
      setViewState(next);
      const url = new URL(window.location.href);
      url.searchParams.set('view', next);
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    },
    [router],
  );

  const setActiveYear = React.useCallback(
    (next: number) => {
      setActiveYearState(next);
      const url = new URL(window.location.href);
      url.searchParams.set('year', String(next));
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    },
    [router],
  );

  // Compute engine outputs for base + each scenario.
  const compareData = React.useMemo((): {
    columns: ColumnComputed[];
    baseDrivers: Drivers | null;
  } => {
    if (!detail) return { columns: [], baseDrivers: null };
    const baseDrivers = detail.model.drivers;

    const baseEngine = safeRunEngine({
      drivers: baseDrivers,
      source: detail.model.source_snapshot_json,
      horizon_years: detail.model.horizon_years,
    });

    const columns: ColumnComputed[] = [];
    if (baseEngine) {
      const totals =
        baseEngine.totals_by_year.find((r) => r.fiscal_year === activeYear) ??
        baseEngine.totals_by_year[0]!;
      const perPupil =
        baseEngine.per_pupil_unit_economics.find((r) => r.fiscal_year === activeYear) ??
        baseEngine.per_pupil_unit_economics[0]!;
      columns.push({
        id: null,
        name: t('baseLabel'),
        totals,
        perPupil,
        mergedDrivers: baseDrivers,
        overrides: null,
        engineRun: baseEngine,
      });
    }
    for (const s of scenarios) {
      const merged = mergeDriverOverrides(baseDrivers, s.driver_overrides);
      const eng = safeRunEngine({
        drivers: merged,
        source: detail.model.source_snapshot_json,
        horizon_years: detail.model.horizon_years,
      });
      if (!eng) continue;
      const totals =
        eng.totals_by_year.find((r) => r.fiscal_year === activeYear) ?? eng.totals_by_year[0]!;
      const perPupil =
        eng.per_pupil_unit_economics.find((r) => r.fiscal_year === activeYear) ??
        eng.per_pupil_unit_economics[0]!;
      columns.push({
        id: s.id,
        name: s.name,
        totals,
        perPupil,
        mergedDrivers: merged,
        overrides: s.driver_overrides,
        engineRun: eng,
      });
    }
    return { columns, baseDrivers };
  }, [detail, scenarios, activeYear, t]);

  if (isLoading || !detail) {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-6">
        <Skeleton className="h-12 w-1/2" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
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

  if (scenarios.length === 0) {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-6 pb-10">
        <PageHeader
          title={t('title')}
          description={detail.model.name}
          back={{
            href: `/${locale}/finance/budgeting/models/${modelId}`,
            label: t('back'),
          }}
        />
        <div className="flex min-w-0 flex-col items-center gap-3 rounded-3xl border border-dashed border-border bg-surface p-10 text-center">
          <h2 className="text-lg font-semibold text-text-primary">{t('noScenarios')}</h2>
          <p className="max-w-sm text-sm text-text-secondary">{t('noScenariosBody')}</p>
          <Button asChild>
            <Link href={`/${locale}/finance/budgeting/models/${modelId}`}>{t('back')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const baseTotals = compareData.columns[0]?.totals ?? {
    fiscal_year: activeYear,
    revenue: 0,
    expenditure: 0,
    net_result: 0,
  };

  return (
    <div className="flex min-w-0 flex-col gap-4 p-6 pb-10">
      <PageHeader
        title={t('title')}
        description={detail.model.name}
        back={{
          href: `/${locale}/finance/budgeting/models/${modelId}`,
          label: t('back'),
        }}
        actions={<ViewToggle view={view} onChange={setView} />}
      />

      <CompareKpiStrip
        columns={compareData.columns}
        baseTotals={baseTotals}
        year={activeYear}
        currencyCode={currencyCode}
        locale={locale}
      />

      {detail.model.horizon_years > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-border bg-surface p-3">
          {Array.from({ length: detail.model.horizon_years }, (_, i) => i + 1).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setActiveYear(y)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                activeYear === y
                  ? 'bg-primary-600 text-white'
                  : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
              }`}
            >
              {tWorkspace('yearN', { n: y })}
            </button>
          ))}
        </div>
      )}

      {view === 'chart' && (
        <CompareChart columns={compareData.columns} currencyCode={currencyCode} locale={locale} />
      )}
      {view === 'cards' && compareData.baseDrivers && (
        <CompareCards
          columns={compareData.columns}
          baseDrivers={compareData.baseDrivers}
          currencyCode={currencyCode}
          locale={locale}
        />
      )}
      {view === 'table' && (
        <CompareTable
          columns={compareData.columns.map((c) => ({
            id: c.id,
            name: c.name,
            totals: c.totals,
            perPupil: c.perPupil,
            lineItems: c.engineRun.line_items,
          }))}
          year={activeYear}
          currencyCode={currencyCode}
          locale={locale}
        />
      )}
    </div>
  );
}

function safeRunEngine(input: Parameters<typeof runEngine>[0]): EngineOutputs | null {
  try {
    return runEngine(input);
  } catch (err) {
    console.error('[CompareScenarios.engine]', err);
    return null;
  }
}
