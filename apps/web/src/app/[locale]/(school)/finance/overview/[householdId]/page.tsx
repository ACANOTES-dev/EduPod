'use client';

import { ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { InvoiceStatus } from '@school/shared';
import { EmptyState } from '@school/ui';

import { DataTable } from '@/components/data-table';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CurrencyDisplay } from '../../_components/currency-display';
import { InvoiceStatusBadge } from '../../_components/invoice-status-badge';

// ─── Types ──────────────────────────────────────────────────────────────────

interface InvoiceLine {
  description: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  total_amount: number;
  balance_amount: number;
  due_date: string;
  issue_date: string | null;
  currency_code: string;
  lines?: InvoiceLine[];
}

interface Household {
  id: string;
  household_name: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function useLocale() {
  const pathname = usePathname();
  return (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
}

// ─── Summary Card ───────────────────────────────────────────────────────────

function SummaryCard({
  label,
  amount,
  currencyCode,
  variant,
}: {
  label: string;
  amount: number;
  currencyCode: string;
  variant: 'default' | 'success' | 'danger';
}) {
  const colorMap = {
    default: 'bg-surface border-border',
    success: 'bg-surface border-border',
    danger: 'bg-surface border-border',
  };
  const valueColorMap = {
    default: 'text-text-primary',
    success: 'text-success-700',
    danger: 'text-danger-600',
  };

  return (
    <div className={`rounded-2xl border p-5 ${colorMap[variant]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
        {label}
      </p>
      <div
        className={`mt-1 text-[28px] font-bold leading-tight tracking-tight ${valueColorMap[variant]}`}
      >
        <CurrencyDisplay amount={amount} currency_code={currencyCode} />
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function HouseholdInvoiceOverviewPage() {
  const t = useTranslations('finance');
  const params = useParams();
  const router = useRouter();
  const locale = useLocale();
  const householdId = params?.householdId as string;

  const [household, setHousehold] = React.useState<Household | null>(null);
  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const pageSize = 100;

  // ─── Fetch Data ─────────────────────────────────────────────────────────

  React.useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setIsLoading(true);
      try {
        const [householdRes, invoicesRes] = await Promise.all([
          apiClient<{ data: Household }>(`/api/v1/households/${householdId}`),
          apiClient<{ data: Invoice[]; meta: { total: number } }>(
            `/api/v1/finance/invoices?household_id=${householdId}&pageSize=${pageSize}`,
          ),
        ]);
        if (!cancelled) {
          setHousehold(householdRes.data);
          setInvoices(invoicesRes.data);
        }
      } catch (err) {
        console.error('[HouseholdInvoiceOverview]', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  // ─── Derived Summaries ──────────────────────────────────────────────────

  const summaries = React.useMemo(() => {
    let totalBilled = 0;
    let totalBalance = 0;
    for (const inv of invoices) {
      totalBilled += Number(inv.total_amount) || 0;
      totalBalance += Number(inv.balance_amount) || 0;
    }
    return {
      totalBilled,
      totalPaid: totalBilled - totalBalance,
      outstanding: totalBalance,
    };
  }, [invoices]);

  const currencyCode = invoices[0]?.currency_code ?? 'USD';

  // ─── Table Columns ─────────────────────────────────────────────────────

  const columns = React.useMemo(
    () => [
      {
        key: 'invoice_number',
        header: t('householdStatement.colInvoice'),
        render: (row: Invoice) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/${locale}/finance/invoices/${row.id}`);
            }}
            className="font-mono text-xs text-primary hover:underline"
          >
            {row.invoice_number}
          </button>
        ),
      },
      {
        key: 'status',
        header: t('status'),
        render: (row: Invoice) => <InvoiceStatusBadge status={row.status} />,
      },
      {
        key: 'description',
        header: t('householdStatement.colDescription'),
        render: (row: Invoice) => {
          const lines = row.lines ?? [];
          if (lines.length === 0) return <span className="text-text-tertiary">--</span>;
          if (lines.length === 1) {
            const firstLine = lines[0];
            return (
              <span className="text-sm text-text-secondary truncate max-w-[200px] block">
                {firstLine?.description ?? '--'}
              </span>
            );
          }
          return (
            <span className="text-sm text-text-secondary">
              {t('householdStatement.multipleItems')}
            </span>
          );
        },
      },
      {
        key: 'total_amount',
        header: t('totalAmount'),
        className: 'text-end',
        render: (row: Invoice) => (
          <CurrencyDisplay
            amount={row.total_amount}
            currency_code={row.currency_code}
            className="font-medium"
          />
        ),
      },
      {
        key: 'paid',
        header: t('householdStatement.colPaid'),
        className: 'text-end',
        render: (row: Invoice) => {
          const paid = (Number(row.total_amount) || 0) - (Number(row.balance_amount) || 0);
          return (
            <CurrencyDisplay
              amount={paid}
              currency_code={row.currency_code}
              className="text-text-secondary"
            />
          );
        },
      },
      {
        key: 'balance_amount',
        header: t('balance'),
        className: 'text-end',
        render: (row: Invoice) => (
          <CurrencyDisplay
            amount={row.balance_amount}
            currency_code={row.currency_code}
            className={
              row.balance_amount > 0 ? 'font-medium text-danger-text' : 'text-text-secondary'
            }
          />
        ),
      },
      {
        key: 'due_date',
        header: t('dueDate'),
        render: (row: Invoice) => (
          <span className="text-sm text-text-secondary">{formatDate(row.due_date)}</span>
        ),
      },
      {
        key: 'issue_date',
        header: t('issueDate'),
        render: (row: Invoice) => (
          <span className="text-sm text-text-secondary">
            {row.issue_date ? formatDate(row.issue_date) : '--'}
          </span>
        ),
      },
    ],
    [t, router, locale],
  );

  // ─── Loading State ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/finance/overview`}
          className="rounded-lg p-2 text-text-tertiary transition-colors hover:bg-surface-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            {household?.household_name ?? '--'}
          </h1>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label={t('householdStatement.totalBilled')}
          amount={summaries.totalBilled}
          currencyCode={currencyCode}
          variant="default"
        />
        <SummaryCard
          label={t('householdStatement.totalPaid')}
          amount={summaries.totalPaid}
          currencyCode={currencyCode}
          variant="success"
        />
        <SummaryCard
          label={t('householdStatement.outstandingBalance')}
          amount={summaries.outstanding}
          currencyCode={currencyCode}
          variant="danger"
        />
      </div>

      {/* Invoice Table */}
      {invoices.length === 0 ? (
        <EmptyState icon={FileText} title={t('householdStatement.noInvoices')} description="" />
      ) : (
        <DataTable
          columns={columns}
          data={invoices}
          page={page}
          pageSize={pageSize}
          total={invoices.length}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/${locale}/finance/invoices/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={false}
        />
      )}
    </div>
  );
}
