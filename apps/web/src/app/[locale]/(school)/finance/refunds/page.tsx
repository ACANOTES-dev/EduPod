'use client';

import { RotateCcw, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { RefundStatus } from '@school/shared';
import {
  Button,
  EmptyState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';


import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { RefundStatusBadge } from '../_components/refund-status-badge';


// ─── Types ────────────────────────────────────────────────────────────────────

interface Refund {
  id: string;
  refund_reference: string;
  payment_reference?: string;
  household_name?: string;
  amount: number;
  currency_code?: string;
  status: RefundStatus;
  requested_by_name?: string;
  reason: string;
  created_at: string;
  payment?: {
    id: string;
    payment_reference: string;
    household?: { id: string; household_name: string };
  };
  requested_by?: { id: string; first_name: string; last_name: string } | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RefundsPage() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');

  const [refunds, setRefunds] = React.useState<Refund[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  const fetchRefunds = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await apiClient<{ data: Refund[]; meta: { total: number } }>(
        `/api/v1/finance/refunds?${params.toString()}`,
      );
      setRefunds(res.data);
      setTotal(res.meta.total);
    } catch {
      setRefunds([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter]);

  React.useEffect(() => {
    void fetchRefunds();
  }, [fetchRefunds]);

  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function handleApprove(refundId: string) {
    setActionLoading(refundId);
    try {
      await apiClient(`/api/v1/finance/refunds/${refundId}/approve`, { method: 'POST' });
      void fetchRefunds();
    } catch (err) {
      // error handled by apiClient
      console.error('[fetchRefunds]', err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(refundId: string) {
    setActionLoading(refundId);
    try {
      await apiClient(`/api/v1/finance/refunds/${refundId}/reject`, { method: 'POST' });
      void fetchRefunds();
    } catch (err) {
      // error handled by apiClient
      console.error('[fetchRefunds]', err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleExecute(refundId: string) {
    setActionLoading(refundId);
    try {
      await apiClient(`/api/v1/finance/refunds/${refundId}/execute`, { method: 'POST' });
      void fetchRefunds();
    } catch (err) {
      // error handled by apiClient
      console.error('[fetchRefunds]', err);
    } finally {
      setActionLoading(null);
    }
  }

  // ─── Columns ──────────────────────────────────────────────────────────────

  const columns = [
    {
      key: 'refund_reference',
      header: t('refundReference'),
      render: (row: Refund) => (
        <span className="font-mono text-xs text-text-secondary">{row.refund_reference}</span>
      ),
    },
    {
      key: 'payment_reference',
      header: t('paymentReference'),
      render: (row: Refund) => (
        <span className="font-mono text-xs text-text-secondary">
          {row.payment_reference ?? row.payment?.payment_reference ?? '—'}
        </span>
      ),
    },
    {
      key: 'household_name',
      header: t('household'),
      render: (row: Refund) => (
        <span className="font-medium text-text-primary">
          {row.household_name ?? row.payment?.household?.household_name ?? '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('totalAmount'),
      render: (row: Refund) => (
        <span className="font-mono text-sm text-text-primary">
          {row.currency_code}{' '}
          {Number(row.amount).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: Refund) => <RefundStatusBadge status={row.status} />,
    },
    {
      key: 'requested_by_name',
      header: t('requestedBy'),
      render: (row: Refund) => (
        <span className="text-sm text-text-secondary">
          {row.requested_by_name ??
            (row.requested_by
              ? `${row.requested_by.first_name} ${row.requested_by.last_name}`
              : '—')}
        </span>
      ),
    },
    {
      key: 'reason',
      header: t('reason'),
      render: (row: Refund) => (
        <span className="text-sm text-text-secondary max-w-[200px] truncate block">
          {row.reason}
        </span>
      ),
    },
    {
      key: 'actions',
      header: tCommon('actions'),
      render: (row: Refund) => {
        const loading = actionLoading === row.id;
        if (row.status === 'pending_approval') {
          return (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleApprove(row.id);
                }}
                disabled={loading}
              >
                {t('approve')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-danger-text border-danger-border hover:bg-danger-50"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleReject(row.id);
                }}
                disabled={loading}
              >
                {t('reject')}
              </Button>
            </div>
          );
        }
        if (row.status === 'approved') {
          return (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void handleExecute(row.id);
              }}
              disabled={loading}
            >
              {t('execute')}
            </Button>
          );
        }
        return <span className="text-xs text-text-tertiary">--</span>;
      },
    },
  ];

  // ─── Toolbar ──────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={`${tCommon('search')}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder={t('status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allStatuses')}</SelectItem>
          <SelectItem value="pending_approval">{t('pendingApproval')}</SelectItem>
          <SelectItem value="approved">{t('approved')}</SelectItem>
          <SelectItem value="executed">{t('executed')}</SelectItem>
          <SelectItem value="failed">{t('failed')}</SelectItem>
          <SelectItem value="rejected">{t('rejected')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title={t('refunds')} description={t('refundsDescription')} />

      {!isLoading && refunds.length === 0 && !search && statusFilter === 'all' ? (
        <EmptyState icon={RotateCcw} title={t('noRefunds')} description={t('noRefundsDesc')} />
      ) : (
        <DataTable
          columns={columns}
          data={refunds}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
