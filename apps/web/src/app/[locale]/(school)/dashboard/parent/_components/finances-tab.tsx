'use client';

import { CreditCard, Download, FileText, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { InvoiceStatus } from '@school/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Label,
  StatusBadge,
  Textarea,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParentInvoice {
  id: string;
  invoice_number: string;
  description: string | null;
  total_amount: number;
  balance_amount: number;
  due_date: string;
  status: InvoiceStatus;
  currency_code: string;
  stripe_enabled: boolean;
}

interface ParentPayment {
  id: string;
  payment_reference: string;
  amount: number;
  currency_code: string;
  received_at: string;
  payment_method: string;
}

interface ParentFinancesData {
  outstanding_balance: number;
  currency_code: string;
  invoices: ParentInvoice[];
  payments: ParentPayment[];
  stripe_enabled: boolean;
}

interface ProposedInstallment {
  due_date: string;
  amount: number;
}

// ─── Status map ───────────────────────────────────────────────────────────────

const invoiceStatusVariant: Record<
  InvoiceStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  draft: 'neutral',
  pending_approval: 'warning',
  issued: 'info',
  partially_paid: 'warning',
  paid: 'success',
  overdue: 'danger',
  void: 'neutral',
  cancelled: 'neutral',
  written_off: 'info',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function FinancesTab() {
  const t = useTranslations('dashboard');
  const tf = useTranslations('finance');

  const [data, setData] = React.useState<ParentFinancesData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [payingId, setPayingId] = React.useState<string | null>(null);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  // Payment plan request modal
  const [showPlanModal, setShowPlanModal] = React.useState(false);
  const [planInvoice, setPlanInvoice] = React.useState<ParentInvoice | null>(null);
  const [planReason, setPlanReason] = React.useState('');
  const [planInstallments, setPlanInstallments] = React.useState<ProposedInstallment[]>([
    { due_date: '', amount: 0 },
    { due_date: '', amount: 0 },
  ]);
  const [submittingPlan, setSubmittingPlan] = React.useState(false);

  React.useEffect(() => {
    apiClient<{ data: ParentFinancesData }>('/api/v1/parent/finances')
      .then((res) => setData(res.data))
      .catch((err) => { console.error('[FinancesTab]', err); return setData(null); })
      .finally(() => setIsLoading(false));
  }, []);

  async function handlePayNow(invoice: ParentInvoice) {
    setPayingId(invoice.id);
    try {
      const res = await apiClient<{ checkout_url: string }>(
        `/api/v1/parent/finances/invoices/${invoice.id}/checkout`,
        { method: 'POST' },
      );
      window.location.href = res.checkout_url;
    } catch (err) {
      console.error('[FinancesTab]', err);
      toast.error(tf('paymentRecordFailed'));
      setPayingId(null);
    }
  }

  function handleDownloadReceipt(paymentId: string) {
    setDownloadingId(paymentId);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    window.open(`${baseUrl}/api/v1/parent/finances/payments/${paymentId}/receipt`, '_blank');
    setDownloadingId(null);
  }

  function openPlanModal(invoice: ParentInvoice) {
    setPlanInvoice(invoice);
    setPlanReason('');
    setPlanInstallments([
      { due_date: '', amount: 0 },
      { due_date: '', amount: 0 },
    ]);
    setShowPlanModal(true);
  }

  function updateInstallment(idx: number, field: keyof ProposedInstallment, value: string) {
    setPlanInstallments((prev) =>
      prev.map((inst, i) =>
        i === idx
          ? { ...inst, [field]: field === 'amount' ? parseFloat(value) || 0 : value }
          : inst,
      ),
    );
  }

  function addInstallment() {
    setPlanInstallments((prev) => [...prev, { due_date: '', amount: 0 }]);
  }

  function removeInstallment(idx: number) {
    if (planInstallments.length <= 2) return;
    setPlanInstallments((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmitPlan() {
    if (!planInvoice || !planReason) {
      toast.error(tf('paymentPlans.validationError'));
      return;
    }
    setSubmittingPlan(true);
    try {
      await apiClient('/api/v1/parent/finances/payment-plan-requests', {
        method: 'POST',
        body: JSON.stringify({
          invoice_id: planInvoice.id,
          proposed_installments: planInstallments.filter((i) => i.due_date && i.amount > 0),
          reason: planReason,
        }),
      });
      toast.success(tf('paymentPlans.requestSubmitted'));
      setShowPlanModal(false);
    } catch (err) {
      console.error('[FinancesTab]', err);
      toast.error(tf('paymentPlans.requestFailed'));
    } finally {
      setSubmittingPlan(false);
    }
  }

  const unpaidStatuses: InvoiceStatus[] = ['issued', 'partially_paid', 'overdue'];

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-secondary" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={CreditCard}
        title={t('parentDashboard.financesUnavailable')}
        description={t('parentDashboard.financesUnavailableDesc')}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Outstanding balance card */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="text-sm font-medium text-text-secondary">
          {t('parentDashboard.outstandingBalance')}
        </p>
        <p
          className={`mt-1 text-3xl font-bold tracking-tight ${
            data.outstanding_balance > 0 ? 'text-danger-700' : 'text-success-700'
          }`}
          dir="ltr"
        >
          {data.outstanding_balance.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}{' '}
          {data.currency_code}
        </p>
      </div>

      {/* Invoice list */}
      <section>
        <h3 className="mb-3 text-base font-semibold text-text-primary">
          {t('parentDashboard.invoices')}
        </h3>

        {data.invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t('parentDashboard.noInvoices')}
            description={t('parentDashboard.noInvoicesDesc')}
          />
        ) : (
          <div className="space-y-2">
            {data.invoices.map((invoice) => {
              const isUnpaid = unpaidStatuses.includes(invoice.status);
              return (
                <div
                  key={invoice.id}
                  className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-medium text-text-secondary">
                        {invoice.invoice_number}
                      </span>
                      <StatusBadge status={invoiceStatusVariant[invoice.status]} dot>
                        {invoice.status.replace(/_/g, ' ')}
                      </StatusBadge>
                    </div>
                    {invoice.description && (
                      <p className="mt-0.5 text-sm text-text-secondary">{invoice.description}</p>
                    )}
                    <p className="mt-1 text-xs text-text-tertiary">
                      {tf('date')}: {formatDate(invoice.due_date)}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <div className="text-end">
                      <p className="text-sm font-semibold text-text-primary" dir="ltr">
                        {invoice.balance_amount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        {invoice.currency_code}
                      </p>
                      {invoice.balance_amount !== invoice.total_amount && (
                        <p className="text-xs text-text-tertiary" dir="ltr">{t('of')}{' '}
                          {invoice.total_amount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      )}
                    </div>

                    {isUnpaid && (
                      <div className="flex flex-wrap items-center gap-2">
                        {data.stripe_enabled ? (
                          <Button
                            size="sm"
                            onClick={() => void handlePayNow(invoice)}
                            disabled={payingId === invoice.id}
                          >
                            {payingId === invoice.id ? (
                              <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <CreditCard className="me-1.5 h-3.5 w-3.5" />
                            )}
                            {tf('payNow')}
                          </Button>
                        ) : (
                          <span className="text-xs text-text-tertiary">
                            {t('parentDashboard.contactSchoolForPayment')}
                          </span>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openPlanModal(invoice)}>
                          {tf('paymentPlans.requestPlan')}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Payment history */}
      <section>
        <h3 className="mb-3 text-base font-semibold text-text-primary">
          {t('parentDashboard.paymentHistory')}
        </h3>

        {data.payments.length === 0 ? (
          <p className="text-sm text-text-tertiary">{t('parentDashboard.noPayments')}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                    {tf('reference')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">
                    {tf('date')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-text-tertiary">
                    {tf('totalAmount')}
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase text-text-tertiary" />
                </tr>
              </thead>
              <tbody>
                {data.payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                      {payment.payment_reference}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatDate(payment.received_at)}
                    </td>
                    <td
                      className="px-4 py-3 text-end font-mono font-semibold text-text-primary"
                      dir="ltr"
                    >
                      {payment.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      {payment.currency_code}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDownloadReceipt(payment.id)}
                        disabled={downloadingId === payment.id}
                      >
                        <Download className="me-1 h-3.5 w-3.5" />
                        {t('parentDashboard.receipt')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Payment plan request modal */}
      <Dialog open={showPlanModal} onOpenChange={setShowPlanModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tf('paymentPlans.requestTitle')}</DialogTitle>
          </DialogHeader>
          {planInvoice && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                {tf('paymentPlans.requestDescription', {
                  number: planInvoice.invoice_number,
                  amount: planInvoice.balance_amount.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  }),
                  currency: planInvoice.currency_code,
                })}
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{tf('paymentPlans.proposedInstallments')}</Label>
                  <Button size="sm" variant="outline" type="button" onClick={addInstallment}>
                    + {tf('paymentPlans.addInstallment')}
                  </Button>
                </div>
                {planInstallments.map((inst, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="date"
                      value={inst.due_date}
                      onChange={(e) => updateInstallment(idx, 'due_date', e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={inst.amount || ''}
                      onChange={(e) => updateInstallment(idx, 'amount', e.target.value)}
                      className="w-28 rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      dir="ltr"
                    />
                    {planInstallments.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeInstallment(idx)}
                        className="text-danger-600 hover:text-danger-800 text-xs"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label>{tf('paymentPlans.reason')}</Label>
                <Textarea
                  value={planReason}
                  onChange={(e) => setPlanReason(e.target.value)}
                  placeholder={tf('paymentPlans.reasonPlaceholder')}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPlanModal(false)}
              disabled={submittingPlan}
            >
              {tf('cancel')}
            </Button>
            <Button
              onClick={() => void handleSubmitPlan()}
              disabled={submittingPlan || !planReason}
            >
              {submittingPlan ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {tf('paymentPlans.submitRequest')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
