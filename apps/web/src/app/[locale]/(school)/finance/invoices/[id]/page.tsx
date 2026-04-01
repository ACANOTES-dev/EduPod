'use client';

import { useParams, usePathname } from 'next/navigation';
import * as React from 'react';

import type { InvoiceStatus } from '@school/shared';
import { Skeleton } from '@school/ui';


import { CurrencyDisplay } from '../../_components/currency-display';

import { InvoiceActions } from './_components/invoice-actions';
import { InvoiceInstallmentsTab } from './_components/invoice-installments-tab';
import { InvoiceLinesTab } from './_components/invoice-lines-tab';
import { InvoicePaymentsTab } from './_components/invoice-payments-tab';

import { EntityLink } from '@/components/entity-link';
import { RecordHub } from '@/components/record-hub';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

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

interface Installment {
  id: string;
  due_date: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue';
}

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  subtotal_amount: number;
  discount_amount: number;
  total_amount: number;
  balance_amount: number;
  due_date: string;
  issue_date: string | null;
  currency_code: string;
  write_off_reason: string | null;
  updated_at: string;
  household: {
    id: string;
    household_name: string;
  };
  lines: InvoiceLine[];
  payment_allocations: PaymentAllocation[];
  installments: Installment[];
  approval?: {
    id: string;
    status: string;
    requested_by_name: string | null;
    requested_at: string | null;
  } | null;
}

const invoiceStatusVariantMap: Record<
  InvoiceStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  draft: 'neutral',
  pending_approval: 'warning',
  issued: 'info',
  partially_paid: 'warning',
  paid: 'success',
  overdue: 'danger',
  void: 'neutral',
  cancelled: 'neutral',
  written_off: 'info',
};

const invoiceStatusLabelMap: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  issued: 'Issued',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
  cancelled: 'Cancelled',
  written_off: 'Written Off',
};

export default function InvoiceDetailPage() {
  const _params = useParams<{ id: string }>();
  const id = _params?.id ?? '';
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [invoice, setInvoice] = React.useState<InvoiceDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchInvoice = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: InvoiceDetail }>(`/api/v1/finance/invoices/${id}`);
      setInvoice(res.data);
    } catch (err) {
      // handled by empty state
      console.error('[setInvoice]', err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void fetchInvoice();
  }, [fetchInvoice]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex h-64 items-center justify-center text-text-tertiary">
        Invoice not found.
      </div>
    );
  }

  const metrics = [
    {
      label: 'Subtotal',
      value: (
        <CurrencyDisplay amount={invoice.subtotal_amount} currency_code={invoice.currency_code} />
      ),
    },
    {
      label: 'Discount',
      value: (
        <CurrencyDisplay
          amount={invoice.discount_amount}
          currency_code={invoice.currency_code}
          className="text-success-text"
        />
      ),
    },
    {
      label: 'Total',
      value: (
        <CurrencyDisplay
          amount={invoice.total_amount}
          currency_code={invoice.currency_code}
          className="font-bold"
        />
      ),
    },
    {
      label: 'Paid',
      value: (
        <CurrencyDisplay
          amount={invoice.total_amount - invoice.balance_amount}
          currency_code={invoice.currency_code}
          className="text-success-text"
        />
      ),
    },
    {
      label: 'Balance',
      value: (
        <CurrencyDisplay
          amount={invoice.balance_amount}
          currency_code={invoice.currency_code}
          className={
            invoice.balance_amount > 0 ? 'font-bold text-danger-text' : 'text-success-text'
          }
        />
      ),
    },
  ];

  const headerMetrics = [
    {
      label: 'Household',
      value: (
        <EntityLink
          entityType="household"
          entityId={invoice.household.id}
          label={invoice.household.household_name}
          href={`/${locale}/households/${invoice.household.id}`}
        />
      ),
    },
    {
      label: 'Issue Date',
      value: invoice.issue_date ? formatDate(invoice.issue_date) : '--',
    },
    {
      label: 'Due Date',
      value: formatDate(invoice.due_date),
    },
    ...metrics,
  ];

  const actions = <InvoiceActions invoice={invoice} onActionComplete={fetchInvoice} />;

  return (
    <RecordHub
      title={invoice.invoice_number}
      subtitle={invoice.household.household_name}
      status={{
        label: invoiceStatusLabelMap[invoice.status],
        variant: invoiceStatusVariantMap[invoice.status],
      }}
      reference={invoice.invoice_number}
      actions={actions}
      metrics={headerMetrics}
      tabs={[
        {
          key: 'lines',
          label: 'Lines',
          content: <InvoiceLinesTab lines={invoice.lines} currencyCode={invoice.currency_code} />,
        },
        {
          key: 'payments',
          label: 'Payments',
          content: (
            <InvoicePaymentsTab
              allocations={invoice.payment_allocations}
              currencyCode={invoice.currency_code}
            />
          ),
        },
        {
          key: 'installments',
          label: 'Installments',
          content: (
            <InvoiceInstallmentsTab
              invoiceId={invoice.id}
              installments={invoice.installments}
              currencyCode={invoice.currency_code}
              invoiceTotal={invoice.total_amount}
              invoiceStatus={invoice.status}
              onInstallmentsCreated={fetchInvoice}
            />
          ),
        },
      ]}
    >
      {/* Approval info for pending_approval */}
      {invoice.status === 'pending_approval' && invoice.approval && (
        <div className="rounded-xl border border-warning-border bg-warning-surface px-6 py-4">
          <p className="text-sm font-semibold text-warning-text">Pending Approval</p>
          <p className="mt-1 text-sm text-text-secondary">
            Requested by {invoice.approval.requested_by_name ?? 'Unknown'}{' '}
            {invoice.approval.requested_at ? `on ${formatDate(invoice.approval.requested_at)}` : ''}
          </p>
        </div>
      )}

      {/* Write-off reason */}
      {invoice.status === 'written_off' && invoice.write_off_reason && (
        <div className="rounded-xl border border-border bg-surface-secondary px-6 py-4">
          <p className="text-sm font-semibold text-text-primary">Write-off Reason</p>
          <p className="mt-1 text-sm text-text-secondary">{invoice.write_off_reason}</p>
        </div>
      )}
    </RecordHub>
  );
}
