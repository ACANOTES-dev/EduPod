'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AuthError({ error, reset }: ErrorProps) {
  const t = useTranslations('common');

  React.useEffect(() => {
    console.error('[AuthError]', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface p-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger-fill text-danger-text">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-text-primary">{t('errorBoundaryTitle')}</h2>
        <p className="text-sm text-text-secondary">{t('errorBoundaryDescription')}</p>
      </div>
      <Button onClick={reset} variant="secondary" size="sm">
        {t('errorBoundaryRetry')}
      </Button>
    </div>
  );
}
