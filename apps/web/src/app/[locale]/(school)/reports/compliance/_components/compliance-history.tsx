'use client';

import { Calendar, FileWarning, RotateCw } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ComplianceHistoryEntry } from '@school/shared/reports';
import { Button } from '@school/ui';

interface ComplianceHistoryProps {
  history: ComplianceHistoryEntry[];
  loading: boolean;
  onLoad?: (entry: ComplianceHistoryEntry) => void;
}

export function ComplianceHistory({ history, loading, onLoad }: ComplianceHistoryProps) {
  const t = useTranslations('reports');

  return (
    <section className="space-y-3 print:hidden">
      <h3 className="text-base font-semibold text-text-primary">{t('compliance.historyTitle')}</h3>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      ) : history.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t('compliance.noHistory')}</p>
      ) : (
        <ul className="space-y-2">
          {history.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Calendar className="h-4 w-4 flex-shrink-0 text-text-tertiary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">
                    {new Date(entry.generated_at).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                    <span>{t('compliance.history.fieldCount', { count: entry.field_count })}</span>
                    {entry.gap_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-700">
                        <FileWarning className="h-3 w-3" />
                        {t('compliance.history.gapCount', { count: entry.gap_count })}
                      </span>
                    )}
                    <span>·</span>
                    <span className="font-mono">
                      {t('compliance.history.catalogueVersion', {
                        version: entry.catalogue_version,
                      })}
                    </span>
                  </p>
                </div>
              </div>
              {onLoad && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onLoad(entry)}
                  aria-label={t('compliance.history.reloadAria')}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
