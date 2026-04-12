'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { EntityLink } from '@/components/entity-link';
import { formatDate } from '@/lib/format-date';

import { CurrencyDisplay } from '../../../_components/currency-display';

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

const methodLabelKeyMap: Record<string, string> = {
  stripe: 'stripe',
  cash: 'cash',
  bank_transfer: 'bankTransfer',
  card_manual: 'cardManual',
};

interface InvoicePaymentsTabProps {
  allocations: PaymentAllocation[];
  currencyCode: string;
}

export function InvoicePaymentsTab({ allocations, currencyCode }: InvoicePaymentsTabProps) {
  const t = useTranslations('finance');
  const translateMethod = (method: string): string => {
    const key = methodLabelKeyMap[method];
    return key ? t(key) : method;
  };
  if (allocations.length === 0) {
    return <p className="text-sm text-text-tertiary">{t('noPaymentsAllocatedToThis')}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-surface-secondary">
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('paymentReference2')}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('method')}
            </th>
            <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('amountAllocated')}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('date')}
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
                {translateMethod(alloc.payment.payment_method)}
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
