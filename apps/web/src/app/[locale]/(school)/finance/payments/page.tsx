'use client';

import { Banknote, Plus, Search } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import * as React from 'react';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  EmptyState,
} from '@school/ui';
import type { PaymentStatus, PaymentMethod } from '@school/shared';
import { DataTable } from '@/components/data-table';
import { EntityLink } from '@/components/entity-link';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';
import { PaymentStatusBadge } from '../_components/payment-status-badge';
import { CurrencyDisplay } from '../_components/currency-display';

interface PaymentHousehold {
  id: string;
  household_name: string;
}

interface Payment {
  id: string;
  payment_reference: string;
  amount: number;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  received_at: string;
  allocated_amount: number;
  unallocated_amount: number;
  currency_code: string;
  household?: PaymentHousehold | null;
}

const methodLabelMap: Record<PaymentMethod, string> = {
  stripe: 'Stripe',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  card_manual: 'Card (Manual)',
};

export default function PaymentsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [methodFilter, setMethodFilter] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  const fetchPayments = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (methodFilter !== 'all') params.set('payment_method', methodFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const res = await apiClient<{ data: Payment[]; meta: { total: number } }>(
        `/api/v1/finance/payments?${params.toString()}`,
      );
      setPayments(res.data);
      setTotal(res.meta.total);
    } catch {
      setPayments([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, methodFilter, dateFrom, dateTo]);

  React.useEffect(() => {
    void fetchPayments();
  }, [fetchPayments]);

  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter, methodFilter, dateFrom, dateTo]);

  const columns = [
    {
      key: 'payment_reference',
      header: 'Reference',
      render: (row: Payment) => (
        <span className="font-mono text-xs text-text-secondary">{row.payment_reference}</span>
      ),
    },
    {
      key: 'household',
      header: 'Household',
      render: (row: Payment) =>
        row.household ? (
          <EntityLink
            entityType="household"
            entityId={row.household.id}
            label={row.household.household_name}
            href={`/${locale}/households/${row.household.id}`}
          />
        ) : (
          <span className="text-text-tertiary">--</span>
        ),
    },
    {
      key: 'amount',
      header: 'Amount',
      className: 'text-end',
      render: (row: Payment) => (
        <CurrencyDisplay
          amount={row.amount}
          currency_code={row.currency_code}
          className="font-medium"
        />
      ),
    },
    {
      key: 'payment_method',
      header: 'Method',
      render: (row: Payment) => (
        <span className="text-sm text-text-secondary">
          {methodLabelMap[row.payment_method]}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: Payment) => <PaymentStatusBadge status={row.status} />,
    },
    {
      key: 'received_at',
      header: 'Received',
      render: (row: Payment) => (
        <span className="text-sm text-text-secondary">{formatDate(row.received_at)}</span>
      ),
    },
    {
      key: 'allocation',
      header: 'Allocated / Unallocated',
      className: 'text-end',
      render: (row: Payment) => (
        <div className="flex flex-col items-end gap-0.5">
          <CurrencyDisplay
            amount={row.allocated_amount ?? 0}
            currency_code={row.currency_code}
            className="text-xs text-success-text"
          />
          {(row.unallocated_amount ?? 0) > 0 && (
            <CurrencyDisplay
              amount={row.unallocated_amount ?? 0}
              currency_code={row.currency_code}
              className="text-xs text-warning-text"
            />
          )}
        </div>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder="Search payments..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
          <SelectItem value="posted">Posted</SelectItem>
          <SelectItem value="failed">Failed</SelectItem>
          <SelectItem value="voided">Voided</SelectItem>
          <SelectItem value="refunded_partial">Partially Refunded</SelectItem>
          <SelectItem value="refunded_full">Fully Refunded</SelectItem>
        </SelectContent>
      </Select>

      <Select value={methodFilter} onValueChange={setMethodFilter}>
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Method" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Methods</SelectItem>
          <SelectItem value="cash">Cash</SelectItem>
          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
          <SelectItem value="card_manual">Card (Manual)</SelectItem>
          <SelectItem value="stripe">Stripe</SelectItem>
        </SelectContent>
      </Select>

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
  );

  const hasActiveFilters = search || statusFilter !== 'all' || methodFilter !== 'all' || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="View and manage incoming payments"
        actions={
          <Button onClick={() => router.push('/finance/payments/new')}>
            <Plus className="me-2 h-4 w-4" />
            Record Payment
          </Button>
        }
      />

      {!isLoading && payments.length === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={Banknote}
          title="No payments yet"
          description="Record your first payment to get started."
          action={{ label: 'Record Payment', onClick: () => router.push('/finance/payments/new') }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={payments}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/finance/payments/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
