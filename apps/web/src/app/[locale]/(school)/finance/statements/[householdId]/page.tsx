'use client';

import type { HouseholdStatementData, StatementEntry } from '@school/shared';
import { Button, EmptyState, StatusBadge } from '@school/ui';
import { Calendar, FileText, Printer } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Date Filter (client) ─────────────────────────────────────────────────────

function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
}) {
  const t = useTranslations('finance');

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-text-tertiary" />
        <label className="text-sm text-text-secondary">{t('from')}</label>
        <input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-text-secondary">{t('to')}</label>
        <input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        />
      </div>
    </div>
  );
}

// ─── Entry Type Badge ─────────────────────────────────────────────────────────

const entryTypeVariantMap: Record<
  StatementEntry['type'],
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  invoice_issued: 'info',
  payment_received: 'success',
  allocation: 'neutral',
  refund: 'warning',
  write_off: 'danger',
};

const entryTypeLabelMap: Record<StatementEntry['type'], string> = {
  invoice_issued: 'Invoice',
  payment_received: 'Payment',
  allocation: 'Allocation',
  refund: 'Refund',
  write_off: 'Write-off',
};

function EntryTypeBadge({ type }: { type: StatementEntry['type'] }) {
  return (
    <StatusBadge status={entryTypeVariantMap[type]} dot>
      {entryTypeLabelMap[type]}
    </StatusBadge>
  );
}

// ─── Currency Formatter ───────────────────────────────────────────────────────

function formatAmount(value: number | null, currencyCode: string): string {
  if (value === null || value === undefined) return '--';
  return `${currencyCode} ${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HouseholdStatementPage() {
  const t = useTranslations('finance');
  const params = useParams();
  const householdId = params?.householdId as string;

  const [data, setData] = React.useState<HouseholdStatementData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Default date range: last 12 months
  const today = new Date();
  const twelveMonthsAgo = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
  const [fromDate, setFromDate] = React.useState(twelveMonthsAgo.toISOString().slice(0, 10));
  const [toDate, setToDate] = React.useState(today.toISOString().slice(0, 10));

  const fetchStatement = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const qs = params.toString();
      const url = `/api/v1/finance/household-statements/${householdId}${qs ? `?${qs}` : ''}`;
      const res = await apiClient<{ data: HouseholdStatementData }>(url);
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [householdId, fromDate, toDate]);

  React.useEffect(() => {
    void fetchStatement();
  }, [fetchStatement]);

  async function handlePrintPdf() {
    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    const qs = params.toString();
    try {
      const { downloadAuthenticatedPdf } = await import('@/lib/download-pdf');
      await downloadAuthenticatedPdf(
        `/api/v1/finance/household-statements/${householdId}/pdf${qs ? `?${qs}` : ''}`,
      );
    } catch {
      // error handled
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-4 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={FileText}
        title={t('noStatementData')}
        description={t('noStatementDataDesc')}
      />
    );
  }

  const currency = data.currency_code;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={t('householdStatement')}
        description={data.household.household_name}
        actions={
          <Button variant="outline" onClick={handlePrintPdf}>
            <Printer className="me-2 h-4 w-4" />
            {t('printPdf')}
          </Button>
        }
      />

      {/* Billing parent info */}
      {data.household.billing_parent_name && (
        <p className="text-sm text-text-secondary">
          {t('billingParent')}: <span className="font-medium text-text-primary">{data.household.billing_parent_name}</span>
        </p>
      )}

      {/* Date filter */}
      <DateRangeFilter
        from={fromDate}
        to={toDate}
        onFromChange={setFromDate}
        onToChange={setToDate}
      />

      {/* Ledger Table */}
      <div className="rounded-2xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('date')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('type')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('reference')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('description')}
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('debit')}
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('credit')}
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('runningBalance')}
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Opening balance */}
              <tr className="border-b border-border bg-surface-secondary/50">
                <td colSpan={4} className="px-4 py-3 text-sm font-medium text-text-primary">
                  {t('openingBalance')}
                </td>
                <td className="px-4 py-3 text-end text-sm font-mono text-text-tertiary">--</td>
                <td className="px-4 py-3 text-end text-sm font-mono text-text-tertiary">--</td>
                <td className="px-4 py-3 text-end text-sm font-mono font-medium text-text-primary">
                  {formatAmount(data.opening_balance, currency)}
                </td>
              </tr>

              {/* Entries */}
              {data.entries.map((entry, idx) => (
                <tr
                  key={`${entry.reference}-${idx}`}
                  className="border-b border-border last:border-b-0 hover:bg-surface-secondary/50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm text-text-secondary whitespace-nowrap">
                    {new Date(entry.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <EntryTypeBadge type={entry.type} />
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-text-secondary">
                    {entry.reference}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary max-w-[300px] truncate">
                    {entry.description}
                  </td>
                  <td className="px-4 py-3 text-end text-sm font-mono text-text-primary">
                    {entry.debit !== null ? formatAmount(entry.debit, currency) : '--'}
                  </td>
                  <td className="px-4 py-3 text-end text-sm font-mono text-text-primary">
                    {entry.credit !== null ? formatAmount(entry.credit, currency) : '--'}
                  </td>
                  <td className="px-4 py-3 text-end text-sm font-mono font-medium text-text-primary">
                    {formatAmount(entry.running_balance, currency)}
                  </td>
                </tr>
              ))}

              {/* Closing balance */}
              <tr className="bg-surface-secondary/50">
                <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-text-primary">
                  {t('closingBalance')}
                </td>
                <td className="px-4 py-3 text-end text-sm font-mono text-text-tertiary">--</td>
                <td className="px-4 py-3 text-end text-sm font-mono text-text-tertiary">--</td>
                <td className="px-4 py-3 text-end text-sm font-mono font-semibold text-text-primary">
                  {formatAmount(data.closing_balance, currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {data.entries.length === 0 && (
        <div className="flex items-center justify-center rounded-2xl bg-surface-secondary p-8">
          <p className="text-sm text-text-tertiary">{t('noTransactions')}</p>
        </div>
      )}
    </div>
  );
}
