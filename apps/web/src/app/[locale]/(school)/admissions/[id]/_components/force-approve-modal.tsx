'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { forceApproveOverrideSchema } from '@school/shared';
import type { ForceApproveOverrideDto } from '@school/shared';
import { Button, Input, Label, Textarea, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface ForceApproveModalProps {
  open: boolean;
  applicationId: string;
  expectedAmountCents: number | null;
  onClose: () => void;
  onApproved: () => void;
}

export function ForceApproveModal({
  open,
  applicationId,
  expectedAmountCents,
  onClose,
  onApproved,
}: ForceApproveModalProps) {
  const form = useForm<ForceApproveOverrideDto>({
    resolver: zodResolver(forceApproveOverrideSchema),
    defaultValues: {
      override_type: 'full_waiver',
      actual_amount_collected_cents: 0,
      justification: '',
    },
  });

  if (!open) return null;

  const onSubmit = async (values: ForceApproveOverrideDto) => {
    try {
      await apiClient(`/api/v1/applications/${applicationId}/payment/override`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast.success('Application force-approved and audit trail recorded.');
      onApproved();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to force-approve';
      toast.error(message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl border border-danger-border bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-danger-text">Force approve without payment</h2>
        <p className="mt-1 text-sm text-text-secondary">
          This writes an audit record and immediately approves the application. Expected amount:{' '}
          <span className="font-mono">
            {expectedAmountCents !== null ? `${(expectedAmountCents / 100).toFixed(2)}` : '—'}
          </span>
        </p>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="override-type">Override type</Label>
            <select
              id="override-type"
              className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
              {...form.register('override_type')}
            >
              <option value="full_waiver">Full waiver (no payment)</option>
              <option value="partial_waiver">Partial waiver (partial payment)</option>
              <option value="deferred_payment">Deferred payment</option>
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="override-actual">Actual amount collected (cents)</Label>
            <Input
              id="override-actual"
              type="number"
              inputMode="numeric"
              {...form.register('actual_amount_collected_cents', { valueAsNumber: true })}
            />
            {form.formState.errors.actual_amount_collected_cents && (
              <p className="text-xs text-danger-text">
                {form.formState.errors.actual_amount_collected_cents.message}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="override-justification">Justification (min 20 chars)</Label>
            <Textarea
              id="override-justification"
              rows={5}
              {...form.register('justification')}
              placeholder="Explain why this application is being approved without full payment"
            />
            {form.formState.errors.justification && (
              <p className="text-xs text-danger-text">
                {form.formState.errors.justification.message}
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
              Force approve
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
