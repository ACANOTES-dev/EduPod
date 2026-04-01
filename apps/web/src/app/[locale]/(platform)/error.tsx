'use client';

import { AlertTriangle } from 'lucide-react';
import * as React from 'react';

import { Button } from '@school/ui';

// Platform admin is English-only — no useTranslations needed.

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PlatformError({ error, reset }: ErrorProps) {
  React.useEffect(() => {
    console.error('[PlatformError]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger-fill text-danger-text">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h1 className="mb-2 text-xl font-semibold text-text-primary">Something went wrong</h1>
      <p className="mb-6 max-w-sm text-sm text-text-secondary">
        An unexpected error occurred. You can try again or return to the dashboard.
      </p>
      <Button onClick={reset} variant="secondary" size="sm">
        Try again
      </Button>
    </div>
  );
}
