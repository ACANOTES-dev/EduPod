'use client';

import { FileText, Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { InvoiceStatus } from '@school/shared';
import {
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { EntityLink } from '@/components/entity-link';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CurrencyDisplay } from '../_components/currency-display';
import { InvoiceStatusBadge } from '../_components/invoice-status-badge';
import { useTenantCurrency } from '../_components/use-tenant-currency';

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
  status: InvoiceStatus;
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
  status: InvoiceStatus;
  issueDate: string | null;
  dueDate: string;
  currencyCode: string;
  totalAmount: number;
  household: InvoiceHousehold | null;
  studentName: string | null;
  studentNumber: string | null;
}

const STATUS_OPTIONS: Array<{ value: 'all' | InvoiceStatus; labelKey: string }> = [
  { value: 'all', labelKey: 'allStatuses' },
  { value: 'draft', labelKey: 'draft' },
  { value: 'pending_approval', labelKey: 'pendingApproval' },
  { value: 'issued', labelKey: 'issued' },
  { value: 'partially_paid', labelKey: 'partiallyPaid' },
  { value: 'paid', labelKey: 'paid' },
  { value: 'overdue', labelKey: 'overdue' },
  { value: 'void', labelKey: 'void' },
  { value: 'cancelled', labelKey: 'cancelled' },
  { value: 'written_off', labelKey: 'writtenOff' },
];

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
        status: inv.status,
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
          status: inv.status,
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
  const searchParams = useSearchParams();
  const currencyCode = useTenantCurrency();

  const initialStatus = React.useMemo<'all' | InvoiceStatus>(() => {
    const q = searchParams?.get('status') ?? '';
    const allowed = STATUS_OPTIONS.map((o) => o.value);
    return (allowed as string[]).includes(q) ? (q as 'all' | InvoiceStatus) : 'all';
  }, [searchParams]);

  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [searchInput, setSearchInput] = React.useState('');
  const [search, setSearch] = React.useState(''); // debounced
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | InvoiceStatus>(initialStatus);

  // Debounce the search input — 300ms — to avoid firing a request on every keystroke.
  React.useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

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
      if (statusFilter !== 'all') params.set('status', statusFilter);

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
  }, [page, search, dateFrom, dateTo, statusFilter]);

  React.useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  React.useEffect(() => {
    setPage(1);
  }, [search, dateFrom, dateTo, statusFilter]);

  const rows = React.useMemo(() => flattenInvoices(invoices), [invoices]);

  // ─── Columns ──────────────────────────────────────────────────

  const columns = [
    {
      key: 'issue_date',
      header: t('issueDate'),
      render: (row: InvoiceRow) => (
        <span className="text-sm text-text-secondary">
          {row.issueDate ? formatDate(row.issueDate) : '--'}
        </span>
      ),
    },
    {
      key: 'invoice_number',
      header: t('invoiceNumber'),
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
      header: t('household'),
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
      header: t('colStudent'),
      render: (row: InvoiceRow) => (
        <span className="text-sm text-text-primary">{row.studentName ?? '--'}</span>
      ),
    },
    {
      key: 'student_number',
      header: t('colStudentNumber'),
      render: (row: InvoiceRow) => (
        <span className="font-mono text-xs text-text-secondary">{row.studentNumber ?? '--'}</span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: InvoiceRow) => <InvoiceStatusBadge status={row.status} />,
    },
    {
      key: 'total_amount',
      header: t('total'),
      className: 'text-end',
      render: (row: InvoiceRow) => (
        <CurrencyDisplay
          amount={row.totalAmount}
          currency_code={currencyCode}
          className="font-medium"
        />
      ),
    },
    {
      key: 'due_date',
      header: t('dueDate'),
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
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="ps-9"
        />
      </div>

      <Select
        value={statusFilter}
        onValueChange={(value) => setStatusFilter(value as 'all' | InvoiceStatus)}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder={t('status')} />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {t(opt.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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

  const hasActiveFilters = Boolean(search || dateFrom || dateTo || statusFilter !== 'all');

  return (
    <div className="space-y-6">
      <PageHeader title={t('navInvoices')} description={t('invoicesListDescription')} />

      {!isLoading && rows.length === 0 && !hasActiveFilters ? (
        <EmptyState icon={FileText} title={t('noInvoicesYet')} description={t('noInvoicesDesc')} />
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
