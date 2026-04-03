'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { createPaymentSchema } from '@school/shared';
import type { CreatePaymentDto } from '@school/shared';
import {
  Button,
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

import { HouseholdSelector } from '../../_components/household-selector';

import { apiClient } from '@/lib/api-client';


// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowLocalDatetime(): string {
  const now = new Date();
  return now.toISOString().slice(0, 16);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PaymentFormProps {
  onSuccess: (paymentId: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PaymentForm({ onSuccess }: PaymentFormProps) {
  const t = useTranslations('finance');

  const form = useForm<CreatePaymentDto>({
    resolver: zodResolver(createPaymentSchema),
    defaultValues: {
      household_id: '',
      payment_method: undefined,
      amount: undefined,
      received_at: new Date(nowLocalDatetime()).toISOString(),
      reason: '',
    },
  });

  // Local state for the datetime-local input (string), converted to ISO on submit
  const [receivedAtLocal, setReceivedAtLocal] = React.useState<string>(nowLocalDatetime);

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const res = await apiClient<{ data: { id: string } }>('/api/v1/finance/payments', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          received_at: new Date(receivedAtLocal).toISOString(),
          reason: values.reason?.trim() || undefined,
        }),
      });
      toast.success(t('paymentRecorded'));
      onSuccess(res.data.id);
    } catch {
      toast.error(t('paymentRecordFailed'));
    }
  });

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      <p className="text-sm text-text-secondary">{t('paymentRefAutoNote')}</p>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Household */}
        <div className="sm:col-span-2 space-y-2">
          <Label>Household *</Label>
          <Controller
            control={form.control}
            name="household_id"
            render={({ field }) => (
              <HouseholdSelector
                value={field.value}
                onValueChange={field.onChange}
                placeholder="Search and select household..."
              />
            )}
          />
          {form.formState.errors.household_id && (
            <p className="text-xs text-danger-text">{form.formState.errors.household_id.message}</p>
          )}
        </div>

        {/* Payment Method */}
        <div className="space-y-2">
          <Label>Payment Method *</Label>
          <Controller
            control={form.control}
            name="payment_method"
            render={({ field }) => (
              <Select value={field.value ?? ''} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select method..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="card_manual">Card (Manual)</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {form.formState.errors.payment_method && (
            <p className="text-xs text-danger-text">
              {form.formState.errors.payment_method.message}
            </p>
          )}
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <Label>Amount *</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            {...form.register('amount', { valueAsNumber: true })}
          />
          {form.formState.errors.amount && (
            <p className="text-xs text-danger-text">{form.formState.errors.amount.message}</p>
          )}
        </div>

        {/* Received At */}
        <div className="space-y-2">
          <Label>Received At *</Label>
          <Input
            type="datetime-local"
            value={receivedAtLocal}
            onChange={(e) => {
              setReceivedAtLocal(e.target.value);
              form.setValue('received_at', new Date(e.target.value).toISOString(), {
                shouldValidate: true,
              });
            }}
          />
          {form.formState.errors.received_at && (
            <p className="text-xs text-danger-text">{form.formState.errors.received_at.message}</p>
          )}
        </div>

        {/* Reason */}
        <div className="sm:col-span-2 space-y-2">
          <Label>Reason (optional)</Label>
          <Textarea
            placeholder="Optional notes about this payment..."
            rows={2}
            {...form.register('reason')}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Recording...' : 'Record Payment'}
        </Button>
      </div>
    </form>
  );
}
