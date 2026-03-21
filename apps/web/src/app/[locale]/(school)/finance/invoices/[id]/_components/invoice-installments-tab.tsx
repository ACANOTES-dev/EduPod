'use client';

import type { InvoiceStatus, InstallmentStatus } from '@school/shared';
import { Button, StatusBadge } from '@school/ui';
import { Plus } from 'lucide-react';
import * as React from 'react';


import { formatDate } from '@/lib/format-date';

import { CurrencyDisplay } from '../../../_components/currency-display';

import { InstallmentForm } from './installment-form';

interface Installment {
  id: string;
  due_date: string;
  amount: number;
  status: InstallmentStatus;
}

const installmentStatusVariantMap: Record<
  InstallmentStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  pending: 'warning',
  paid: 'success',
  overdue: 'danger',
};

const installmentStatusLabelMap: Record<InstallmentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  overdue: 'Overdue',
};

interface InvoiceInstallmentsTabProps {
  invoiceId: string;
  installments: Installment[];
  currencyCode: string;
  invoiceTotal: number;
  invoiceStatus: InvoiceStatus;
  onInstallmentsCreated: () => void;
}

export function InvoiceInstallmentsTab({
  invoiceId,
  installments,
  currencyCode,
  invoiceTotal,
  invoiceStatus,
  onInstallmentsCreated,
}: InvoiceInstallmentsTabProps) {
  const [showForm, setShowForm] = React.useState(false);

  const canCreateInstallments =
    installments.length === 0 &&
    ['draft', 'issued', 'partially_paid'].includes(invoiceStatus);

  return (
    <div className="space-y-4">
      {canCreateInstallments && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="me-2 h-4 w-4" />
            Create Installment Plan
          </Button>
        </div>
      )}

      {installments.length === 0 ? (
        <p className="text-sm text-text-tertiary">
          No installment plan for this invoice.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Due Date
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Amount
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {installments.map((inst) => (
                <tr
                  key={inst.id}
                  className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary"
                >
                  <td className="px-4 py-3 text-sm text-text-primary">
                    {formatDate(inst.due_date)}
                  </td>
                  <td className="px-4 py-3 text-end text-sm font-medium text-text-primary">
                    <CurrencyDisplay amount={inst.amount} currency_code={currencyCode} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={installmentStatusVariantMap[inst.status]} dot>
                      {installmentStatusLabelMap[inst.status]}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InstallmentForm
        open={showForm}
        onOpenChange={setShowForm}
        invoiceId={invoiceId}
        invoiceTotal={invoiceTotal}
        currencyCode={currencyCode}
        onSuccess={() => {
          setShowForm(false);
          onInstallmentsCreated();
        }}
      />
    </div>
  );
}
