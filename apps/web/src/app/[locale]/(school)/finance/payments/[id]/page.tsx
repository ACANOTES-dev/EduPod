'use client';

import { FileText } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { PaymentStatus, PaymentMethod, RefundStatus } from '@school/shared';
import { Button, Skeleton } from '@school/ui';

import { CurrencyDisplay } from '../../_components/currency-display';
import { PdfPreviewModal } from '../../_components/pdf-preview-modal';
import { RefundStatusBadge } from '../../_components/refund-status-badge';
import { AllocationPanel } from '../_components/allocation-panel';

import { EntityLink } from '@/components/entity-link';
import { RecordHub } from '@/components/record-hub';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';


interface Allocation {
  id: string;
  amount?: number;
  allocated_amount?: number;
  created_at: string;
  invoice: {
    id: string;
    invoice_number: string;
    due_date?: string;
    total_amount: number;
    balance_amount: number;
  };
}

interface Refund {
  id: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  created_at: string;
}

interface PaymentDetail {
  id: string;
  payment_reference: string;
  amount: number;
  payment_method: PaymentMethod;
  status: PaymentStatus;
  received_at: string;
  reason: string | null;
  currency_code: string;
  created_at: string;
  household: {
    id: string;
    household_name: string;
  };
  posted_by: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  allocations: Allocation[];
  refunds: Refund[];
  // Computed on frontend
  allocated_amount: number;
  unallocated_amount: number;
}

const paymentStatusVariantMap: Record<
  PaymentStatus,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  pending: 'warning',
  posted: 'success',
  failed: 'danger',
  voided: 'neutral',
  refunded_partial: 'info',
  refunded_full: 'info',
};

const paymentStatusLabelMap: Record<PaymentStatus, string> = {
  pending: 'Pending',
  posted: 'Posted',
  failed: 'Failed',
  voided: 'Voided',
  refunded_partial: 'Partially Refunded',
  refunded_full: 'Fully Refunded',
};

const methodLabelMap: Record<PaymentMethod, string> = {
  stripe: 'Stripe',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  card_manual: 'Card (Manual)',
};

