'use client';

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
  if (lines.length === 0) {
    return (
      <p className="text-sm text-text-tertiary">No invoice lines.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-surface-secondary">
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Description
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Student
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Fee Structure
            </th>
            <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Qty
            </th>
            <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Unit Amount
            </th>
            <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              Line Total
            </th>
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
