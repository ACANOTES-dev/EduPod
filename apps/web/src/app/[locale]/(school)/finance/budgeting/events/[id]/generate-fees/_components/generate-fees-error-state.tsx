'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@school/ui';

import { isKnownErrorCode, type KnownErrorCode } from './generate-fees-types';

interface Props {
  code: string;
  message: string;
  recoverable: boolean;
  eventId: string;
  locale: string;
  onRetry: () => void;
}

export function GenerateFeesErrorState({
  code,
  message,
  recoverable,
  eventId,
  locale,
  onRetry,
}: Props) {
  const t = useTranslations('financeBudgetingEventBudgets.generateFees');
  const tErrors = useTranslations('financeBudgetingEventBudgets.generateFees.errors');

  const knownCode: KnownErrorCode = isKnownErrorCode(code) ? code : 'UNKNOWN_ERROR';
  const title = tErrors(`${knownCode}.title`);
  const body = tErrors(`${knownCode}.body`);

  return (
    <section
      role="alert"
      className="flex flex-col items-center gap-4 rounded-3xl border border-amber-200 bg-amber-50 p-10 text-center"
    >
      <AlertTriangle className="h-12 w-12 text-amber-600" aria-hidden="true" />
      <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
      <p className="text-sm text-text-secondary">{body}</p>
      {message && message !== body && <p className="text-xs text-text-tertiary">{message}</p>}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {recoverable && (
          <Button type="button" onClick={onRetry}>
            {t('actions.tryAgain')}
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href={`/${locale}/finance/budgeting/events/${eventId}`}>
            {t('actions.backToEvent')}
          </Link>
        </Button>
      </div>
    </section>
  );
}
