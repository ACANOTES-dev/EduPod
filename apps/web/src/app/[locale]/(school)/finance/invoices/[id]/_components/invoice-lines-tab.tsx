'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { CurrencyDisplay } from '../../../_components/currency-display';

interface InvoiceLine {
  id: string;
  description: string;
  quantity: number;
  unit_amount: number;
  line_total: number;
  student_id: string | null;
  student_name: string | null;
  fee_structure_id: string | null;
  fee_structure_name: string | null;
}

interface InvoiceLinesTabProps {
  lines: InvoiceLine[];
  currencyCode: string;
}

export function InvoiceLinesTab({ lines, currencyCode }: InvoiceLinesTabProps) {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  if (lines.length === 0) {
    return (
      <p className="text-sm text-text-tertiary">{t('noInvoiceLines')}</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-surface-secondary">
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">{t('description')}</th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">{tCommon('student')}</th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">{t('feeStructure')}</th>
            <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">{t('qty')}</th>
            <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">{t('unitAmount')}</th>
            <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">{t('lineTotal')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr
              key={line.id}
              className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary"
            >
              <td className="px-4 py-3 text-sm text-text-primary">
                {line.description}
              </td>
              <td className="px-4 py-3 text-sm text-text-secondary">
                {line.student_name ?? '--'}
              </td>
              <td className="px-4 py-3 text-sm text-text-secondary">
                {line.fee_structure_name ?? '--'}
              </td>
              <td className="px-4 py-3 text-end text-sm text-text-primary">
                {line.quantity}
              </td>
              <td className="px-4 py-3 text-end text-sm text-text-primary">
                <CurrencyDisplay amount={line.unit_amount} currency_code={currencyCode} />
              </td>
              <td className="px-4 py-3 text-end text-sm font-medium text-text-primary">
                <CurrencyDisplay amount={line.line_total} currency_code={currencyCode} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