export default function PaymentDetailPage() {
  const t = useTranslations('finance');
  const _params = useParams<{ id: string }>();
  const id = _params?.id ?? '';

  const [payment, setPayment] = React.useState<PaymentDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showReceiptPdf, setShowReceiptPdf] = React.useState(false);

  const fetchPayment = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: PaymentDetail }>(`/api/v1/finance/payments/${id}`);
      const p = res.data;
      const allocatedAmt = (p.allocations ?? []).reduce(
        (sum: number, a: Allocation) => sum + (a.allocated_amount ?? a.amount ?? 0),
        0,
      );
      setPayment({
        ...p,
        allocated_amount: allocatedAmt,
        unallocated_amount: (p.amount ?? 0) - allocatedAmt,
      });
    } catch (err) {
      console.error('[fetchPayment]', err);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void fetchPayment();
  }, [fetchPayment]);

  // Receipt PDF is now handled by PdfPreviewModal

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="flex h-64 items-center justify-center text-text-tertiary">
        Payment not found.
      </div>
    );
  }

  const isAllocated = payment.allocations.length > 0;
  const canAllocate =
    payment.unallocated_amount > 0 && ['pending', 'posted'].includes(payment.status);

  const metrics = [
    {
      label: 'Household',
      value: (
        <EntityLink
          entityType="household"
          entityId={payment.household.id}
          label={payment.household.household_name}
          href={`/households/${payment.household.id}`}
        />
      ),
    },
    {
      label: 'Amount',
      value: (
        <CurrencyDisplay
          amount={payment.amount}
          currency_code={payment.currency_code}
          className="font-bold"
        />
      ),
    },
    {
      label: 'Method',
      value: methodLabelMap[payment.payment_method],
    },
    {
      label: 'Received',
      value: formatDateTime(payment.received_at),
    },
    {
      label: 'Allocated',
      value: (
        <CurrencyDisplay
          amount={payment.allocated_amount}
          currency_code={payment.currency_code}
          className="text-success-text"
        />
      ),
    },
    {
      label: 'Unallocated',
      value: (
        <CurrencyDisplay
          amount={payment.unallocated_amount}
          currency_code={payment.currency_code}
          className={payment.unallocated_amount > 0 ? 'text-warning-text' : ''}
        />
      ),
    },
    {
      label: t('acceptedBy'),
      value: payment.posted_by
        ? `${payment.posted_by.first_name} ${payment.posted_by.last_name}`
        : '—',
    },
  ];

  const actions = (
    <>
      <Button variant="outline" onClick={() => setShowReceiptPdf(true)}>
        <FileText className="me-2 h-4 w-4" />
        {t('receiptPdf')}
      </Button>
      <PdfPreviewModal
        open={showReceiptPdf}
        onOpenChange={setShowReceiptPdf}
        title={t('receiptPdf')}
        pdfUrl={`/api/v1/finance/payments/${id}/receipt/pdf`}
      />
    </>
  );

  // Allocations tab content
  const allocationsContent = (
    <div className="space-y-6">
      {isAllocated && (
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
                  Invoice Total
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Allocated
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {payment.allocations.map((alloc) => (
                <tr
                  key={alloc.id}
                  className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary"
                >
                  <td className="px-4 py-3 text-sm">
                    <EntityLink
                      entityType="invoice"
                      entityId={alloc.invoice.id}
                      label={alloc.invoice.invoice_number}
                      href={`/finance/invoices/${alloc.invoice.id}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {formatDate(alloc.invoice.due_date)}
                  </td>
                  <td className="px-4 py-3 text-end text-sm text-text-secondary">
                    <CurrencyDisplay
                      amount={alloc.invoice.total_amount}
                      currency_code={payment.currency_code}
                    />
                  </td>
                  <td className="px-4 py-3 text-end text-sm font-medium text-text-primary">
                    <CurrencyDisplay
                      amount={alloc.allocated_amount ?? alloc.amount ?? 0}
                      currency_code={payment.currency_code}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {formatDate(alloc.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canAllocate && (
        <AllocationPanel
          paymentId={payment.id}
          paymentAmount={payment.unallocated_amount}
          currencyCode={payment.currency_code}
          onAllocationComplete={fetchPayment}
        />
      )}

      {!isAllocated && !canAllocate && (
        <p className="text-sm text-text-tertiary">No allocations for this payment.</p>
      )}
    </div>
  );

  // Refunds tab content
  const refundsContent = (
    <div>
      {payment.refunds.length === 0 ? (
        <p className="text-sm text-text-tertiary">No refunds for this payment.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-secondary">
                <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Amount
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Reason
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Status
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Date
                </th>
              </tr>
            </thead>
            <tbody>
              {payment.refunds.map((refund) => (
                <tr
                  key={refund.id}
                  className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary"
                >
                  <td className="px-4 py-3 text-end text-sm font-medium text-text-primary">
                    <CurrencyDisplay amount={refund.amount} currency_code={payment.currency_code} />
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{refund.reason}</td>
                  <td className="px-4 py-3">
                    <RefundStatusBadge status={refund.status} />
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {formatDate(refund.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <RecordHub
      title={payment.payment_reference}
      subtitle={payment.household.household_name}
      status={{
        label: paymentStatusLabelMap[payment.status],
        variant: paymentStatusVariantMap[payment.status],
      }}
      reference={payment.payment_reference}
      actions={actions}
      metrics={metrics}
      tabs={[
        { key: 'allocations', label: 'Allocations', content: allocationsContent },
        { key: 'refunds', label: 'Refunds', content: refundsContent },
      ]}
    >
      {/* Reason note */}
      {payment.reason && (
        <div className="rounded-xl border border-border bg-surface-secondary px-6 py-4">
          <p className="text-sm font-semibold text-text-primary">Payment Note</p>
          <p className="mt-1 text-sm text-text-secondary">{payment.reason}</p>
        </div>
      )}
    </RecordHub>
  );
}
