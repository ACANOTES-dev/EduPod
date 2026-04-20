'use client';

import { ChevronRight, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { RiskProfileListItem } from '@/lib/early-warning';

import { RiskTierBadge } from './risk-tier-badge';
import { TrendSparkline } from './trend-sparkline';

interface AtRiskListProps {
  rows: RiskProfileListItem[];
  isLoading: boolean;
  onSelect: (row: RiskProfileListItem) => void;
  visibleRowLimit?: number;
}

const DEFAULT_VISIBLE_ROWS = 40;

/**
 * Renders a vertically scrollable list of flagged students. Windowing is a
 * simple "cap to N initially, click Show more to extend" pattern — adequate
 * for the 200-student scale the spec calls out, without pulling in
 * react-window as a new dependency.
 */
export function AtRiskList({
  rows,
  isLoading,
  onSelect,
  visibleRowLimit = DEFAULT_VISIBLE_ROWS,
}: AtRiskListProps) {
  const t = useTranslations('earlyWarningsHub.matrix');
  const [limit, setLimit] = React.useState(visibleRowLimit);

  React.useEffect(() => {
    setLimit(visibleRowLimit);
  }, [rows, visibleRowLimit]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-secondary" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-secondary/40 px-6 py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <User className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-medium text-text-primary">{t('emptyTitle')}</p>
        <p className="mt-1 text-xs text-text-tertiary">{t('emptyDescription')}</p>
      </div>
    );
  }

  const slice = rows.slice(0, limit);
  const remaining = rows.length - slice.length;

  return (
    <div className="space-y-2">
      <ul className="max-h-[640px] space-y-2 overflow-y-auto pe-1">
        {slice.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onSelect(row)}
              className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-start transition-all hover:-translate-y-px hover:border-primary-300 hover:shadow-sm"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-sm font-semibold text-text-secondary">
                {row.student_name
                  .split(' ')
                  .map((part) => part.charAt(0))
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || '—'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {row.student_name}
                  </p>
                  <RiskTierBadge tier={row.risk_tier} />
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-text-tertiary">
                  {row.year_group_name && <span className="truncate">{row.year_group_name}</span>}
                  {row.class_name && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{row.class_name}</span>
                    </>
                  )}
                  {row.top_signal && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{row.top_signal}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <TrendSparkline data={row.trend_data} width={48} height={18} />
                <span className="font-mono text-xs font-semibold text-text-secondary">
                  {row.composite_score.toFixed(0)}
                </span>
                <ChevronRight className="h-4 w-4 text-text-tertiary transition-colors group-hover:text-primary-600 rtl:rotate-180" />
              </div>
            </button>
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setLimit((prev) => prev + visibleRowLimit)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface-secondary"
          >
            {t('showMore', { count: remaining })}
          </button>
        </div>
      )}
    </div>
  );
}
