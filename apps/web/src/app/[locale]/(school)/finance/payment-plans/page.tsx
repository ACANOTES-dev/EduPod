'use client';

import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
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
import { HouseholdSelector } from '../_components/household-selector';
import { useTenantCurrency } from '../_components/use-tenant-currency';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Installment {
  due_date: string;
  amount: number;
  status?: string;
}

interface PaymentPlan {
  id: string;
  household_id: string;
  household: { id: string; household_name: string };
  original_balance: number;
  discount_amount: number;
  discount_reason: string | null;
  proposed_installments_json: Installment[];
  status: 'active' | 'completed' | 'cancelled';
  admin_notes: string | null;
  created_at: string;
  currency_code?: string;
}

interface HouseholdOverview {
  household_id: string;
  household_name: string;
  balance: number;
  total: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateInstallments(planTotal: number, count: number, startDate: Date): Installment[] {
  if (count <= 0 || planTotal <= 0) return [];
  const baseAmount = Math.floor((planTotal / count) * 100) / 100;
  const remainder = Math.round((planTotal - baseAmount * count) * 100) / 100;

  return Array.from({ length: count }, (_, i) => {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + i);
    const dateStr = date.toISOString().split('T')[0] ?? '';
    return {
      due_date: dateStr,
      amount: i === 0 ? baseAmount + remainder : baseAmount,
    };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentPlansPage() {
  const t = useTranslations('finance');
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole('school_principal', 'accounting');

  // ─── List state ─────────────────────────────────────────────────────────────
  const [plans, setPlans] = React.useState<PaymentPlan[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [expandedRow, setExpandedRow] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<string>('active');
  const currencyCode = useTenantCurrency();

  // ─── Create modal state ─────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [selectedHouseholdId, setSelectedHouseholdId] = React.useState('');
  const [outstandingBalance, setOutstandingBalance] = React.useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = React.useState(false);
  const [discountAmount, setDiscountAmount] = React.useState('0');
  const [discountReason, setDiscountReason] = React.useState('');
  const [numInstallments, setNumInstallments] = React.useState('3');
  const [installments, setInstallments] = React.useState<Installment[]>([]);
  const [adminNotes, setAdminNotes] = React.useState('');
  const [originalBalance, setOriginalBalance] = React.useState('');

  // ─── Cancel state ───────────────────────────────────────────────────────────
  const [cancelling, setCancelling] = React.useState<string | null>(null);

  // ─── Derived values ─────────────────────────────────────────────────────────
  const parsedOriginalBalance = parseFloat(originalBalance) || 0;
  const parsedDiscount = parseFloat(discountAmount) || 0;
  const planTotal = Math.max(0, parsedOriginalBalance - parsedDiscount);
  const installmentSum = installments.reduce((sum, inst) => sum + inst.amount, 0);
  const totalMismatch = installments.length > 0 && Math.abs(installmentSum - planTotal) > 0.01;

  // ─── Fetch plans ────────────────────────────────────────────────────────────
  const fetchPlans = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }
      const res = await apiClient<{ data: PaymentPlan[]; meta: { total: number } }>(
        `/api/v1/finance/payment-plans?${params.toString()}`,
      );
      setPlans(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[PaymentPlansPage]', err);
      setPlans([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  React.useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

  React.useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  // ─── Fetch outstanding balance for selected household ───────────────────────
  React.useEffect(() => {
    if (!selectedHouseholdId) {
      setOutstandingBalance(null);
      return;
    }
    setLoadingBalance(true);
    apiClient<{ data: HouseholdOverview[]; meta: { total: number } }>(
      `/api/v1/finance/dashboard/household-overview?search=&pageSize=100`,
    )
      .then((res) => {
        const match = res.data.find((h) => h.household_id === selectedHouseholdId);
        const balance = match?.balance ?? 0;
        setOutstandingBalance(balance);
        setOriginalBalance(balance > 0 ? balance.toFixed(2) : '');
      })
      .catch((err) => {
        console.error('[PaymentPlansPage]', err);
        setOutstandingBalance(null);
      })
      .finally(() => setLoadingBalance(false));
  }, [selectedHouseholdId]);

  // ─── Create plan handlers ───────────────────────────────────────────────────

  function resetCreateForm() {
    setSelectedHouseholdId('');
    setOutstandingBalance(null);
    setOriginalBalance('');
    setDiscountAmount('0');
    setDiscountReason('');
    setNumInstallments('3');
    setInstallments([]);
    setAdminNotes('');
  }

  function handleAutoGenerate() {
    const count = parseInt(numInstallments, 10);
    if (isNaN(count) || count <= 0 || planTotal <= 0) return;
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);
    setInstallments(generateInstallments(planTotal, count, nextMonth));
  }

  function updateInstallment(idx: number, field: keyof Installment, value: string) {
    setInstallments((prev) =>
      prev.map((inst, i) =>
        i === idx
          ? { ...inst, [field]: field === 'amount' ? parseFloat(value) || 0 : value }
          : inst,
      ),
    );
  }

  function removeInstallment(idx: number) {
    setInstallments((prev) => prev.filter((_, i) => i !== idx));
  }

  function addInstallment() {
    const lastInst = installments.length > 0 ? installments[installments.length - 1] : undefined;
    const lastDate = lastInst?.due_date ?? '';
    let nextDate = '';
    if (lastDate) {
      const d = new Date(lastDate);
      d.setMonth(d.getMonth() + 1);
      nextDate = d.toISOString().split('T')[0] ?? '';
    }
    setInstallments((prev) => [...prev, { due_date: nextDate, amount: 0 }]);
  }

  async function handleCreate() {
    if (!selectedHouseholdId || parsedOriginalBalance <= 0 || installments.length === 0) {
      toast.error(t('paymentPlans.validationError'));
      return;
    }
    if (totalMismatch) {
      toast.error(t('paymentPlans.totalMustMatch'));
      return;
    }
    const hasInvalidInstallment = installments.some((inst) => !inst.due_date || inst.amount <= 0);
    if (hasInvalidInstallment) {
      toast.error(t('paymentPlans.validationError'));
      return;
    }

    setCreating(true);
    try {
      await apiClient('/api/v1/finance/payment-plans/admin-create', {
        method: 'POST',
        body: JSON.stringify({
          household_id: selectedHouseholdId,
          original_balance: parsedOriginalBalance,
          discount_amount: parsedDiscount,
          discount_reason: discountReason.trim() || undefined,
          installments: installments.map((inst) => ({
            due_date: inst.due_date,
            amount: inst.amount,
          })),
          admin_notes: adminNotes.trim() || undefined,
        }),
      });
      toast.success(t('paymentPlans.created'));
      setShowCreate(false);
      resetCreateForm();
      void fetchPlans();
    } catch (err) {
      console.error('[PaymentPlansPage]', err);
      toast.error(t('paymentPlans.createFailed'));
    } finally {
      setCreating(false);
    }
  }

  // ─── Cancel plan handler ────────────────────────────────────────────────────
  async function handleCancel(planId: string) {
    setCancelling(planId);
    try {
      await apiClient(`/api/v1/finance/payment-plans/${planId}/cancel`, {
        method: 'POST',
      });
      toast.success(t('paymentPlans.cancelled'));
      void fetchPlans();
    } catch (err) {
      console.error('[PaymentPlansPage]', err);
      toast.error(t('paymentPlans.cancelFailed'));
    } finally {
      setCancelling(null);
    }
  }

  // ─── Table columns ──────────────────────────────────────────────────────────

  const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
    active: 'success',
    completed: 'info',
    cancelled: 'danger',
  };

  const columns = [
    {
      key: 'household_name',
      header: t('household'),
      render: (row: PaymentPlan) => (
        <span className="text-sm font-medium text-text-primary">
          {row.household?.household_name ?? '-'}
        </span>
      ),
    },
    {
      key: 'original_balance',
      header: t('paymentPlans.originalBalance'),
      className: 'text-end',
      render: (row: PaymentPlan) => (
        <CurrencyDisplay
          amount={row.original_balance ?? 0}
          currency_code={currencyCode}
          className="text-sm"
        />
      ),
    },
    {
      key: 'discount',
      header: t('paymentPlans.discountApplied'),
      className: 'text-end',
      render: (row: PaymentPlan) =>
        row.discount_amount > 0 ? (
          <CurrencyDisplay
            amount={row.discount_amount}
            currency_code={currencyCode}
            className="text-sm text-success-700"
          />
        ) : (
          <span className="text-sm text-text-tertiary">-</span>
        ),
    },
    {
      key: 'plan_total',
      header: t('paymentPlans.planTotal'),
      className: 'text-end',
      render: (row: PaymentPlan) => {
        const total = (row.original_balance ?? 0) - (row.discount_amount ?? 0);
        return (
          <CurrencyDisplay
            amount={total}
            currency_code={currencyCode}
            className="text-sm font-semibold"
          />
        );
      },
    },
    {
      key: 'installments_count',
      header: t('paymentPlans.numInstallments'),
      render: (row: PaymentPlan) => {
        const insts = Array.isArray(row.proposed_installments_json)
          ? row.proposed_installments_json
          : [];
        return <span className="text-sm text-text-secondary">{insts.length}</span>;
      },
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: PaymentPlan) => (
        <StatusBadge status={statusVariant[row.status] ?? 'neutral'} dot>
          {t(`paymentPlans.status_${row.status}`)}
        </StatusBadge>
      ),
    },
    {
      key: 'created_at',
      header: t('date'),
      render: (row: PaymentPlan) => (
        <span className="text-sm text-text-secondary">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: PaymentPlan) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
            className="text-text-tertiary hover:text-text-secondary"
          >
            {expandedRow === row.id ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {canManage && row.status === 'active' && (
            <Button
              size="sm"
              variant="outline"
              className="text-danger-700 hover:bg-danger-50"
              onClick={() => void handleCancel(row.id)}
              disabled={cancelling === row.id}
            >
              <XCircle className="me-1 h-3 w-3" />
              {t('cancel')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  // ─── Status tabs ────────────────────────────────────────────────────────────

  const statusTabs = [
    { key: 'active', label: t('paymentPlans.status_active') },
    { key: 'completed', label: t('paymentPlans.status_completed') },
    { key: 'cancelled', label: t('paymentPlans.status_cancelled') },
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

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('paymentPlans.title')}
        description={t('paymentPlans.description')}
        actions={
          canManage ? (
            <Button
              onClick={() => {
                resetCreateForm();
                setShowCreate(true);
              }}
            >
              <Plus className="me-2 h-4 w-4" />
              {t('paymentPlans.createPlan')}
            </Button>
          ) : undefined
        }
      />

      {!isLoading && plans.length === 0 && statusFilter === 'active' ? (
        <EmptyState
          icon={CalendarClock}
          title={t('paymentPlans.emptyTitle')}
          description={t('paymentPlans.emptyDescription')}
          action={
            canManage
              ? {
                  label: t('paymentPlans.createPlan'),
                  onClick: () => {
                    resetCreateForm();
                    setShowCreate(true);
                  },
                }
              : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          <DataTable
            columns={columns}
            data={plans}
            toolbar={toolbar}
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
          />

          {/* Expanded installment details */}
          {plans
            .filter((p) => p.id === expandedRow)
            .map((plan) => {
              const insts: Installment[] = Array.isArray(plan.proposed_installments_json)
                ? plan.proposed_installments_json
                : [];
              return (
                <div
                  key={`exp-${plan.id}`}
                  className="rounded-xl border border-border bg-surface-secondary p-4 space-y-3"
                >
                  <h4 className="text-xs font-semibold uppercase text-text-tertiary">
                    {t('paymentPlans.installmentSchedule')}
                  </h4>
                  <div className="space-y-2">
                    {insts.map((inst, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-2"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-text-tertiary">#{idx + 1}</span>
                          <span className="text-sm text-text-secondary">
                            {formatDate(inst.due_date)}
                          </span>
                        </div>
                        <CurrencyDisplay
                          amount={inst.amount}
                          currency_code={currencyCode}
                          className="font-semibold"
                        />
                      </div>
                    ))}
                  </div>
                  {plan.discount_reason && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-text-tertiary mb-1">
                        {t('paymentPlans.discountReason')}
                      </p>
                      <p className="text-sm text-text-secondary">{plan.discount_reason}</p>
                    </div>
                  )}
                  {plan.admin_notes && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-text-tertiary mb-1">
                        {t('paymentPlans.adminNotes')}
                      </p>
                      <p className="text-sm text-text-secondary">{plan.admin_notes}</p>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* ─── Create Payment Plan Dialog ────────────────────────────────────────── */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          if (!open) resetCreateForm();
          setShowCreate(open);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('paymentPlans.createTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            {/* Household selector */}
            <div className="space-y-1.5">
              <Label>{t('household')}</Label>
              <HouseholdSelector
                value={selectedHouseholdId}
                onValueChange={setSelectedHouseholdId}
              />
              {loadingBalance && (
                <p className="text-xs text-text-tertiary flex items-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  {t('paymentPlans.loadingBalance')}
                </p>
              )}
              {outstandingBalance !== null && !loadingBalance && (
                <p className="text-xs text-text-secondary">
                  {t('paymentPlans.currentOutstanding')}:{' '}
                  <CurrencyDisplay
                    amount={outstandingBalance}
                    currency_code={currencyCode}
                    className="font-semibold"
                  />
                </p>
              )}
            </div>

            {/* Original balance */}
            <div className="space-y-1.5">
              <Label>{t('paymentPlans.originalBalance')}</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={originalBalance}
                onChange={(e) => setOriginalBalance(e.target.value)}
                placeholder="0.00"
                dir="ltr"
                className="text-base"
              />
            </div>

            {/* Discount */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('paymentPlans.discountAmount')}</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  placeholder="0.00"
                  dir="ltr"
                  className="text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('paymentPlans.discountReason')}</Label>
                <Input
                  value={discountReason}
                  onChange={(e) => setDiscountReason(e.target.value)}
                  placeholder={t('paymentPlans.discountReasonPlaceholder')}
                />
              </div>
            </div>

            {/* Plan total display */}
            <div className="rounded-lg border border-border bg-surface-secondary px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">
                  {t('paymentPlans.planTotal')}
                </span>
                <CurrencyDisplay
                  amount={planTotal}
                  currency_code={currencyCode}
                  className="text-lg font-bold"
                />
              </div>
              {parsedDiscount > 0 && (
                <p className="mt-1 text-xs text-text-tertiary">
                  {t('paymentPlans.originalBalance')}: {parsedOriginalBalance.toFixed(2)}{' '}
                  <Minus className="inline h-3 w-3" /> {t('paymentPlans.discountAmount')}:{' '}
                  {parsedDiscount.toFixed(2)}
                </p>
              )}
            </div>

            {/* Installment builder */}
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1.5">
                  <Label>{t('paymentPlans.numInstallments')}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="60"
                      value={numInstallments}
                      onChange={(e) => setNumInstallments(e.target.value)}
                      className="w-full sm:w-24 text-base"
                      dir="ltr"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleAutoGenerate}
                      disabled={planTotal <= 0}
                    >
                      <RefreshCw className="me-1 h-3 w-3" />
                      {t('paymentPlans.autoGenerate')}
                    </Button>
                  </div>
                </div>
                <Button type="button" size="sm" variant="outline" onClick={addInstallment}>
                  <Plus className="me-1 h-3 w-3" />
                  {t('paymentPlans.addInstallment')}
                </Button>
              </div>

              {installments.length > 0 && (
                <div className="space-y-2">
                  {/* Header row */}
                  <div className="hidden sm:grid sm:grid-cols-[auto_1fr_auto_auto] gap-2 px-1 text-xs font-semibold uppercase text-text-tertiary">
                    <span className="w-8">#</span>
                    <span>{t('paymentPlans.installmentDate')}</span>
                    <span className="w-32 text-end">{t('paymentPlans.installmentAmount')}</span>
                    <span className="w-8" />
                  </div>

                  {installments.map((inst, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_auto_auto] items-center rounded-lg border border-border bg-surface px-3 py-2"
                    >
                      <span className="hidden sm:block text-xs font-mono text-text-tertiary w-8">
                        {idx + 1}
                      </span>
                      <Input
                        type="date"
                        value={inst.due_date}
                        onChange={(e) => updateInstallment(idx, 'due_date', e.target.value)}
                        className="w-full text-base"
                      />
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={inst.amount || ''}
                        onChange={(e) => updateInstallment(idx, 'amount', e.target.value)}
                        className="w-full sm:w-32 text-base"
                        dir="ltr"
                        placeholder="0.00"
                      />
                      <button
                        type="button"
                        onClick={() => removeInstallment(idx)}
                        className="text-danger-600 hover:text-danger-800 justify-self-end"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  {/* Installment total row */}
                  <div className="flex items-center justify-between rounded-lg border px-4 py-2 bg-surface-secondary">
                    <span className="text-sm font-medium text-text-secondary">
                      {t('paymentPlans.installmentTotal')}
                    </span>
                    <span
                      className={`text-sm font-semibold ${
                        totalMismatch ? 'text-danger-700' : 'text-success-700'
                      }`}
                      dir="ltr"
                    >
                      {installmentSum.toFixed(2)}
                    </span>
                  </div>
                  {totalMismatch && (
                    <p className="text-xs text-danger-600">
                      {t('paymentPlans.totalMustMatch')} ({t('paymentPlans.planTotal')}:{' '}
                      {planTotal.toFixed(2)})
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Admin notes */}
            <div className="space-y-1.5">
              <Label>{t('paymentPlans.adminNotes')}</Label>
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder={t('paymentPlans.notesPlaceholder')}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
              {t('cancel')}
            </Button>
            <Button
              onClick={() => void handleCreate()}
              disabled={
                creating ||
                !selectedHouseholdId ||
                parsedOriginalBalance <= 0 ||
                installments.length === 0 ||
                totalMismatch
              }
            >
              {creating ? t('saving') : t('paymentPlans.createPlan')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
