'use client';

import { ArrowLeft, Printer } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { CurrencyDisplay } from '../_components/currency-display';
import { useTenantCurrency } from '../_components/use-tenant-currency';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebtRow {
  household_id: string;
  household_name: string;
  total_billed: number;
  outstanding: number;
  pct_owed: number;
  invoice_count: number;
  bucket: string;
  billing_parent_name: string | null;
  billing_parent_phone: string | null;
}

type BucketFilter = 'all' | '0_10' | '10_30' | '30_50' | '50_plus';

const BUCKET_TABS: Array<{ key: BucketFilter; labelKey: string; color: string }> = [
  { key: 'all', labelKey: 'debtBreakdown.allBuckets', color: '' },
  { key: '0_10', labelKey: 'debtBreakdown.bucket0to10', color: 'bg-success-400' },
  { key: '10_30', labelKey: 'debtBreakdown.bucket10to30', color: 'bg-warning-400' },
  { key: '30_50', labelKey: 'debtBreakdown.bucket30to50', color: 'bg-warning-600' },
  { key: '50_plus', labelKey: 'debtBreakdown.bucket50plus', color: 'bg-danger-500' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pctColor(pct: number): string {
  if (pct <= 10) return 'text-success-700';
  if (pct <= 30) return 'text-warning-700';
  if (pct <= 50) return 'text-warning-800';
  return 'text-danger-700';
}

function pctBg(pct: number): string {
  if (pct <= 10) return 'bg-success-100';
  if (pct <= 30) return 'bg-warning-100';
  if (pct <= 50) return 'bg-warning-200';
  return 'bg-danger-100';
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DebtBreakdownPage() {
  const t = useTranslations('finance');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const searchParams = useSearchParams();
  const validBuckets = React.useMemo<BucketFilter[]>(
    () => ['all', '0_10', '10_30', '30_50', '50_plus'],
    [],
  );
  const initialBucket = React.useMemo<BucketFilter>(() => {
    const q = searchParams?.get('bucket') ?? 'all';
    return validBuckets.includes(q as BucketFilter) ? (q as BucketFilter) : 'all';
  }, [searchParams, validBuckets]);
  const currencyCode = useTenantCurrency();

  const [rows, setRows] = React.useState<DebtRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeBucket, setActiveBucket] = React.useState<BucketFilter>(initialBucket);

  // Sync bucket state when user uses browser back/forward to change ?bucket=
  React.useEffect(() => {
    const urlBucket = searchParams?.get('bucket');
    const normalised: BucketFilter = validBuckets.includes(urlBucket as BucketFilter)
      ? (urlBucket as BucketFilter)
      : 'all';
    if (normalised !== activeBucket) {
      setActiveBucket(normalised);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, validBuckets]);

  const fetchData = React.useCallback(async (bucket: BucketFilter) => {
    setIsLoading(true);
    try {
      const qs = bucket !== 'all' ? `?bucket=${bucket}` : '';
      const res = await apiClient<{ data: DebtRow[] }>(
        `/api/v1/finance/dashboard/debt-breakdown${qs}`,
      );
      setRows(res.data);
    } catch (err) {
      console.error('[DebtBreakdown]', err);
      // Reset rows on error so stale data from a previous bucket doesn't
      // leak into the new view.
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData(activeBucket);
  }, [activeBucket, fetchData]);

  const handleBucketChange = (bucket: BucketFilter) => {
    setActiveBucket(bucket);
    // Keep the URL in sync with the active bucket so deep-links and
    // back/forward history both reflect the user's filter choice.
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    if (bucket === 'all') {
      params.delete('bucket');
    } else {
      params.set('bucket', bucket);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : (pathname ?? ''));
  };

  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/finance`}
          className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <PageHeader
          title={t('debtBreakdown.title')}
          description={t('debtBreakdown.description')}
          actions={
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="me-2 h-4 w-4" />
              {t('debtBreakdown.print')}
            </Button>
          }
        />
      </div>

      {/* Bucket filter tabs */}
      <div className="flex flex-wrap gap-2">
        {BUCKET_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleBucketChange(tab.key)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeBucket === tab.key
                ? 'bg-primary text-white shadow-sm'
                : 'border border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary'
            }`}
          >
            {tab.color && <div className={`h-2.5 w-2.5 rounded-full ${tab.color}`} />}
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Summary strip */}
      {!isLoading && rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-surface-secondary/50 px-5 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              {t('householdsPluralLabel')}
            </p>
            <p className="text-lg font-bold text-text-primary">{rows.length}</p>
          </div>
          <div className="h-8 w-px bg-border" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              {t('debtBreakdown.colOutstanding')}
            </p>
            <CurrencyDisplay
              amount={totalOutstanding}
              currency_code={currencyCode}
              className="text-lg font-bold text-danger-600"
              locale={locale}
            />
          </div>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center rounded-2xl bg-surface-secondary p-12">
          <p className="text-sm text-text-tertiary">{t('debtBreakdown.noResults')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('debtBreakdown.colHousehold')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('debtBreakdown.colBillingParent')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('debtBreakdown.colPhone')}
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('debtBreakdown.colTotalBilled')}
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('debtBreakdown.colOutstanding')}
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('debtBreakdown.colPctOwed')}
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('debtBreakdown.colInvoices')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.household_id}
                  className="border-b border-border last:border-b-0 cursor-pointer transition-colors hover:bg-surface-secondary"
                  onClick={() => router.push(`/${locale}/finance/statements/${row.household_id}`)}
                >
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {row.household_name}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {row.billing_parent_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-text-secondary" dir="ltr">
                    {row.billing_parent_phone ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-end" dir="ltr">
                    <CurrencyDisplay
                      amount={row.total_billed}
                      currency_code={currencyCode}
                      className="font-mono text-sm text-text-secondary"
                      locale={locale}
                    />
                  </td>
                  <td className="px-4 py-3 text-end" dir="ltr">
                    <CurrencyDisplay
                      amount={row.outstanding}
                      currency_code={currencyCode}
                      className="font-mono text-sm font-semibold text-text-primary"
                      locale={locale}
                    />
                  </td>
                  <td className="px-4 py-3 text-end" dir="ltr">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${pctColor(row.pct_owed)} ${pctBg(row.pct_owed)}`}
                    >
                      {row.pct_owed.toFixed(1)}%
                    </span>
                  </td>
                  <td
                    className="px-4 py-3 text-end font-mono text-sm text-text-secondary"
                    dir="ltr"
                  >
                    {row.invoice_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
