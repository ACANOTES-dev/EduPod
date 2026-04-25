'use client';

import { Calendar, RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { BoardReportHistoryEntry } from '@school/shared/reports';
import { Button } from '@school/ui';

interface BoardReportHistoryProps {
  history: BoardReportHistoryEntry[];
  loading: boolean;
  onLoad: (entry: BoardReportHistoryEntry) => void;
}

export function BoardReportHistory({ history, loading, onLoad }: BoardReportHistoryProps) {
  const t = useTranslations('reports');

  if (loading) {
    return (
      <section className="space-y-3" data-testid="board-history">
        <h3 className="text-base font-semibold text-text-primary">{t('board.historyTitle')}</h3>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-secondary" />
        ))}
      </section>
    );
  }

  if (history.length === 0) {
    return (
      <section className="space-y-3" data-testid="board-history">
        <h3 className="text-base font-semibold text-text-primary">{t('board.historyTitle')}</h3>
        <p className="text-sm text-text-tertiary">{t('board.noHistory')}</p>
      </section>
    );
  }

  return (
    <section className="space-y-3" data-testid="board-history">
      <h3 className="text-base font-semibold text-text-primary">{t('board.historyTitle')}</h3>
      <ul className="space-y-2">
        {history.map((entry) => (
          <li
            key={entry.id}
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Calendar className="h-4 w-4 flex-shrink-0 text-text-tertiary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {entry.term_label}
                  {entry.academic_year_name && ` · ${entry.academic_year_name}`}
                </p>
                <p className="text-xs text-text-tertiary">
                  {new Date(entry.generated_at).toLocaleDateString()}
                  {entry.generated_by_display_name && ` · ${entry.generated_by_display_name}`}
                  {entry.anonymise && ` · ${t('board.anonymisedBadge')}`}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onLoad(entry)}
              aria-label={t('board.history.reloadAria')}
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
