'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';

import { PaymentForm } from '../_components/payment-form';



export default function NewPaymentPage() {
  const t = useTranslations('finance');
  const router = useRouter();

  const handleSuccess = (paymentId: string) => {
    router.push(`/finance/payments/${paymentId}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('newPayment')} description="Record a manual payment from a household" />

      <div className="rounded-xl border border-border bg-surface p-6">
        <PaymentForm onSuccess={handleSuccess} />
      </div>
    </div>
  );
}
