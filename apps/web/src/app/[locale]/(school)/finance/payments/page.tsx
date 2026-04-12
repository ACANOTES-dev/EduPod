'use client';

import { Banknote, Plus, Search } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { PaymentMethod, PaymentStatus } from '@school/shared';
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

import { DataTable } from '@/components/data-table';
import { EntityLink } from '@/components/entity-link';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CurrencyDisplay } from '../_components/currency-display';
import { useTenantCurrency } from '../_components/use-tenant-currency';

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
  posted_by?: { id: string; first_name: string; last_name: string } | null;
}

interface StaffOption {
  id: string;
  name: string;
}

const methodLabelMap: Record<PaymentMethod, string> = {
  stripe: 'Stripe',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  card_manual: 'Card (Manual)',
};

export default function PaymentsPage() {
  const t = useTranslations('finance');
  const router = useRouter();
  const pathname = usePathname();
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole('school_principal', 'accounting');
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const currencyCode = useTenantCurrency();

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
  const [staffFilter, setStaffFilter] = React.useState('all');
  const [staffOptions, setStaffOptions] = React.useState<StaffOption[]>([]);

  // Fetch staff who have accepted payments
  React.useEffect(() => {
    apiClient<{ data: StaffOption[] }>('/api/v1/finance/payments/staff')
      .then((res) => setStaffOptions(res.data))
      .catch((err) => {
        console.error('[FinancePaymentsPage]', err);
        return setStaffOptions([]);
      });
  }, []);

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
      if (staffFilter !== 'all') params.set('accepted_by_user_id', staffFilter);

      const res = await apiClient<{ data: Payment[]; meta: { total: number } }>(
        `/api/v1/finance/payments?${params.toString()}`,
      );
      setPayments(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[FinancePaymentsPage]', err);
      setPayments([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, methodFilter, dateFrom, dateTo, staffFilter]);

  React.useEffect(() => {
    void fetchPayments();
  }, [fetchPayments]);

  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter, methodFilter, dateFrom, dateTo, staffFilter]);

  const columns = [
    {
      key: 'payment_reference',
      header: t('reference'),
      render: (row: Payment) => (
        <span className="font-mono text-xs text-text-secondary">{row.payment_reference}</span>
      ),
    },
    {
      key: 'household',
      header: t('household'),
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
      header: t('totalAmount'),
      className: 'text-end',
      render: (row: Payment) => (
        <CurrencyDisplay amount={row.amount} currency_code={currencyCode} className="font-medium" />
      ),
    },
    {
      key: 'payment_method',
      header: 'Method',
      render: (row: Payment) => (
        <span className="text-sm text-text-secondary">{methodLabelMap[row.payment_method]}</span>
      ),
    },
    {
      key: 'received_at',
      header: t('date'),
      render: (row: Payment) => (
        <span className="text-sm text-text-secondary">{formatDate(row.received_at)}</span>
      ),
    },
    {
      key: 'accepted_by',
      header: t('acceptedBy'),
      render: (row: Payment) => {
        if (row.payment_method === 'stripe') {
          return <span className="text-sm text-text-secondary">Stripe</span>;
        }
        if (row.payment_method === 'bank_transfer' && !row.posted_by) {
          return <span className="text-sm text-text-secondary">{t('bankTransfer')}</span>;
        }
        return (
          <span className="text-sm text-text-secondary">
            {row.posted_by ? `${row.posted_by.first_name} ${row.posted_by.last_name}` : '—'}
          </span>
        );
      },
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={`${t('searchByReference')}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-full sm:w-[150px]">
          <SelectValue placeholder={t('status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allStatuses')}</SelectItem>
          <SelectItem value="pending">{t('pending')}</SelectItem>
          <SelectItem value="posted">{t('posted')}</SelectItem>
          <SelectItem value="failed">{t('failed')}</SelectItem>
          <SelectItem value="voided">{t('voided')}</SelectItem>
          <SelectItem value="refunded_partial">{t('partiallyRefunded')}</SelectItem>
          <SelectItem value="refunded_full">{t('fullyRefunded')}</SelectItem>
        </SelectContent>
      </Select>

      <Select value={methodFilter} onValueChange={setMethodFilter}>
        <SelectTrigger className="w-full sm:w-[150px]">
          <SelectValue placeholder={t('method')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allMethods')}</SelectItem>
          <SelectItem value="cash">{t('cash')}</SelectItem>
          <SelectItem value="bank_transfer">{t('bankTransfer')}</SelectItem>
          <SelectItem value="card_manual">{t('cardManual')}</SelectItem>
          <SelectItem value="stripe">{t('stripe')}</SelectItem>
        </SelectContent>
      </Select>

      <Select value={staffFilter} onValueChange={setStaffFilter}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder={t('selectStaff')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allStaff')}</SelectItem>
          {staffOptions.map((staff) => (
            <SelectItem key={staff.id} value={staff.id}>
              {staff.name}
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

  const hasActiveFilters =
    search ||
    statusFilter !== 'all' ||
    methodFilter !== 'all' ||
    dateFrom ||
    dateTo ||
    staffFilter !== 'all';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('navPayments')}
        description="View and manage incoming payments"
        actions={
          canManage ? (
            <Button onClick={() => router.push('/finance/payments/new')}>
              <Plus className="me-2 h-4 w-4" />
              {t('newPayment')}
            </Button>
          ) : undefined
        }
      />

      {!isLoading && payments.length === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={Banknote}
          title={t('noPaymentsYet')}
          description="Record your first payment to get started."
          action={
            canManage
              ? { label: 'Record Payment', onClick: () => router.push('/finance/payments/new') }
              : undefined
          }
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
