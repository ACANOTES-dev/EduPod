'use client';

import * as React from 'react';

import { CurrencyDisplay } from '../../../_components/currency-display';

import { EntityLink } from '@/components/entity-link';
import { formatDate } from '@/lib/format-date';

interface PaymentAllocation {
  id: string;
  amount: number;
  created_at: string;
  payment: {
    id: string;
    payment_reference: string;
    payment_method: string;
    received_at: string;
  };
}

const methodLabelMap: Record<string, string> = {
  stripe: 'Stripe',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  card_manual: 'Card (Manual)',
};

interface InvoicePaymentsTabProps {
  allocations: PaymentAllocation[];
  currencyCode: string;
}

export function InvoicePaymentsTab({ allocations, currencyCode }: InvoicePaymentsTabProps) {
  if (allocations.length === 0) {
    return <p className="text-sm text-text-tertiary">No payments allocated to this invoice.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-surface-secondary">
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Payment Reference
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Method
            </th>
            <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Amount Allocated
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Date
            </th>
          </tr>
        </thead>
        <tbody>
          {allocations.map((alloc) => (
            <tr
              key={alloc.id}
              className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary"
            >
              <td className="px-4 py-3 text-sm">
                <EntityLink
                  entityType="payment"
                  entityId={alloc.payment.id}
                  label={alloc.payment.payment_reference}
                  href={`/finance/payments/${alloc.payment.id}`}
                />
              </td>
              <td className="px-4 py-3 text-sm text-text-secondary">
                {methodLabelMap[alloc.payment.payment_method] ?? alloc.payment.payment_method}
              </td>
              <td className="px-4 py-3 text-end text-sm font-medium text-text-primary">
                <CurrencyDisplay amount={alloc.amount} currency_code={currencyCode} />
              </td>
              <td className="px-4 py-3 text-sm text-text-secondary">
                {formatDate(alloc.payment.received_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
