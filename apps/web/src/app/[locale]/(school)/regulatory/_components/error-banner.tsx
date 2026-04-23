'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import * as React from 'react';

// ─── Error Banner ───────────────────────────────────────────────────────────

interface ErrorBannerProps {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

export function ErrorBanner({ message, retryLabel, onRetry }: ErrorBannerProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 self-start rounded-lg border border-danger-300 bg-surface px-3 py-1.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50 sm:self-auto"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {retryLabel}
      </button>
    </div>
  );
}
