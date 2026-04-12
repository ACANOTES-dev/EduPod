'use client';

import { Plus, RotateCcw, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { RefundStatus } from '@school/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';

import { CurrencyDisplay } from '../_components/currency-display';
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

interface PaymentSearchResult {
  id: string;
  payment_reference: string;
  amount: number;
  payment_method: string;
  currency_code: string;
  household?: { id: string; household_name: string } | null;
  refunded_amount?: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RefundsPage() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole('school_principal', 'accounting');

  const [refunds, setRefunds] = React.useState<Refund[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  // Create refund modal
  const [showCreate, setShowCreate] = React.useState(false);
  const [paymentSearch, setPaymentSearch] = React.useState('');
  const [paymentResults, setPaymentResults] = React.useState<PaymentSearchResult[]>([]);
  const [searchingPayments, setSearchingPayments] = React.useState(false);
  const [selectedPayment, setSelectedPayment] = React.useState<PaymentSearchResult | null>(null);
  const [refundAmount, setRefundAmount] = React.useState('');
  const [refundReason, setRefundReason] = React.useState('');
  const [creating, setCreating] = React.useState(false);

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
    } catch (err) {
      console.error('[FinanceRefundsPage]', err);
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

  // ─── Create Refund ────────────────────────────────────────────────────────

  const handleSearchPayments = React.useCallback(async () => {
    if (!paymentSearch.trim()) {
      setPaymentResults([]);
      return;
    }
    setSearchingPayments(true);
    try {
      const res = await apiClient<{ data: PaymentSearchResult[]; meta: { total: number } }>(
        `/api/v1/finance/payments?search=${encodeURIComponent(paymentSearch.trim())}&pageSize=10`,
      );
      setPaymentResults(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('[RefundsPage.searchPayments]', err);
      setPaymentResults([]);
    } finally {
      setSearchingPayments(false);
    }
  }, [paymentSearch]);

  function resetCreateModal() {
    setPaymentSearch('');
    setPaymentResults([]);
    setSelectedPayment(null);
    setRefundAmount('');
    setRefundReason('');
  }

  async function handleCreateRefund() {
    if (!selectedPayment) return;
    const parsedAmount = parseFloat(refundAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || !refundReason.trim()) {
      toast.error(t('refundValidationError'));
      return;
    }
    const refundableAmount = selectedPayment.amount - (selectedPayment.refunded_amount ?? 0);
    if (parsedAmount > refundableAmount) {
      toast.error(t('refundExceedsPayment'));
      return;
    }
    setCreating(true);
    try {
      await apiClient('/api/v1/finance/refunds', {
        method: 'POST',
        body: JSON.stringify({
          payment_id: selectedPayment.id,
          amount: parsedAmount,
          reason: refundReason.trim(),
        }),
      });
      toast.success(t('refundCreated'));
      setShowCreate(false);
      resetCreateModal();
      void fetchRefunds();
    } catch (err) {
      console.error('[RefundsPage.createRefund]', err);
      toast.error(t('refundCreateFailed'));
    } finally {
      setCreating(false);
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
      <PageHeader
        title={t('refunds')}
        description={t('refundsDescription')}
        actions={
          canManage ? (
            <Button
              onClick={() => {
                resetCreateModal();
                setShowCreate(true);
              }}
            >
              <Plus className="me-2 h-4 w-4" />
              {t('createRefund')}
            </Button>
          ) : undefined
        }
      />

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

      {/* Create Refund Dialog */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) resetCreateModal();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('createRefund')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!selectedPayment ? (
              <>
                <div className="space-y-1.5">
                  <Label>{t('searchPayment')}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder={t('searchPaymentPlaceholder')}
                      value={paymentSearch}
                      onChange={(e) => setPaymentSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSearchPayments();
                      }}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleSearchPayments()}
                      disabled={searchingPayments || !paymentSearch.trim()}
                    >
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {searchingPayments && (
                  <p className="text-sm text-text-tertiary">{tCommon('loading')}...</p>
                )}

                {!searchingPayments && paymentResults.length > 0 && (
                  <div className="max-h-[240px] space-y-2 overflow-y-auto">
                    {paymentResults.map((payment) => {
                      const refundableAmount = payment.amount - (payment.refunded_amount ?? 0);
                      return (
                        <button
                          key={payment.id}
                          type="button"
                          onClick={() => {
                            setSelectedPayment(payment);
                            setRefundAmount('');
                            setRefundReason('');
                          }}
                          className="w-full rounded-lg border border-border p-3 text-start transition-colors hover:bg-surface-secondary"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs text-text-secondary">
                              {payment.payment_reference}
                            </span>
                            <CurrencyDisplay
                              amount={payment.amount}
                              currency_code={payment.currency_code}
                              className="text-sm font-medium"
                            />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-xs text-text-tertiary">
                            <span>{payment.household?.household_name ?? '—'}</span>
                            <span>
                              {t('refundable')}:{' '}
                              <span dir="ltr">
                                {refundableAmount.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!searchingPayments && paymentSearch.trim() && paymentResults.length === 0 && (
                  <p className="text-sm text-text-tertiary">{t('noPaymentsFound')}</p>
                )}
              </>
            ) : (
              <>
                {/* Selected payment summary */}
                <div className="rounded-lg border border-border bg-surface-secondary p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text-primary">
                      {t('selectedPayment')}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedPayment(null)}>
                      {t('changePayment')}
                    </Button>
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">{t('reference')}</span>
                      <span className="font-mono text-text-secondary">
                        {selectedPayment.payment_reference}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">{t('household')}</span>
                      <span className="text-text-secondary">
                        {selectedPayment.household?.household_name ?? '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">{t('totalAmount')}</span>
                      <CurrencyDisplay
                        amount={selectedPayment.amount}
                        currency_code={selectedPayment.currency_code}
                        className="font-medium"
                      />
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">{t('method')}</span>
                      <span className="text-text-secondary capitalize">
                        {selectedPayment.payment_method.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-text-tertiary">{t('refundable')}</span>
                      <span className="font-medium text-success-700" dir="ltr">
                        {(
                          selectedPayment.amount - (selectedPayment.refunded_amount ?? 0)
                        ).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>{t('refundAmountLabel')}</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={selectedPayment.amount - (selectedPayment.refunded_amount ?? 0)}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    placeholder="0.00"
                    dir="ltr"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>{t('reason')}</Label>
                  <Textarea
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder={t('refundReasonPlaceholder')}
                    rows={3}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
              {tCommon('cancel')}
            </Button>
            {selectedPayment && (
              <Button
                onClick={() => void handleCreateRefund()}
                disabled={creating || !refundAmount || !refundReason.trim()}
              >
                {creating ? tCommon('saving') : t('createRefund')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
