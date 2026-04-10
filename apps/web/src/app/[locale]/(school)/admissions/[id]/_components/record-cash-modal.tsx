'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { recordCashPaymentSchema } from '@school/shared';
import type { RecordCashPaymentDto } from '@school/shared';
import { Button, Input, Label, Textarea, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface RecordCashModalProps {
  open: boolean;
  applicationId: string;
  expectedAmountCents: number | null;
  currencyCode: string | null;
  onClose: () => void;
  onRecorded: () => void;
}

export function RecordCashModal({
  open,
  applicationId,
  expectedAmountCents,
  currencyCode,
  onClose,
  onRecorded,
}: RecordCashModalProps) {
  const form = useForm<RecordCashPaymentDto>({
    resolver: zodResolver(recordCashPaymentSchema),
    defaultValues: {
      amount_cents: expectedAmountCents ?? 0,
      receipt_number: '',
      notes: '',
    },
  });

  if (!open) return null;

  const onSubmit = async (values: RecordCashPaymentDto) => {
    try {
      await apiClient(`/api/v1/applications/${applicationId}/payment/cash`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast.success('Cash payment recorded. Application approved.');
      onRecorded();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to record cash payment';
      toast.error(message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text-primary">Record cash payment</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Expected upfront:{' '}
          <span className="font-mono">
            {expectedAmountCents !== null
              ? `${(expectedAmountCents / 100).toFixed(2)} ${currencyCode ?? ''}`
              : '—'}
          </span>
        </p>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="cash-amount">Amount received (cents)</Label>
            <Input
              id="cash-amount"
              type="number"
              inputMode="numeric"
              {...form.register('amount_cents', { valueAsNumber: true })}
            />
            {form.formState.errors.amount_cents && (
              <p className="text-xs text-danger-text">
                {form.formState.errors.amount_cents.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="cash-receipt">Receipt number (optional)</Label>
            <Input id="cash-receipt" {...form.register('receipt_number')} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cash-notes">Notes (optional)</Label>
            <Textarea id="cash-notes" rows={3} {...form.register('notes')} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Record payment
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
