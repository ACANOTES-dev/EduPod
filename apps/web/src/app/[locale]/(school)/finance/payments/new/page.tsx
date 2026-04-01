'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { PaymentForm } from '../_components/payment-form';

import { PageHeader } from '@/components/page-header';

export default function NewPaymentPage() {
  const router = useRouter();

  const handleSuccess = (paymentId: string) => {
    router.push(`/finance/payments/${paymentId}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Record Payment" description="Record a manual payment from a household" />

      <div className="rounded-xl border border-border bg-surface p-6">
        <PaymentForm onSuccess={handleSuccess} />
      </div>
    </div>
  );
}
