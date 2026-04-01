'use client';

import { CheckCircle2, Info, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import type { WizardAction, WizardState } from './types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return value.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PAYMENT_METHODS = [
  { value: 'cash', labelKey: 'cash' },
  { value: 'bank_transfer', labelKey: 'bankTransfer' },
  { value: 'card_manual', labelKey: 'cardManual' },
] as const;

// ─── Props ───────────────────────────────────────────────────────────────────

interface StepPaymentProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StepPayment({ state, dispatch }: StepPaymentProps) {
  const t = useTranslations('registration');

  const reg = state.registrationResult;

  const [amount, setAmount] = React.useState(String(reg?.invoice.total_amount ?? 0));
  const [method, setMethod] = React.useState('cash');
  const [reference, setReference] = React.useState(`REG-${reg?.household.household_number ?? ''}`);
  const [receivedAt, setReceivedAt] = React.useState(new Date().toISOString().slice(0, 10));
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  if (!reg) return null;

  const invoiceTotal = reg.invoice.total_amount;
  const invoiceBalance = reg.invoice.balance_amount;
  const parsedAmount = parseFloat(amount) || 0;
  const remaining = Math.max(0, invoiceBalance - parsedAmount);
  const isPendingApproval = reg.invoice.status === 'pending_approval';

  const handleRecordPayment = async () => {
    if (parsedAmount <= 0) {
      toast.error(t('invalidPaymentAmount'));
      return;
    }

    setIsSubmitting(true);
    dispatch({ type: 'SET_LOADING', loading: true });

    try {
      // 1. Create payment
      const paymentRes = await apiClient<{
        data: { id: string; amount: number; payment_method: string };
      }>('/api/v1/finance/payments', {
        method: 'POST',
        body: JSON.stringify({
          household_id: reg.household.id,
          amount: parsedAmount,
          payment_method: method,
          payment_reference: reference || `REG-${reg.household.household_number}`,
          received_at: new Date(receivedAt + 'T00:00:00').toISOString(),
        }),
      });

      // 2. Allocate to invoice
      const allocAmount = Math.min(parsedAmount, invoiceBalance);
      await apiClient(`/api/v1/finance/payments/${paymentRes.data.id}/allocations`, {
        method: 'POST',
        body: JSON.stringify({
          allocations: [{ invoice_id: reg.invoice.id, amount: allocAmount }],
        }),
      });

      // 3. Dispatch result
      dispatch({
        type: 'SET_PAYMENT_RESULT',
        result: {
          id: paymentRes.data.id,
          amount: parsedAmount,
          payment_method: method,
        },
      });
      dispatch({ type: 'SET_STEP', step: 5 });
    } catch {
      toast.error(t('paymentFailed'));
    } finally {
      setIsSubmitting(false);
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  };

  const handleSkip = () => {
    dispatch({ type: 'SET_STEP', step: 5 });
  };

  return (
    <div className="space-y-6">
      {/* ── Success banner ───────────────────────────────────────────── */}
      <div className="rounded-lg bg-success-fill px-5 py-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-success-text" />
          <div>
            <h3 className="text-base font-semibold text-success-text">{t('familyRegistered')}</h3>
            <p className="mt-1 text-sm text-success-text">
              {t('registeredSummary', {
                count: reg.students.length,
                total: formatCurrency(invoiceTotal),
              })}
            </p>
          </div>
        </div>
      </div>

      {/* ── Pending approval info ────────────────────────────────────── */}
      {isPendingApproval && (
        <div className="rounded-lg bg-info-fill px-5 py-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-info-text" />
            <p className="text-sm text-info-text">{t('pendingApproval')}</p>
          </div>
        </div>
      )}

      {/* ── Payment form (not shown if pending approval) ─────────────── */}
      {!isPendingApproval && (
        <>
          <div className="rounded-lg border border-border-primary bg-surface-primary p-4">
            <h3 className="mb-4 text-sm font-semibold text-text-primary">{t('recordPayment')}</h3>

            {/* Row 1: Amount + Method */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="payment-amount">{t('paymentAmount')} *</Label>
                <Input
                  id="payment-amount"
                  type="number"
                  dir="ltr"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('paymentMethod')} *</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((pm) => (
                      <SelectItem key={pm.value} value={pm.value}>
                        {t(pm.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Reference + Date */}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="payment-reference">{t('reference')}</Label>
                <Input
                  id="payment-reference"
                  dir="ltr"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-date">{t('dateReceived')} *</Label>
                <Input
                  id="payment-date"
                  type="date"
                  dir="ltr"
                  value={receivedAt}
                  onChange={(e) => setReceivedAt(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ── Balance display ─────────────────────────────────────────── */}
          <div className="rounded-lg border border-border-primary bg-surface-secondary p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">{t('invoiceTotal')}</span>
                <span className="text-sm font-medium text-text-primary" dir="ltr">
                  {formatCurrency(invoiceTotal)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">{t('thisPayment')}</span>
                <span className="text-sm font-medium text-success-text" dir="ltr">
                  -{formatCurrency(parsedAmount)}
                </span>
              </div>
              <div className="border-t border-border-primary pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-text-primary">
                    {t('remainingBalance')}
                  </span>
                  <span
                    className={`text-base font-bold ${
                      remaining > 0 ? 'text-danger-text' : 'text-success-text'
                    }`}
                    dir="ltr"
                  >
                    {formatCurrency(remaining)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Action buttons ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={handleSkip}>
          {t('skipNoPayment')}
        </Button>
        {!isPendingApproval && (
          <Button
            type="button"
            disabled={isSubmitting || parsedAmount <= 0}
            onClick={handleRecordPayment}
          >
            {isSubmitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('recordPayment')}
          </Button>
        )}
      </div>
    </div>
  );
}
