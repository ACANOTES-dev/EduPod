'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge } from '@school/ui';

import {
  PUBLIC_TABS,
  readSafePayload,
  type PublicShareResponse,
  type PublicTab,
} from './public-types';

interface Props {
  data: PublicShareResponse;
}

/**
 * Read-only snapshot renderer for the public open route. Four tabs
 * (Summary / Scenarios / Line items / Assumptions) deep-linked via URL
 * hash. Every value here is aggregate-only — the backend's
 * `filterPayloadForPublic` has already stripped household / student /
 * staff PII before we ever see the payload.
 */
export function PublicSnapshotRenderer({ data }: Props) {
  const t = useTranslations('financeBudgetingShare.public');
  const safe = readSafePayload(data.payload);

  const [tab, setTab] = React.useState<PublicTab>(() => {
    if (typeof window === 'undefined') return 'summary';
    const hash = window.location.hash.replace('#', '');
    if (PUBLIC_TABS.includes(hash as PublicTab)) return hash as PublicTab;
    return 'summary';
  });

  // Keep the hash in sync with the active tab so a copied URL deep-links.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const target = `#${tab}`;
    if (window.location.hash !== target) {
      window.history.replaceState(null, '', target);
    }
  }, [tab]);

  const totals = safe.totals_by_year ?? safe.base_case?.totals_by_year ?? [];
  const perPupil = safe.per_pupil_unit_economics ?? safe.base_case?.per_pupil_unit_economics ?? [];
  const baseLineItems = safe.line_items ?? safe.base_case?.line_items ?? [];
  const scenarios = safe.scenarios ?? [];
  const drivers = safe.drivers ?? {};

  const formatCurrency = (n: number): string => {
    try {
      return new Intl.NumberFormat('en', {
        style: 'currency',
        currency: data.currency_code,
        maximumFractionDigits: 0,
      }).format(n);
    } catch {
      return `${data.currency_code} ${n.toFixed(0)}`;
    }
  };

  const totalRevenue = totals.reduce((sum, y) => sum + (y.revenue ?? 0), 0);
  const totalExpenditure = totals.reduce((sum, y) => sum + (y.expenditure ?? 0), 0);
  const netResult = totalRevenue - totalExpenditure;
  const headlinePerPupil = perPupil[0];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* ─── Header ─── */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-6">
          <h1 className="text-2xl font-semibold text-text-primary">{data.tenant_name}</h1>
          <p className="text-sm text-text-secondary">
            {t('subtitle', {
              modelName: data.model_name,
              fy: data.fiscal_year_label,
              version: data.version_number,
              date: new Date(data.published_at).toLocaleDateString('en', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
            })}
          </p>
        </div>
      </header>

      {/* ─── Tabs ─── */}
      <nav
        role="tablist"
        aria-label={t('tabsAriaLabel')}
        className="border-b border-border bg-surface"
      >
        <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-6">
          {PUBLIC_TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`panel-${id}`}
              id={`tab-${id}`}
              onClick={() => setTab(id)}
              className={`min-h-11 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                tab === id
                  ? 'border-primary-500 text-primary-700'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {t(`tabs.${id}`)}
            </button>
          ))}
        </div>
      </nav>

      {/* ─── Body ─── */}
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-6 py-8">
          {tab === 'summary' && (
            <section
              role="tabpanel"
              id="panel-summary"
              aria-labelledby="tab-summary"
              className="flex flex-col gap-6"
            >
              {safe.executive_summary && (
                <article className="rounded-2xl border border-border bg-surface p-6">
                  <h2 className="text-base font-semibold text-text-primary">
                    {t('summary.executiveTitle')}
                  </h2>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-text-secondary">
                    {safe.executive_summary}
                  </p>
                </article>
              )}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <KpiCard label={t('summary.totalRevenue')} value={formatCurrency(totalRevenue)} />
                <KpiCard
                  label={t('summary.totalExpenditure')}
                  value={formatCurrency(totalExpenditure)}
                />
                <KpiCard
                  label={t('summary.netResult')}
                  value={formatCurrency(netResult)}
                  accent={netResult >= 0 ? 'positive' : 'negative'}
                />
                {headlinePerPupil && (
                  <KpiCard
                    label={t('summary.netPerPupil')}
                    value={formatCurrency(headlinePerPupil.net_per_student ?? 0)}
                    accent={(headlinePerPupil.net_per_student ?? 0) >= 0 ? 'positive' : 'negative'}
                  />
                )}
              </div>

              {totals.length > 0 && (
                <article className="overflow-x-auto rounded-2xl border border-border bg-surface">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-secondary">
                      <tr>
                        <th className="px-4 py-2 text-start font-medium text-text-secondary">
                          {t('summary.fiscalYear')}
                        </th>
                        <th className="px-4 py-2 text-end font-medium text-text-secondary">
                          {t('summary.revenue')}
                        </th>
                        <th className="px-4 py-2 text-end font-medium text-text-secondary">
                          {t('summary.expenditure')}
                        </th>
                        <th className="px-4 py-2 text-end font-medium text-text-secondary">
                          {t('summary.net')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {totals.map((y) => (
                        <tr key={y.fiscal_year} className="border-t border-border">
                          <td className="px-4 py-2 text-text-primary">{y.fiscal_year}</td>
                          <td className="px-4 py-2 text-end text-text-primary">
                            {formatCurrency(y.revenue ?? 0)}
                          </td>
                          <td className="px-4 py-2 text-end text-text-primary">
                            {formatCurrency(y.expenditure ?? 0)}
                          </td>
                          <td className="px-4 py-2 text-end font-semibold text-text-primary">
                            {formatCurrency(y.net_result ?? 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </article>
              )}

              <p className="text-center text-xs text-text-tertiary">{t('confidential')}</p>
            </section>
          )}

          {tab === 'scenarios' && (
            <section
              role="tabpanel"
              id="panel-scenarios"
              aria-labelledby="tab-scenarios"
              className="flex flex-col gap-4"
            >
              {scenarios.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-sm text-text-secondary">
                  {t('scenarios.empty')}
                </p>
              ) : (
                <>
                  <ScenarioCard
                    name={t('scenarios.baseCase')}
                    isBase
                    totals={totals}
                    formatCurrency={formatCurrency}
                  />
                  {scenarios.map((s, idx) => (
                    <ScenarioCard
                      key={s.name ?? idx}
                      name={s.name ?? `Scenario ${idx + 1}`}
                      isBase={false}
                      totals={s.totals_by_year ?? []}
                      formatCurrency={formatCurrency}
                    />
                  ))}
                </>
              )}
            </section>
          )}

          {tab === 'lineItems' && (
            <section
              role="tabpanel"
              id="panel-lineItems"
              aria-labelledby="tab-lineItems"
              className="flex flex-col gap-4"
            >
              {baseLineItems.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-sm text-text-secondary">
                  {t('lineItems.empty')}
                </p>
              ) : (
                <LineItemsByCategory items={baseLineItems} formatCurrency={formatCurrency} t={t} />
              )}
            </section>
          )}

          {tab === 'assumptions' && (
            <section
              role="tabpanel"
              id="panel-assumptions"
              aria-labelledby="tab-assumptions"
              className="flex flex-col gap-4"
            >
              <DriversTable drivers={drivers} t={t} />
            </section>
          )}
        </div>
      </main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-4 text-xs text-text-tertiary">
          {t('footer', { tenant: data.tenant_name })}
        </div>
      </footer>
    </div>
  );
}

function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'positive' | 'negative';
}) {
  const accentClass =
    accent === 'positive'
      ? 'text-emerald-700'
      : accent === 'negative'
        ? 'text-red-700'
        : 'text-text-primary';
  return (
    <article className="rounded-2xl border border-border bg-surface p-4">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accentClass}`}>{value}</p>
    </article>
  );
}

