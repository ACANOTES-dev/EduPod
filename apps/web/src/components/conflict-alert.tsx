'use client';

import { AlertTriangle, XOctagon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Conflict {
  type: 'hard' | 'soft';
  message: string;
}

interface ConflictAlertProps {
  conflicts: Conflict[];
  onOverride?: () => void;
  canOverride: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConflictAlert({ conflicts, onOverride, canOverride }: ConflictAlertProps) {
  const t = useTranslations('scheduling');

  const hardConflicts = conflicts.filter((c) => c.type === 'hard');
  const softConflicts = conflicts.filter((c) => c.type === 'soft');

  if (conflicts.length === 0) return null;

  return (
    <div className="space-y-3">
      {hardConflicts.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
          <div className="flex items-start gap-3">
            <XOctagon className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                {t('hardConflict')}
              </p>
              <ul className="space-y-1">
                {hardConflicts.map((conflict, i) => (
                  <li key={i} className="text-sm text-red-700 dark:text-red-400">
                    {conflict.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {softConflicts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {t('softConflict')}
              </p>
              <ul className="space-y-1">
                {softConflicts.map((conflict, i) => (
                  <li key={i} className="text-sm text-amber-700 dark:text-amber-400">
                    {conflict.message}
                  </li>
                ))}
              </ul>
              {canOverride && onOverride && (
                <Button variant="outline" size="sm" onClick={onOverride} className="mt-2">
                  {t('override')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
