'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SchoolError({ error, reset }: ErrorProps) {
  const t = useTranslations('common');

  React.useEffect(() => {
    console.error('[SchoolError]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-fill text-danger-text">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h1 className="mb-2 text-xl font-semibold text-text-primary">{t('errorBoundaryTitle')}</h1>
      <p className="mb-6 max-w-sm text-sm text-text-secondary">{t('errorBoundaryDescription')}</p>
      <Button onClick={reset} variant="secondary" size="sm">
        {t('errorBoundaryRetry')}
      </Button>
    </div>
  );
}
