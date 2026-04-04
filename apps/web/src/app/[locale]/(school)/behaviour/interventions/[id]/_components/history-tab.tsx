'use client';

import { useTranslations } from 'next-intl';

import { formatDateTime } from '@/lib/format-date';

import type { HistoryEntry } from './intervention-types';



// ─── Props ───────────────────────────────────────────────────────────────────

interface HistoryTabProps {
  history: HistoryEntry[];
  historyLoading: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function HistoryTab({ history, historyLoading }: HistoryTabProps) {
  const t = useTranslations('behaviour.interventionDetail');

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">{t('sections.history')}</h3>

      {historyLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-surface-secondary" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-tertiary">{t('noHistory')}</p>
      ) : (
        <div className="relative space-y-4 ps-6">
          {/* Timeline line */}
          <div className="absolute start-2 top-1 h-full w-px bg-border" />
          {history.map((entry) => (
            <div key={entry.id} className="relative">
              <div className="absolute -start-[17px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary-500 bg-surface" />
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium capitalize text-text-primary">
                    {entry.action.replace(/_/g, ' ')}
                  </span>
                  {entry.performed_by_user && (
                    <span className="text-xs text-text-tertiary">{t('by')}{entry.performed_by_user.first_name} {entry.performed_by_user.last_name}
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-tertiary">{formatDateTime(entry.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
