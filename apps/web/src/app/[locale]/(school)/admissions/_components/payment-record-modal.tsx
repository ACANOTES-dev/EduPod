'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface PaymentRecordModalProps {
  applicationId: string | null;
  expectedCents: number | null;
  currencyCode: string | null;
  open: boolean;
  onClose: () => void;
  onRecorded: () => void;
}

type Tab = 'cash' | 'bank' | 'stripe';

function formatAmount(cents: number, currency: string | null): string {
  const value = (cents / 100).toFixed(2);
  return currency ? `${value} ${currency}` : value;
}

export function PaymentRecordModal({
  applicationId,
  expectedCents,
  currencyCode,
  open,
  onClose,
  onRecorded,
}: PaymentRecordModalProps) {
  const t = useTranslations('admissionsQueues');
  const [tab, setTab] = React.useState<Tab>('cash');
  const [submitting, setSubmitting] = React.useState(false);

  // Cash state
  const [cashAmount, setCashAmount] = React.useState<string>('');
  const [cashReceipt, setCashReceipt] = React.useState<string>('');
  const [cashNotes, setCashNotes] = React.useState<string>('');

  // Bank state
  const [bankAmount, setBankAmount] = React.useState<string>('');
  const [bankReference, setBankReference] = React.useState<string>('');
  const [bankDate, setBankDate] = React.useState<string>(new Date().toISOString().slice(0, 10));
  const [bankNotes, setBankNotes] = React.useState<string>('');

  React.useEffect(() => {
    if (open && expectedCents) {
      const expectedMajor = (expectedCents / 100).toFixed(2);
      setCashAmount(expectedMajor);
      setBankAmount(expectedMajor);
      setCashReceipt('');
      setCashNotes('');
      setBankReference('');
      setBankNotes('');
      setTab('cash');
    }
  }, [open, expectedCents]);

  const submitCash = async () => {
    if (!applicationId || !expectedCents) return;
    const cents = Math.round(Number(cashAmount) * 100);
    if (!Number.isFinite(cents) || cents < expectedCents) {
      toast.error(t('paymentModal.errorBelowExpected'));
      return;
    }
    setSubmitting(true);
    try {
      await apiClient(`/api/v1/applications/${applicationId}/payment/cash`, {
        method: 'POST',
        body: JSON.stringify({
          amount_cents: cents,
          receipt_number: cashReceipt || undefined,
          notes: cashNotes || undefined,
        }),
      });
      toast.success(t('paymentModal.successCash'));
      onRecorded();
      onClose();
    } catch (err) {
      console.error('[PaymentRecordModal.cash]', err);
      toast.error(t('paymentModal.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitBank = async () => {
    if (!applicationId || !expectedCents) return;
    const cents = Math.round(Number(bankAmount) * 100);
    if (!Number.isFinite(cents) || cents < expectedCents) {
      toast.error(t('paymentModal.errorBelowExpected'));
      return;
    }
    if (!bankReference.trim()) {
      toast.error(t('paymentModal.errorReferenceRequired'));
      return;
    }
    setSubmitting(true);
    try {
      await apiClient(`/api/v1/applications/${applicationId}/payment/bank-transfer`, {
        method: 'POST',
        body: JSON.stringify({
          amount_cents: cents,
          transfer_reference: bankReference.trim(),
          transfer_date: new Date(bankDate).toISOString(),
          notes: bankNotes || undefined,
        }),
      });
      toast.success(t('paymentModal.successBank'));
      onRecorded();
      onClose();
    } catch (err) {
      console.error('[PaymentRecordModal.bank]', err);
      toast.error(t('paymentModal.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('paymentModal.title')}</DialogTitle>
          <DialogDescription>
            {t('paymentModal.description', {
              amount: expectedCents ? formatAmount(expectedCents, currencyCode) : '—',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border">
          {(['cash', 'bank', 'stripe'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                tab === key
                  ? 'border-b-2 border-primary-700 text-primary-700'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t(`paymentModal.tabs.${key}`)}
            </button>
          ))}
        </div>

        {tab === 'cash' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cash-amount">{t('paymentModal.amountLabel')}</Label>
              <Input
                id="cash-amount"
                type="number"
                step="0.01"
                min={expectedCents ? (expectedCents / 100).toFixed(2) : 0}
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cash-receipt">{t('paymentModal.receiptLabel')}</Label>
              <Input
                id="cash-receipt"
                value={cashReceipt}
                onChange={(e) => setCashReceipt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cash-notes">{t('paymentModal.notesLabel')}</Label>
              <Textarea
                id="cash-notes"
                rows={2}
                value={cashNotes}
                onChange={(e) => setCashNotes(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                {t('common.cancel')}
              </Button>
              <Button onClick={submitCash} disabled={submitting}>
                {submitting ? t('common.working') : t('paymentModal.submitCash')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {tab === 'bank' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="bank-amount">{t('paymentModal.amountLabel')}</Label>
              <Input
                id="bank-amount"
                type="number"
                step="0.01"
                min={expectedCents ? (expectedCents / 100).toFixed(2) : 0}
                value={bankAmount}
                onChange={(e) => setBankAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bank-reference">{t('paymentModal.referenceLabel')}</Label>
              <Input
                id="bank-reference"
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bank-date">{t('paymentModal.dateLabel')}</Label>
              <Input
                id="bank-date"
                type="date"
                value={bankDate}
                onChange={(e) => setBankDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bank-notes">{t('paymentModal.notesLabel')}</Label>
              <Textarea
                id="bank-notes"
                rows={2}
                value={bankNotes}
                onChange={(e) => setBankNotes(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={submitting}>
                {t('common.cancel')}
              </Button>
              <Button onClick={submitBank} disabled={submitting}>
                {submitting ? t('common.working') : t('paymentModal.submitBank')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {tab === 'stripe' && (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">{t('paymentModal.stripeDescription')}</p>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                {t('common.close')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
