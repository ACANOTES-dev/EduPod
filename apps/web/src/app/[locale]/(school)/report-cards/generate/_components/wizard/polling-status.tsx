'use client';

import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import type { GenerationRunSnapshot, RunStatus } from './types';

interface PollingStatusProps {
  status: RunStatus;
  snapshot: GenerationRunSnapshot | null;
  onViewLibrary: () => void;
  onStartAnother: () => void;
}

// ─── Terminal-state detection ────────────────────────────────────────────────

export const TERMINAL_RUN_STATUSES: RunStatus[] = ['completed', 'partial_success', 'failed'];

export function isTerminalStatus(status: RunStatus): boolean {
  return status !== null && TERMINAL_RUN_STATUSES.includes(status);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PollingStatus({
  status,
  snapshot,
  onViewLibrary,
  onStartAnother,
}: PollingStatusProps) {
  const t = useTranslations('reportCards.wizard');

  const done = snapshot?.students_generated_count ?? 0;
  const blocked = snapshot?.students_blocked_count ?? 0;
  const total = snapshot?.total_count ?? 0;
  const progressPercent = total > 0 ? Math.round((done / total) * 100) : 0;

  if (!isTerminalStatus(status)) {
    return (
      <div className="space-y-4 rounded-2xl border border-border bg-surface p-6">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
          <h3 className="text-base font-semibold text-text-primary">{t('runningTitle')}</h3>
        </div>

        <p className="text-sm text-text-secondary">
          {total > 0 ? t('runningProgress', { done, total }) : t('pollingTitle')}
        </p>

        {total > 0 ? (
          <div className="h-2 overflow-hidden rounded-full bg-surface-secondary">
            <div
              className="h-full rounded-full bg-primary-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        ) : null}
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="space-y-4 rounded-2xl border border-error/40 bg-error/5 p-6">
        <div className="flex items-center gap-3 text-error">
          <XCircle className="h-5 w-5" />
          <h3 className="text-base font-semibold">{t('runFailed')}</h3>
        </div>

        {snapshot && snapshot.errors.length > 0 ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-text-secondary">{t('runErrorList')}</summary>
            <ul className="mt-2 space-y-1">
              {snapshot.errors.map((err, i) => (
                <li key={i} className="text-xs text-text-tertiary">
                  {err.student_id}: {err.message}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <Button variant="outline" size="sm" onClick={onStartAnother}>
          {t('startAnother')}
        </Button>
      </div>
    );
  }

  // completed or partial_success
  const isPartial = status === 'partial_success' || blocked > 0;
  const borderClass = isPartial
    ? 'border-warning/40 bg-warning/5'
    : 'border-success/40 bg-success/5';
  const iconColourClass = isPartial ? 'text-warning' : 'text-success';

  return (
    <div className={`space-y-4 rounded-2xl border p-6 ${borderClass}`}>
      <div className={`flex items-center gap-3 ${iconColourClass}`}>
        {isPartial ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
        <h3 className="text-base font-semibold">
          {isPartial ? t('runPartial', { done, blocked }) : t('runCompleted', { count: done })}
        </h3>
      </div>

      {snapshot && snapshot.errors.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-text-secondary">{t('runErrorList')}</summary>
          <ul className="mt-2 space-y-1">
            {snapshot.errors.map((err, i) => (
              <li key={i} className="text-xs text-text-tertiary">
                {err.student_id}: {err.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={onViewLibrary}>{t('viewLibrary')}</Button>
        <Button variant="outline" onClick={onStartAnother}>
          {t('startAnother')}
        </Button>
      </div>
    </div>
  );
}
