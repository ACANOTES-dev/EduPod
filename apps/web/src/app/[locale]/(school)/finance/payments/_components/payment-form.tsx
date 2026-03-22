'use client';

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
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

import { HouseholdSelector } from '../../_components/household-selector';

interface PaymentFormProps {
  onSuccess: (paymentId: string) => void;
}

export function PaymentForm({ onSuccess }: PaymentFormProps) {
  const t = useTranslations('finance');
  const [householdId, setHouseholdId] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [receivedAt, setReceivedAt] = React.useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 16);
  });
  const [reason, setReason] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!householdId) newErrors.householdId = 'Household is required';
    if (!paymentMethod) newErrors.paymentMethod = 'Payment method is required';
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      newErrors.amount = 'Amount must be a positive number';
    }
    if (!receivedAt) newErrors.receivedAt = 'Received date is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const payload = {
        household_id: householdId,
        payment_method: paymentMethod,
        amount: parseFloat(amount),
        received_at: new Date(receivedAt).toISOString(),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      };

      const res = await apiClient<{ data: { id: string } }>(
        '/api/v1/finance/payments',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );

      toast.success(t('paymentRecorded'));
      onSuccess(res.data.id);
    } catch {
      toast.error(t('paymentRecordFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      <p className="text-sm text-text-secondary">{t('paymentRefAutoNote')}</p>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Household */}
        <div className="sm:col-span-2 space-y-2">
          <Label>Household *</Label>
          <HouseholdSelector
            value={householdId}
            onValueChange={setHouseholdId}
            placeholder="Search and select household..."
          />
          {errors.householdId && (
            <p className="text-xs text-danger-text">{errors.householdId}</p>
          )}
        </div>

        {/* Payment Method */}
        <div className="space-y-2">
          <Label>Payment Method *</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger>
              <SelectValue placeholder="Select method..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              <SelectItem value="card_manual">Card (Manual)</SelectItem>
            </SelectContent>
          </Select>
          {errors.paymentMethod && (
            <p className="text-xs text-danger-text">{errors.paymentMethod}</p>
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
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {errors.amount && (
            <p className="text-xs text-danger-text">{errors.amount}</p>
          )}
        </div>

        {/* Received At */}
        <div className="space-y-2">
          <Label>Received At *</Label>
          <Input
            type="datetime-local"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
          />
          {errors.receivedAt && (
            <p className="text-xs text-danger-text">{errors.receivedAt}</p>
          )}
        </div>

        {/* Reason */}
        <div className="sm:col-span-2 space-y-2">
          <Label>Reason (optional)</Label>
          <Textarea
            placeholder="Optional notes about this payment..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Recording...' : 'Record Payment'}
        </Button>
      </div>
    </form>
  );
}