function ScenarioCard({
  name,
  isBase,
  totals,
  formatCurrency,
}: {
  name: string;
  isBase: boolean;
  totals: Array<{ fiscal_year: number; revenue: number; expenditure: number; net_result: number }>;
  formatCurrency: (n: number) => string;
}) {
  const t = useTranslations('financeBudgetingShare.public.summary');
  const tBadge = useTranslations('financeBudgetingShare.public.scenarios');
  const total = totals.reduce(
    (acc, y) => ({
      revenue: acc.revenue + (y.revenue ?? 0),
      expenditure: acc.expenditure + (y.expenditure ?? 0),
      net: acc.net + (y.net_result ?? 0),
    }),
    { revenue: 0, expenditure: 0, net: 0 },
  );

  return (
    <article className="rounded-2xl border border-border bg-surface p-5">
      <header className="flex items-center gap-2">
        <h3 className="text-base font-semibold text-text-primary">{name}</h3>
        {isBase && <Badge variant="secondary">{tBadge('baseBadge')}</Badge>}
      </header>
      <dl className="mt-4 grid grid-cols-3 gap-4">
        <div>
          <dt className="text-xs text-text-tertiary">{t('revenue')}</dt>
          <dd className="mt-1 text-base font-semibold text-text-primary">
            {formatCurrency(total.revenue)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('expenditure')}</dt>
          <dd className="mt-1 text-base font-semibold text-text-primary">
            {formatCurrency(total.expenditure)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">{t('net')}</dt>
          <dd
            className={`mt-1 text-base font-semibold ${
              total.net >= 0 ? 'text-emerald-700' : 'text-red-700'
            }`}
          >
            {formatCurrency(total.net)}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function LineItemsByCategory({
  items,
  formatCurrency,
  t,
}: {
  items: NonNullable<ReturnType<typeof readSafePayload>['line_items']>;
  formatCurrency: (n: number) => string;
  t: (key: string) => string;
}) {
  // Group by category + subcategory.
  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    const key = item.category ?? 'other';
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(item);
    return acc;
  }, {});

  const order = ['income', 'staff_costs', 'operations', 'capital', 'reserves_and_adjustments'];
  const sortedKeys = Object.keys(grouped).sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div className="flex flex-col gap-4">
      {sortedKeys.map((cat) => {
        const rows = grouped[cat] ?? [];
        const subtotal = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
        return (
          <article
            key={cat}
            className="overflow-x-auto rounded-2xl border border-border bg-surface"
          >
            <header className="flex items-center justify-between bg-surface-secondary px-4 py-2">
              <h3 className="text-sm font-semibold text-text-primary">
                {t(`lineItems.categories.${cat}`)}
              </h3>
              <span className="text-sm font-semibold text-text-primary">
                {formatCurrency(subtotal)}
              </span>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-start font-medium text-text-secondary">
                    {t('lineItems.name')}
                  </th>
                  <th className="px-4 py-2 text-start font-medium text-text-secondary">
                    {t('lineItems.fy')}
                  </th>
                  <th className="px-4 py-2 text-end font-medium text-text-secondary">
                    {t('lineItems.amount')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} className="border-t border-border">
                    <td className="px-4 py-2 text-text-primary">
                      {r.name ?? r.subcategory ?? '—'}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{r.fiscal_year ?? '—'}</td>
                    <td className="px-4 py-2 text-end text-text-primary">
                      {formatCurrency(r.amount ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        );
      })}
    </div>
  );
}

function DriversTable({
  drivers,
  t,
}: {
  drivers: Record<string, unknown>;
  t: (key: string) => string;
}) {
  const entries = Object.entries(drivers).filter(
    ([, v]) => v !== null && v !== undefined && typeof v !== 'object',
  );
  const objectEntries = Object.entries(drivers).filter(
    ([, v]) => typeof v === 'object' && v !== null,
  );

  if (entries.length === 0 && objectEntries.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-sm text-text-secondary">
        {t('assumptions.empty')}
      </p>
    );
  }

  return (
    <article className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-surface-secondary">
          <tr>
            <th className="px-4 py-2 text-start font-medium text-text-secondary">
              {t('assumptions.driver')}
            </th>
            <th className="px-4 py-2 text-end font-medium text-text-secondary">
              {t('assumptions.value')}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([k, v]) => (
            <tr key={k} className="border-t border-border">
              <td className="px-4 py-2 text-text-primary">{k}</td>
              <td className="px-4 py-2 text-end text-text-primary">
                {String(v as string | number | boolean)}
              </td>
            </tr>
          ))}
          {objectEntries.map(([k, v]) => (
            <tr key={k} className="border-t border-border">
              <td className="px-4 py-2 text-text-primary">{k}</td>
              <td className="px-4 py-2 text-end font-mono text-xs text-text-secondary" dir="ltr">
                {JSON.stringify(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
