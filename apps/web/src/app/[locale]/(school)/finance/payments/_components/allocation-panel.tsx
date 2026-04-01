'use client';

import { Sparkles, Check } from 'lucide-react';
import * as React from 'react';

import type { AllocationSuggestion } from '@school/shared';
import { Button, Input, toast } from '@school/ui';

import { CurrencyDisplay } from '../../_components/currency-display';

import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';


interface AllocationRow {
  invoice_id: string;
  invoice_number: string;
  invoice_due_date: string;
  invoice_balance: number;
  amount: string;
}

interface AllocationPanelProps {
  paymentId: string;
  paymentAmount: number;
  currencyCode: string;
  onAllocationComplete: () => void;
}

export function AllocationPanel({
  paymentId,
  paymentAmount,
  currencyCode,
  onAllocationComplete,
}: AllocationPanelProps) {
  const [rows, setRows] = React.useState<AllocationRow[]>([]);
  const [isSuggesting, setIsSuggesting] = React.useState(false);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [hasSuggested, setHasSuggested] = React.useState(false);

  const totalAllocated = rows.reduce((sum, row) => {
    const amt = parseFloat(row.amount);
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const remaining = paymentAmount - totalAllocated;

  const isValid =
    rows.length > 0 &&
    rows.some((r) => parseFloat(r.amount) > 0) &&
    totalAllocated <= paymentAmount + 0.01 &&
    rows.every((r) => {
      const amt = parseFloat(r.amount);
      return isNaN(amt) || amt === 0 || (amt > 0 && amt <= r.invoice_balance + 0.01);
    });

  const handleSuggest = async () => {
    setIsSuggesting(true);
    try {
      const res = await apiClient<{ data: AllocationSuggestion[] }>(
        `/api/v1/finance/payments/${paymentId}/allocations/suggest`,
      );

      const suggestions = res.data;
      if (suggestions.length === 0) {
        toast.info('No outstanding invoices found for this household');
        return;
      }

      setRows(
        suggestions.map((s) => ({
          invoice_id: s.invoice_id,
          invoice_number: s.invoice_number,
          invoice_due_date: s.invoice_due_date,
          invoice_balance: s.invoice_balance,
          amount: s.suggested_amount > 0 ? s.suggested_amount.toFixed(2) : '0',
        })),
      );
      setHasSuggested(true);
    } catch {
      toast.error('Failed to fetch allocation suggestions');
    } finally {
      setIsSuggesting(false);
    }
  };

  const updateAmount = (index: number, value: string) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, amount: value } : row)));
  };

  const handleConfirm = async () => {
    if (!isValid) return;

    setIsConfirming(true);
    try {
      const allocations = rows
        .filter((r) => parseFloat(r.amount) > 0)
        .map((r) => ({
          invoice_id: r.invoice_id,
          amount: parseFloat(r.amount),
        }));

      await apiClient(`/api/v1/finance/payments/${paymentId}/allocations`, {
        method: 'POST',
        body: JSON.stringify({ allocations }),
      });

      toast.success('Allocations confirmed');
      onAllocationComplete();
    } catch {
      toast.error('Failed to confirm allocations');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Allocate Payment</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleSuggest()}
          disabled={isSuggesting}
        >
          <Sparkles className="me-2 h-3.5 w-3.5" />
          {isSuggesting ? 'Suggesting...' : 'Suggest Allocations'}
        </Button>
      </div>

      {!hasSuggested && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-sm text-text-tertiary">
            Click &quot;Suggest Allocations&quot; to auto-fill using FIFO (oldest invoices first),
            or manually enter amounts below.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-secondary">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Invoice
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Due Date
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Balance
                  </th>
                  <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Allocate
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const amt = parseFloat(row.amount);
                  const exceedsBalance = !isNaN(amt) && amt > row.invoice_balance + 0.01;
                  return (
                    <tr key={row.invoice_id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-3 text-sm">
                        <span className="font-mono text-xs text-primary-700">
                          {row.invoice_number}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary">
                        {formatDate(row.invoice_due_date)}
                      </td>
                      <td className="px-4 py-3 text-end text-sm text-text-primary">
                        <CurrencyDisplay
                          amount={row.invoice_balance}
                          currency_code={currencyCode}
                        />
                      </td>
                      <td className="px-4 py-3 text-end">
                        <div className="flex flex-col items-end gap-1">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={row.invoice_balance}
                            value={row.amount}
                            onChange={(e) => updateAmount(index, e.target.value)}
                            className="w-32 text-end"
                          />
                          {exceedsBalance && (
                            <span className="text-xs text-danger-text">Exceeds balance</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Running total */}
          <div className="flex flex-wrap items-center justify-between rounded-xl border border-border px-6 py-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-text-tertiary">Payment Amount</span>
              <CurrencyDisplay
                amount={paymentAmount}
                currency_code={currencyCode}
                className="text-sm font-semibold"
              />
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-xs text-text-tertiary">Total Allocated</span>
              <CurrencyDisplay
                amount={totalAllocated}
                currency_code={currencyCode}
                className={`text-sm font-semibold ${totalAllocated > paymentAmount + 0.01 ? 'text-danger-text' : 'text-success-text'}`}
              />
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-xs text-text-tertiary">Remaining</span>
              <CurrencyDisplay
                amount={Math.max(0, remaining)}
                currency_code={currencyCode}
                className={`text-sm font-semibold ${remaining < -0.01 ? 'text-danger-text' : remaining > 0.01 ? 'text-warning-text' : 'text-text-tertiary'}`}
              />
            </div>
          </div>

          {totalAllocated > paymentAmount + 0.01 && (
            <p className="text-xs text-danger-text">
              Total allocations cannot exceed the payment amount.
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={() => void handleConfirm()} disabled={!isValid || isConfirming}>
              <Check className="me-2 h-4 w-4" />
              {isConfirming ? 'Confirming...' : 'Confirm Allocations'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
