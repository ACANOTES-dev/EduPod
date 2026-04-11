'use client';

import { AlertTriangle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

export default function PaymentCancelledPage() {
  const t = useTranslations('paymentResult');
  const searchParams = useSearchParams();
  const applicationId = searchParams?.get('application') ?? '';

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
        </div>

        <h1 className="text-2xl font-semibold text-text-primary">{t('cancelledTitle')}</h1>

        <p className="mt-3 text-sm leading-relaxed text-text-secondary">{t('cancelledBody')}</p>

        {applicationId && (
          <div className="mt-6 rounded-xl border border-border bg-surface p-4">
            <p className="text-xs text-text-tertiary">{t('applicationReference')}</p>
            <p className="mt-1 font-mono text-sm font-medium text-text-primary">
              {applicationId.slice(0, 8).toUpperCase()}
            </p>
          </div>
        )}

        <p className="mt-6 text-xs text-text-tertiary">{t('cancelledHelp')}</p>
      </div>
    </div>
  );
}
