'use client';

import { Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Input,
  Label,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { CurrencyDisplay } from '../../../_components/currency-display';

interface InstallmentRow {
  due_date: string;
  amount: string;
}

interface InstallmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceTotal: number;
  currencyCode: string;
  onSuccess: () => void;
}

export function InstallmentForm({
  open,
  onOpenChange,
  invoiceId,
  invoiceTotal,
  currencyCode,
  onSuccess,
}: InstallmentFormProps) {
  const [rows, setRows] = React.useState<InstallmentRow[]>([
    { due_date: '', amount: '' },
    { due_date: '', amount: '' },
  ]);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const totalAllocated = rows.reduce((sum, row) => {
    const amt = parseFloat(row.amount);
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const remaining = invoiceTotal - totalAllocated;
  const isValid =
    rows.length >= 1 &&
    rows.every((r) => r.due_date && parseFloat(r.amount) > 0) &&
    Math.abs(remaining) < 0.01;

  const addRow = () => {
    setRows((prev) => [...prev, { due_date: '', amount: '' }]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof InstallmentRow, value: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const handleSubmit = async () => {
    if (!isValid) return;

    setIsSubmitting(true);
    try {
      const installments = rows.map((r) => ({
        due_date: r.due_date,
        amount: parseFloat(r.amount),
      }));

      await apiClient(`/api/v1/finance/invoices/${invoiceId}/installments`, {
        method: 'POST',
        body: JSON.stringify({ installments }),
      });

      toast.success('Installment plan created');
      setRows([
        { due_date: '', amount: '' },
        { due_date: '', amount: '' },
      ]);
      onSuccess();
    } catch {
      toast.error('Failed to create installment plan');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Installment Plan</DialogTitle>
          <DialogDescription>
            Split the invoice total into installments. The sum of all installments must equal the
            invoice total.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-surface-secondary px-4 py-3">
            <span className="text-sm text-text-secondary">Invoice Total</span>
            <CurrencyDisplay
              amount={invoiceTotal}
              currency_code={currencyCode}
              className="font-semibold"
            />
          </div>

          {/* Installment rows */}
          <div className="space-y-3">
            {rows.map((row, index) => (
              <div key={index} className="flex items-end gap-3">
                <div className="flex-1">
                  <Label className="text-xs">Due Date</Label>
                  <Input
                    type="date"
                    value={row.due_date}
                    onChange={(e) => updateRow(index, 'due_date', e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Label className="text-xs">Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={row.amount}
                    onChange={(e) => updateRow(index, 'amount', e.target.value)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(index)}
                  disabled={rows.length <= 1}
                  className="shrink-0"
                >
                  <Trash2 className="h-4 w-4 text-text-tertiary" />
                </Button>
              </div>
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="me-2 h-3.5 w-3.5" />
            Add Installment
          </Button>

          {/* Running total */}
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <span className="text-sm text-text-secondary">Total Allocated</span>
            <div className="flex items-center gap-3">
              <CurrencyDisplay
                amount={totalAllocated}
                currency_code={currencyCode}
                className={
                  Math.abs(remaining) < 0.01
                    ? 'font-medium text-success-text'
                    : 'font-medium text-danger-text'
                }
              />
              {Math.abs(remaining) >= 0.01 && (
                <span className="text-xs text-danger-text">
                  ({remaining > 0 ? 'Remaining' : 'Over'}:{' '}
                  <CurrencyDisplay amount={Math.abs(remaining)} currency_code={currencyCode} />)
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!isValid || isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
