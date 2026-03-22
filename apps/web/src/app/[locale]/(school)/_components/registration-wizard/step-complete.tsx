'use client';

import { Button } from '@school/ui';
import { CheckCircle, FileText, Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { WizardAction, WizardState } from './types';

interface StepCompleteProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  onClose: () => void;
}

export function StepComplete({ state, dispatch, onClose }: StepCompleteProps) {
  const t = useTranslations('registration');

  const reg = state.registrationResult;
  const payment = state.paymentResult;

  if (!reg) return null;

  const familyName = reg.household.household_name;
  const studentCount = reg.students.length;
  const paymentAmount = payment?.amount;
  const billingParentEmail = state.primaryParent.email;
  const outstandingBalance = reg.invoice.balance_amount;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);

  const paymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      cash: t('cash'),
      bank_transfer: t('bankTransfer'),
      card_manual: t('cardManual'),
      stripe: t('stripe'),
    };
    return labels[method] ?? method;
  };

  const handlePrintReceipt = () => {
    if (!payment) return;
    const url = payment.receipt_id
      ? `/api/v1/finance/receipts/${payment.receipt_id}/pdf`
      : `/api/v1/finance/payments/${payment.id}/receipt/pdf`;
    window.open(url, '_blank');
  };

  const handlePrintStatement = () => {
    window.open(
      `/api/v1/finance/statements/${reg.household.id}/pdf`,
      '_blank',
    );
  };

  const handleDone = () => {
    dispatch({ type: 'RESET' });
    onClose();
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Success area */}
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600">
          <CheckCircle className="h-8 w-8" />
        </div>
        <h3 className="text-xl font-semibold text-text-primary">
          {t('registrationComplete')}
        </h3>
        <p className="text-sm text-text-secondary">
          {payment
            ? t('completeSummary', {
                name: familyName,
                count: studentCount,
                payment: formatCurrency(paymentAmount!),
              })
            : t('completeSummaryNoPayment', {
                name: familyName,
                count: studentCount,
              })}
        </p>
        {billingParentEmail && payment && (
          <p className="text-xs text-text-tertiary">
            {t('receiptSent', { email: billingParentEmail })}
          </p>
        )}
      </div>

      {/* Summary table */}
      <div className="rounded-lg border border-border divide-y divide-border">
        {/* Household */}
        <div className="flex justify-between px-4 py-3">
          <span className="text-sm font-medium text-text-secondary">
            {t('householdLabel')}
          </span>
          <span className="text-sm text-text-primary">
            {reg.household.household_name} ({reg.household.household_number})
          </span>
        </div>

        {/* Students */}
        <div className="px-4 py-3">
          <span className="text-sm font-medium text-text-secondary">
            {t('studentsLabel')}
          </span>
          <ul className="mt-1 space-y-1">
            {reg.students.map((s) => (
              <li
                key={s.id}
                className="text-sm text-text-primary flex justify-between"
              >
                <span>
                  {s.first_name} {s.last_name}
                </span>
                <span className="text-text-tertiary">{s.student_number}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Annual Fees */}
        <div className="flex justify-between px-4 py-3">
          <span className="text-sm font-medium text-text-secondary">
            {t('annualFees')}
          </span>
          <span className="text-sm text-text-primary">
            {formatCurrency(reg.invoice.total_amount)}
          </span>
        </div>

        {/* Payment Recorded */}
        <div className="flex justify-between px-4 py-3">
          <span className="text-sm font-medium text-text-secondary">
            {t('paymentRecorded')}
          </span>
          <span className="text-sm text-text-primary">
            {payment
              ? `${formatCurrency(payment.amount)} (${paymentMethodLabel(payment.payment_method)})`
              : '\u2014'}
          </span>
        </div>

        {/* Outstanding Balance */}
        <div className="flex justify-between px-4 py-3">
          <span className="text-sm font-medium text-text-secondary">
            {t('outstandingBalance')}
          </span>
          <span
            className={`text-sm font-semibold ${
              outstandingBalance > 0 ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {formatCurrency(outstandingBalance)}
          </span>
        </div>
      </div>

      {/* Print buttons */}
      <div className="flex gap-3">
        {payment && (
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={handlePrintReceipt}
          >
            <Printer className="h-4 w-4" />
            {t('printReceipt')}
          </Button>
        )}
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={handlePrintStatement}
        >
          <FileText className="h-4 w-4" />
          {t('printStatement')}
        </Button>
      </div>

      {/* Done button */}
      <Button className="w-full" onClick={handleDone}>
        {t('doneCloseWizard')}
      </Button>
    </div>
  );
}
