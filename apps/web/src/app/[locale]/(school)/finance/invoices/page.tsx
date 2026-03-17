'use client';

import { FileText, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import {
  Input,
  EmptyState,
} from '@school/ui';
import type { InvoiceStatus } from '@school/shared';
import { DataTable } from '@/components/data-table';
import { EntityLink } from '@/components/entity-link';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';
import { InvoiceStatusBadge } from '../_components/invoice-status-badge';
import { CurrencyDisplay } from '../_components/currency-display';

interface InvoiceHousehold {
  id: string;
  household_name: string;
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
  household?: InvoiceHousehold | null;
}

const statusTabs: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending' },
  { value: 'issued', label: 'Issued' },
  { value: 'partially_paid', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'void,cancelled,written_off', label: 'Closed' },
];

export default function InvoicesPage() {
  const router = useRouter();

  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [householdFilter, ] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  const fetchInvoices = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (householdFilter) params.set('household_id', householdFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const res = await apiClient<{ data: Invoice[]; meta: { total: number } }>(
        `/api/v1/finance/invoices?${params.toString()}`,
      );
      setInvoices(res.data);
      setTotal(res.meta.total);
    } catch {
      setInvoices([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, householdFilter, dateFrom, dateTo]);

  React.useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter, householdFilter, dateFrom, dateTo]);

  const columns = [
    {
      key: 'invoice_number',
      header: 'Invoice #',
      render: (row: Invoice) => (
        <span className="font-mono text-xs text-text-secondary">{row.invoice_number}</span>
      ),
    },
    {
      key: 'household',
      header: 'Household',
      render: (row: Invoice) =>
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
      key: 'status',
      header: 'Status',
      render: (row: Invoice) => <InvoiceStatusBadge status={row.status} />,
    },
    {
      key: 'total_amount',
      header: 'Total',
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
      key: 'balance_amount',
      header: 'Balance',
      className: 'text-end',
      render: (row: Invoice) => (
        <CurrencyDisplay
          amount={row.balance_amount}
          currency_code={row.currency_code}
          className={row.balance_amount > 0 ? 'font-medium text-danger-text' : 'text-text-secondary'}
        />
      ),
    },
    {
      key: 'due_date',
      header: 'Due Date',
      render: (row: Invoice) => (
        <span className="text-sm text-text-secondary">{formatDate(row.due_date)}</span>
      ),
    },
    {
      key: 'issue_date',
      header: 'Issue Date',
      render: (row: Invoice) => (
        <span className="text-sm text-text-secondary">
          {row.issue_date ? formatDate(row.issue_date) : '--'}
        </span>
      ),
    },
  ];

  const toolbar = (
    <div className="space-y-3">
      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-primary-100 text-primary-700'
                : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>

        <Input
          type="date"
          placeholder="From"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-[150px]"
        />

        <Input
          type="date"
          placeholder="To"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-[150px]"
        />
      </div>
    </div>
  );

  const hasActiveFilters = search || statusFilter !== 'all' || householdFilter || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="View and manage invoices for all households"
      />

      {!isLoading && invoices.length === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={FileText}
          title="No invoices yet"
          description="No invoices this term -- create fee assignments first, then run the fee generation wizard."
        />
      ) : (
        <DataTable
          columns={columns}
          data={invoices}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/finance/invoices/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
