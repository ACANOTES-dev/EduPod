'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { recordBankTransferSchema } from '@school/shared';
import type { RecordBankTransferDto } from '@school/shared';
import { Button, Input, Label, Textarea, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface RecordBankTransferModalProps {
  open: boolean;
  applicationId: string;
  expectedAmountCents: number | null;
  currencyCode: string | null;
  onClose: () => void;
  onRecorded: () => void;
}

export function RecordBankTransferModal({
  open,
  applicationId,
  expectedAmountCents,
  currencyCode,
  onClose,
  onRecorded,
}: RecordBankTransferModalProps) {
  const form = useForm<RecordBankTransferDto>({
    resolver: zodResolver(recordBankTransferSchema),
    defaultValues: {
      amount_cents: expectedAmountCents ?? 0,
      transfer_reference: '',
      transfer_date: new Date().toISOString(),
      notes: '',
    },
  });

  if (!open) return null;

  const onSubmit = async (values: RecordBankTransferDto) => {
    try {
      await apiClient(`/api/v1/applications/${applicationId}/payment/bank-transfer`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast.success('Bank transfer recorded. Application approved.');
      onRecorded();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to record bank transfer';
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
        <h2 className="text-lg font-semibold text-text-primary">Record bank transfer</h2>
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
            <Label htmlFor="bank-amount">Amount received (cents)</Label>
            <Input
              id="bank-amount"
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
            <Label htmlFor="bank-reference">Transfer reference</Label>
            <Input id="bank-reference" {...form.register('transfer_reference')} />
            {form.formState.errors.transfer_reference && (
              <p className="text-xs text-danger-text">
                {form.formState.errors.transfer_reference.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="bank-date">Transfer date</Label>
            <Input
              id="bank-date"
              type="datetime-local"
              defaultValue={new Date().toISOString().slice(0, 16)}
              onChange={(e) => {
                const raw = e.target.value;
                form.setValue('transfer_date', raw ? new Date(raw).toISOString() : '');
              }}
            />
            {form.formState.errors.transfer_date && (
              <p className="text-xs text-danger-text">
                {form.formState.errors.transfer_date.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="bank-notes">Notes (optional)</Label>
            <Textarea id="bank-notes" rows={3} {...form.register('notes')} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Record transfer
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
