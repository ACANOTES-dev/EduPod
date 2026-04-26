'use client';

import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@school/ui';

import { CurrencyDisplay } from '../../../../../_components/currency-display';

interface Props {
  runId: string;
  invoiceCount: number;
  totalAmount: number;
  currencyCode: string;
  locale: string;
  eventId: string;
}

export function GenerateFeesSuccessState({
  runId,
  invoiceCount,
  totalAmount,
  currencyCode,
  locale,
  eventId,
}: Props) {
  const t = useTranslations('financeBudgetingEventBudgets.generateFees');

  return (
    <section
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-10 text-center"
    >
      <CheckCircle2 className="h-12 w-12 text-emerald-600" aria-hidden="true" />
      <h2 className="text-xl font-semibold text-text-primary">{t('success.title')}</h2>
      <p className="text-sm text-text-secondary">
        {t('success.body', {
          count: invoiceCount,
          amount: '',
        })}
        <span dir="ltr" className="ms-1 font-mono">
          <CurrencyDisplay amount={totalAmount} currency_code={currencyCode} locale={locale} />
        </span>
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href={`/${locale}/finance/invoices?fee_generation_run_id=${runId}`}>
            {t('actions.viewInvoices')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/${locale}/finance/budgeting/events/${eventId}`}>
            {t('actions.backToEvent')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/${locale}/finance/budgeting`}>{t('actions.backToHub')}</Link>
        </Button>
      </div>
    </section>
  );
}
