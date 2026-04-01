'use client';

import { CalendarClock, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

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
  StatusBadge,
  Textarea,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CurrencyDisplay } from '../_components/currency-display';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProposedInstallment {
  due_date: string;
  amount: number;
}

interface PaymentPlanRequest {
  id: string;
  invoice_id: string;
  invoice_number: string;
  household_id: string;
  household_name: string;
  student_name: string | null;
  requested_by_parent_name: string;
  proposed_installments: ProposedInstallment[];
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'counter_offered';
  admin_notes: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  currency_code: string;
  created_at: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentPlansPage() {
  const t = useTranslations('finance');
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole('school_principal', 'accounting');

  const [requests, setRequests] = React.useState<PaymentPlanRequest[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [expandedRow, setExpandedRow] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState('pending');

  // Reject modal
  const [showReject, setShowReject] = React.useState(false);
  const [rejectTarget, setRejectTarget] = React.useState<PaymentPlanRequest | null>(null);
  const [rejectNote, setRejectNote] = React.useState('');
  const [rejecting, setRejecting] = React.useState(false);

  // Counter-offer modal
  const [showCounter, setShowCounter] = React.useState(false);
  const [counterTarget, setCounterTarget] = React.useState<PaymentPlanRequest | null>(null);
  const [counterNote, setCounterNote] = React.useState('');
  const [counterInstallments, setCounterInstallments] = React.useState<ProposedInstallment[]>([]);
  const [countering, setCountering] = React.useState(false);
  const [approving, setApproving] = React.useState<string | null>(null);

  const fetchRequests = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        status: statusFilter,
      });
      const res = await apiClient<{ data: PaymentPlanRequest[]; meta: { total: number } }>(
        `/api/v1/finance/payment-plan-requests?${params.toString()}`,
      );
      setRequests(res.data);
      setTotal(res.meta.total);
    } catch {
      setRequests([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  React.useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  React.useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  async function handleApprove(req: PaymentPlanRequest) {
    setApproving(req.id);
    try {
      await apiClient(`/api/v1/finance/payment-plan-requests/${req.id}/approve`, {
        method: 'POST',
      });
      toast.success(t('paymentPlans.approved'));
      void fetchRequests();
    } catch {
      toast.error(t('paymentPlans.approveFailed'));
    } finally {
      setApproving(null);
    }
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await apiClient(`/api/v1/finance/payment-plan-requests/${rejectTarget.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ admin_notes: rejectNote }),
      });
      toast.success(t('paymentPlans.rejected'));
      setShowReject(false);
      setRejectTarget(null);
      setRejectNote('');
      void fetchRequests();
    } catch {
      toast.error(t('paymentPlans.rejectFailed'));
    } finally {
      setRejecting(false);
    }
  }

  async function handleCounterOffer() {
    if (!counterTarget || counterInstallments.length === 0) return;
    setCountering(true);
    try {
      await apiClient(`/api/v1/finance/payment-plan-requests/${counterTarget.id}/counter-offer`, {
        method: 'POST',
        body: JSON.stringify({
          proposed_installments: counterInstallments,
          admin_notes: counterNote,
        }),
      });
      toast.success(t('paymentPlans.counterOffered'));
      setShowCounter(false);
      setCounterTarget(null);
      void fetchRequests();
    } catch {
      toast.error(t('paymentPlans.counterFailed'));
    } finally {
      setCountering(false);
    }
  }

  function openCounterModal(req: PaymentPlanRequest) {
    setCounterTarget(req);
    setCounterInstallments(req.proposed_installments.map((i) => ({ ...i })));
    setCounterNote('');
    setShowCounter(true);
  }

  function addCounterInstallment() {
    setCounterInstallments((prev) => [...prev, { due_date: '', amount: 0 }]);
  }

  function removeCounterInstallment(idx: number) {
    setCounterInstallments((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateCounterInstallment(idx: number, field: keyof ProposedInstallment, value: string) {
    setCounterInstallments((prev) =>
      prev.map((inst, i) =>
        i === idx
          ? { ...inst, [field]: field === 'amount' ? parseFloat(value) || 0 : value }
          : inst,
      ),
    );
  }

  const statusVariant: Record<
    PaymentPlanRequest['status'],
    'warning' | 'success' | 'danger' | 'info'
  > = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
    counter_offered: 'info',
  };

  const columns = [
    {
      key: 'invoice_number',
      header: t('invoices.title'),
      render: (row: PaymentPlanRequest) => (
        <span className="font-mono text-xs text-text-secondary">{row.invoice_number}</span>
      ),
    },
    {
      key: 'household_name',
      header: t('household'),
      render: (row: PaymentPlanRequest) => (
        <div>
          <p className="text-sm font-medium text-text-primary">{row.household_name}</p>
          {row.student_name && <p className="text-xs text-text-tertiary">{row.student_name}</p>}
        </div>
      ),
    },
    {
      key: 'requested_by',
      header: t('paymentPlans.requestedBy'),
      render: (row: PaymentPlanRequest) => (
        <span className="text-sm text-text-secondary">{row.requested_by_parent_name}</span>
      ),
    },
    {
      key: 'installments',
      header: t('paymentPlans.installments'),
      render: (row: PaymentPlanRequest) => (
        <span className="text-sm text-text-secondary">
          {row.proposed_installments.length} {t('paymentPlans.installmentsCount')}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: PaymentPlanRequest) => (
        <StatusBadge status={statusVariant[row.status]} dot>
          {t(`paymentPlans.status_${row.status}`)}
        </StatusBadge>
      ),
    },
    {
      key: 'created_at',
      header: t('date'),
      render: (row: PaymentPlanRequest) => (
        <span className="text-sm text-text-secondary">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: PaymentPlanRequest) =>
        canManage && row.status === 'pending' ? (
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              onClick={() => void handleApprove(row)}
              disabled={approving === row.id}
            >
              {t('approve')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => openCounterModal(row)}>
              {t('paymentPlans.counterOffer')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-danger-700 hover:bg-danger-50"
              onClick={() => {
                setRejectTarget(row);
                setRejectNote('');
                setShowReject(true);
              }}
            >
              {t('reject')}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedRow(expandedRow === row.id ? null : row.id);
            }}
            className="text-text-tertiary hover:text-text-secondary"
          >
            {expandedRow === row.id ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ),
    },
  ];

  const statusTabs = [
    { key: 'pending', label: t('paymentPlans.status_pending') },
    { key: 'approved', label: t('paymentPlans.status_approved') },
    { key: 'rejected', label: t('paymentPlans.status_rejected') },
    { key: 'counter_offered', label: t('paymentPlans.status_counter_offered') },
    { key: 'all', label: t('allStatuses') },
  ];

  const toolbar = (
    <div className="flex flex-wrap gap-1 border-b border-border pb-2">
      {statusTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => setStatusFilter(tab.key)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            statusFilter === tab.key
              ? 'bg-primary-100 text-primary-700'
              : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('paymentPlans.title')} description={t('paymentPlans.description')} />

      {!isLoading && requests.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={t('paymentPlans.emptyTitle')}
          description={t('paymentPlans.emptyDescription')}
        />
      ) : (
        <div className="space-y-2">
          <DataTable
            columns={columns}
            data={requests}
            toolbar={toolbar}
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
          />

          {/* Expanded installments view */}
          {requests
            .filter((r) => r.id === expandedRow)
            .map((req) => (
              <div
                key={`exp-${req.id}`}
                className="rounded-xl border border-border bg-surface-secondary p-4 space-y-3"
              >
                <h4 className="text-xs font-semibold uppercase text-text-tertiary">
                  {t('paymentPlans.proposedInstallments')}
                </h4>
                <div className="space-y-2">
                  {req.proposed_installments.map((inst, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2"
                    >
                      <span className="text-sm text-text-secondary">
                        {formatDate(inst.due_date)}
                      </span>
                      <CurrencyDisplay
                        amount={inst.amount}
                        currency_code={req.currency_code}
                        className="font-semibold"
                      />
                    </div>
                  ))}
                </div>
                {req.reason && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-text-tertiary mb-1">
                      {t('paymentPlans.parentReason')}
                    </p>
                    <p className="text-sm text-text-secondary">{req.reason}</p>
                  </div>
                )}
                {req.admin_notes && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-text-tertiary mb-1">
                      {t('paymentPlans.adminNotes')}
                    </p>
                    <p className="text-sm text-text-secondary">{req.admin_notes}</p>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Reject modal */}
      <Dialog open={showReject} onOpenChange={setShowReject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('paymentPlans.rejectTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">{t('paymentPlans.rejectDescription')}</p>
            <div className="space-y-1.5">
              <Label>{t('paymentPlans.adminNotes')}</Label>
              <Textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder={t('paymentPlans.notesPlaceholder')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReject(false)} disabled={rejecting}>
              {t('cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void handleReject()} disabled={rejecting}>
              {rejecting ? t('saving') : t('reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Counter-offer modal */}
      <Dialog open={showCounter} onOpenChange={setShowCounter}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('paymentPlans.counterOfferTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              {t('paymentPlans.counterOfferDescription')}
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t('paymentPlans.proposedInstallments')}</Label>
                <Button size="sm" variant="outline" onClick={addCounterInstallment} type="button">
                  <Plus className="me-1 h-3 w-3" />
                  {t('paymentPlans.addInstallment')}
                </Button>
              </div>

              {counterInstallments.map((inst, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={inst.due_date}
                    onChange={(e) => updateCounterInstallment(idx, 'due_date', e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={inst.amount || ''}
                    onChange={(e) => updateCounterInstallment(idx, 'amount', e.target.value)}
                    className="w-32"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => removeCounterInstallment(idx)}
                    className="text-danger-600 hover:text-danger-800"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>{t('paymentPlans.adminNotes')}</Label>
              <Textarea
                value={counterNote}
                onChange={(e) => setCounterNote(e.target.value)}
                placeholder={t('paymentPlans.notesPlaceholder')}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCounter(false)} disabled={countering}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => void handleCounterOffer()}
              disabled={countering || counterInstallments.length === 0}
            >
              {countering ? t('saving') : t('paymentPlans.sendCounterOffer')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
