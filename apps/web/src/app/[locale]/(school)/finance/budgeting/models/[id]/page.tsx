'use client';

import { BarChart3, FileText, Send, Sliders, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  mergeDriverOverrides,
  runEngine,
  type Drivers,
  type EngineWarning,
  type PerPupilEconomics,
  type SourceDataSnapshot,
  type YearTotals,
} from '@school/shared/budgeting';
import { Badge, Button, Skeleton, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { useTenantCurrency } from '../../../_components/use-tenant-currency';

import { DriversDrawer } from './_components/drivers-drawer';
import { KpiStrip } from './_components/kpi-strip';
import { LineItemTable } from './_components/line-item-table';
import { ScenarioStrip } from './_components/scenario-strip';
import type {
  DetailResponse,
  LineItemRow,
  ModelSummary,
  ScenarioDetail,
} from './_components/workspace-types';
import { YearSelector } from './_components/year-selector';
import { PublishModal } from './snapshots/_components/publish-modal';

const SAVE_DEBOUNCE_MS = 500;

interface Props {
  params: { locale: string; id: string };
}

export default function FinancialModelWorkspacePage({ params }: Props) {
  const t = useTranslations('financeBudgetingWorkspace');
  const tHeader = useTranslations('financeBudgetingWorkspace.header');
  const tHub = useTranslations('financeBudgeting');
  const router = useRouter();
  const currencyCode = useTenantCurrency();
  const locale = params.locale ?? 'en';
  const modelId = params.id;

  const [model, setModel] = React.useState<ModelSummary | null>(null);
  const [scenarios, setScenarios] = React.useState<ScenarioDetail[]>([]);
  const [storedRows, setStoredRows] = React.useState<LineItemRow[]>([]);
  const [drivers, setDrivers] = React.useState<Drivers | null>(null);
  const [activeScenarioId, setActiveScenarioId] = React.useState<string | null>(null);
  const [activeYear, setActiveYear] = React.useState<number>(1);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [drawerOpen, setDrawerOpen] = React.useState<boolean>(false);
  const [publishModalOpen, setPublishModalOpen] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  // Pristine drivers loaded from server — used to detect "dirty" state.
  const pristineDriversRef = React.useRef<Drivers | null>(null);

  // ─── Load model + scenarios + line items ───────────────────────────────

  const reload = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const detailRes = await apiClient<{ data: DetailResponse } | DetailResponse>(
        `/api/v1/budgeting/financial-models/${modelId}`,
      );
      const detail: DetailResponse = 'data' in detailRes ? detailRes.data : detailRes;

      // Fetch full scenario list with driver_overrides (the detail endpoint
      // only returns a summary). If the list is empty, skip the call.
      let scenariosWithOverrides: ScenarioDetail[] = [];
      if (detail.scenarios.length > 0) {
        const scenRes = await apiClient<{ data: ScenarioDetail[] } | ScenarioDetail[]>(
          `/api/v1/budgeting/financial-models/${modelId}/scenarios`,
        );
        scenariosWithOverrides = Array.isArray(scenRes)
          ? scenRes
          : ((scenRes as { data: ScenarioDetail[] }).data ?? []);
      }

      setModel(detail.model);
      setScenarios(scenariosWithOverrides);
      setStoredRows(detail.line_items);
      setDrivers(detail.model.drivers);
      pristineDriversRef.current = detail.model.drivers;
    } catch (err) {
      console.error('[FinancialModelWorkspace.load]', err);
      const status =
        (err as { status?: number; statusCode?: number }).status ??
        (err as { statusCode?: number }).statusCode;
      if (status === 404) {
        toast.error(t('notFound'));
        router.replace(`/${locale}/finance/budgeting/models`);
        return;
      }
      setError(err instanceof Error ? err.message : t('loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [modelId, locale, router, t]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  // ─── Debounced PATCH on driver change ──────────────────────────────────

  React.useEffect(() => {
    if (!drivers || !pristineDriversRef.current || activeScenarioId !== null) return;
    // Only persist when drivers actually changed.
    if (JSON.stringify(drivers) === JSON.stringify(pristineDriversRef.current)) return;

    const handle = setTimeout(async () => {
      setIsSaving(true);
      try {
        await apiClient(`/api/v1/budgeting/financial-models/${modelId}`, {
          method: 'PATCH',
          body: JSON.stringify({ drivers }),
          headers: { 'Content-Type': 'application/json' },
        });
        // Reload to pick up server-recomputed line items.
        const detailRes = await apiClient<{ data: DetailResponse } | DetailResponse>(
          `/api/v1/budgeting/financial-models/${modelId}`,
        );
        const detail = 'data' in detailRes ? detailRes.data : detailRes;
        setStoredRows(detail.line_items);
        pristineDriversRef.current = detail.model.drivers;
      } catch (err) {
        console.error('[FinancialModelWorkspace.save]', err);
        toast.error(t('saveFailed'));
      } finally {
        setIsSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [drivers, modelId, activeScenarioId, t]);

  // ─── Engine outputs (computed from drivers + active scenario) ─────────

  const engineOutput: {
    totals: YearTotals[];
    perPupil: PerPupilEconomics[];
    warnings: EngineWarning[];
  } = React.useMemo(() => {
    if (!drivers || !model) return { totals: [], perPupil: [], warnings: [] };

    const activeDrivers =
      activeScenarioId === null
        ? drivers
        : mergeDriverOverrides(
            drivers,
            scenarios.find((s) => s.id === activeScenarioId)?.driver_overrides ?? {},
          );

    try {
      const out = runEngine({
        drivers: activeDrivers,
        source: model.source_snapshot_json as SourceDataSnapshot,
        horizon_years: model.horizon_years,
      });
      return {
        totals: out.totals_by_year,
        perPupil: out.per_pupil_unit_economics,
        warnings: out.warnings,
      };
    } catch (err) {
      console.error('[FinancialModelWorkspace.engine]', err);
      return { totals: [], perPupil: [], warnings: [] };
    }
  }, [drivers, model, activeScenarioId, scenarios]);

  if (isLoading || !model || !drivers) {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-6">
        <Skeleton className="h-12 w-1/2" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
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

  const activeTotals = engineOutput.totals.find((tt) => tt.fiscal_year === activeYear) ?? null;
  const activePerPupil = engineOutput.perPupil.find((pp) => pp.fiscal_year === activeYear) ?? null;
  const activeScenarioName =
    activeScenarioId === null
      ? null
      : (scenarios.find((s) => s.id === activeScenarioId)?.name ?? null);

  const canCompare = scenarios.length >= 1;
  const canVariance = model.current_snapshot_id !== null;

  return (
    <div className="flex min-w-0 flex-col gap-4 p-6 pb-10">
      <PageHeader
        title={model.name}
        description={
          model.status === 'published' ? tHeader('publishedV', { n: 1 }) : tHeader(model.status)
        }
        back={{
          href: `/${locale}/finance/budgeting/models`,
          label: tHub('models.title'),
        }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setDrawerOpen(true)}>
              <Sliders className="me-2 h-4 w-4" />
              {tHeader('drivers')}
            </Button>
            <Button asChild variant="outline" disabled={!canCompare}>
              <Link
                href={canCompare ? `/${locale}/finance/budgeting/models/${modelId}/compare` : '#'}
                aria-disabled={!canCompare}
                title={!canCompare ? tHeader('compareDisabled') : undefined}
              >
                <BarChart3 className="me-2 h-4 w-4" />
                {tHeader('compare')}
              </Link>
            </Button>
            <Button asChild variant="outline" disabled={!canVariance}>
              <Link
                href={canVariance ? `/${locale}/finance/budgeting/models/${modelId}/variance` : '#'}
                aria-disabled={!canVariance}
                title={!canVariance ? tHeader('varianceDisabled') : undefined}
              >
                <TrendingUp className="me-2 h-4 w-4" />
                {tHeader('variance')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/${locale}/finance/budgeting/models/${modelId}/snapshots`}>
                <FileText className="me-2 h-4 w-4" />
                {tHeader('snapshots')}
              </Link>
            </Button>
            {model.status === 'draft' && (
              <Button onClick={() => setPublishModalOpen(true)}>
                <Send className="me-2 h-4 w-4" />
                {tHeader('publish')}
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={model.status === 'published' ? 'success' : 'secondary'}>
          {tHeader(model.status)}
        </Badge>
      </div>

      <KpiStrip
        totals={activeTotals}
        perPupil={activePerPupil}
        year={activeYear}
        currencyCode={currencyCode}
        locale={locale}
        isSaving={isSaving}
      />

      <ScenarioStrip
        scenarios={scenarios}
        activeScenarioId={activeScenarioId}
        onSwitch={setActiveScenarioId}
        onScenarioCreated={(created) => setScenarios((s) => [...s, created])}
        modelId={modelId}
        canManage={model.status === 'draft'}
      />

      <YearSelector
        horizon={model.horizon_years}
        fiscalYearStart={model.fiscal_year_start}
        activeYear={activeYear}
        onChange={setActiveYear}
      />

      <LineItemTable
        storedRows={storedRows}
        activeYear={activeYear}
        activeScenarioId={activeScenarioId}
        modelId={modelId}
        currencyCode={currencyCode}
        locale={locale}
        canManage={model.status === 'draft' && activeScenarioId === null}
        onLineMutated={() => void reload()}
      />

      {engineOutput.warnings.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="mb-1 font-semibold">{t('warnings.title')}</p>
          <ul className="list-disc ps-5">
            {engineOutput.warnings.map((w, i) => (
              <li key={`${w.code}-${i}`}>{w.message ?? w.code}</li>
            ))}
          </ul>
        </section>
      )}

      <DriversDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        drivers={drivers}
        onChange={setDrivers}
        scenarioName={activeScenarioName}
      />

      <PublishModal
        open={publishModalOpen}
        modelId={modelId}
        modelName={model.name}
        onClose={() => setPublishModalOpen(false)}
        onPublished={(_id, versionNumber) => {
          toast.success(tHeader('publishedToast', { version: versionNumber }));
          router.push(`/${locale}/finance/budgeting/models/${modelId}/snapshots`);
        }}
      />
    </div>
  );
}
