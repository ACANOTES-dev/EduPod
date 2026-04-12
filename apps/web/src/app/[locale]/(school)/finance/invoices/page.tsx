'use client';

import { FileText, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { EmptyState, Input } from '@school/ui';

import { DataTable } from '@/components/data-table';
import { EntityLink } from '@/components/entity-link';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CurrencyDisplay } from '../_components/currency-display';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InvoiceHousehold {
  id: string;
  household_name: string;
}

interface InvoiceLineStudent {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
}

interface InvoiceLine {
  id: string;
  description: string;
  line_total: number;
  student_id: string | null;
  student?: InvoiceLineStudent | null;
}

interface Invoice {
  id: string;
  invoice_number: string;
  total_amount: number;
  due_date: string;
  issue_date: string | null;
  currency_code: string;
  household?: InvoiceHousehold | null;
  lines?: InvoiceLine[];
}

/** Flattened row: one per invoice-line (or one per invoice when no lines) */
interface InvoiceRow {
  /** Unique key for the row */
  rowKey: string;
  invoiceId: string;
  invoiceNumber: string;
  issueDate: string | null;
  dueDate: string;
  currencyCode: string;
  totalAmount: number;
  household: InvoiceHousehold | null;
  studentName: string | null;
  studentNumber: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flattenInvoices(invoices: Invoice[]): InvoiceRow[] {
  const rows: InvoiceRow[] = [];

  for (const inv of invoices) {
    const lines = inv.lines ?? [];

    if (lines.length === 0) {
      rows.push({
        rowKey: inv.id,
        invoiceId: inv.id,
        invoiceNumber: inv.invoice_number,
        issueDate: inv.issue_date,
        dueDate: inv.due_date,
        currencyCode: inv.currency_code,
        totalAmount: inv.total_amount,
        household: inv.household ?? null,
        studentName: null,
        studentNumber: null,
      });
    } else {
      for (const line of lines) {
        const student = line.student ?? null;
        rows.push({
          rowKey: `${inv.id}_${line.id}`,
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          issueDate: inv.issue_date,
          dueDate: inv.due_date,
          currencyCode: inv.currency_code,
          totalAmount: line.line_total,
          household: inv.household ?? null,
          studentName: student ? `${student.first_name} ${student.last_name}` : null,
          studentNumber: student?.student_number ?? null,
        });
      }
    }
  }

  return rows;
}

// ─── Page Component ───────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const t = useTranslations('finance');
  const router = useRouter();

  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  const fetchInvoices = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        include_lines: 'true',
      });
      if (search) params.set('search', search);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const res = await apiClient<{ data: Invoice[]; meta: { total: number } }>(
        `/api/v1/finance/invoices?${params.toString()}`,
      );
      setInvoices(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[FinanceInvoicesPage]', err);
      setInvoices([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, dateFrom, dateTo]);

  React.useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  React.useEffect(() => {
    setPage(1);
  }, [search, dateFrom, dateTo]);

  const rows = React.useMemo(() => flattenInvoices(invoices), [invoices]);

  // ─── Columns ──────────────────────────────────────────────────

  const columns = [
    {
      key: 'issue_date',
      header: 'Issue Date',
      render: (row: InvoiceRow) => (
        <span className="text-sm text-text-secondary">
          {row.issueDate ? formatDate(row.issueDate) : '--'}
        </span>
      ),
    },
    {
      key: 'invoice_number',
      header: 'Invoice #',
      render: (row: InvoiceRow) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/finance/invoices/${row.invoiceId}`);
          }}
          className="font-mono text-xs text-primary-600 hover:underline"
        >
          {row.invoiceNumber}
        </button>
      ),
    },
    {
      key: 'household',
      header: 'Household',
      render: (row: InvoiceRow) =>
        row.household ? (
          <EntityLink
            entityType="household"
            entityId={row.household.id}
            label={row.household.household_name}
            href={`/households/${row.household.id}`}
          />
        ) : (
          <span className="text-text-tertiary">--</span>
        ),
    },
    {
      key: 'student_name',
      header: 'Student',
      render: (row: InvoiceRow) => (
        <span className="text-sm text-text-primary">{row.studentName ?? '--'}</span>
      ),
    },
    {
      key: 'student_number',
      header: 'Student #',
      render: (row: InvoiceRow) => (
        <span className="font-mono text-xs text-text-secondary">{row.studentNumber ?? '--'}</span>
      ),
    },
    {
      key: 'total_amount',
      header: 'Total',
      className: 'text-end',
      render: (row: InvoiceRow) => (
        <CurrencyDisplay
          amount={row.totalAmount}
          currency_code={row.currencyCode}
          className="font-medium"
        />
      ),
    },
    {
      key: 'due_date',
      header: 'Due Date',
      render: (row: InvoiceRow) => (
        <span className="text-sm text-text-secondary">{formatDate(row.dueDate)}</span>
      ),
    },
  ];

  // ─── Toolbar ──────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={t('searchInvoices')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      <Input
        type="date"
        placeholder={t('from')}
        value={dateFrom}
        onChange={(e) => setDateFrom(e.target.value)}
        className="w-full sm:w-[150px]"
      />

      <Input
        type="date"
        placeholder={t('to')}
        value={dateTo}
        onChange={(e) => setDateTo(e.target.value)}
        className="w-full sm:w-[150px]"
      />
    </div>
  );

  const hasActiveFilters = search || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <PageHeader title={t('navInvoices')} description="View invoices by student" />

      {!isLoading && rows.length === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={FileText}
          title={t('noInvoicesYet')}
          description="No invoices this term -- create fee assignments first, then run the fee generation wizard."
        />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/finance/invoices/${row.invoiceId}`)}
          keyExtractor={(row) => row.rowKey}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
