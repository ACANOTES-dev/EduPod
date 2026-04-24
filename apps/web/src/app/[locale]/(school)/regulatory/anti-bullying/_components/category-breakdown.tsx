'use client';

import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { ANTI_BULLYING_CATEGORIES } from '@school/shared/regulatory';
import { cn } from '@school/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CategoryBreakdownEntry {
  category: string;
  count: number;
  trend: 'up' | 'down' | 'stable';
}

interface CategoryBreakdownProps {
  entries: CategoryBreakdownEntry[];
  isLoading: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categoryKey(raw: string): string {
  return raw
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCell() {
  return (
    <div className="animate-pulse rounded-2xl border border-border bg-surface p-4">
      <div className="h-3 w-2/3 rounded bg-surface-secondary" />
      <div className="mt-3 h-7 w-1/3 rounded bg-surface-secondary" />
    </div>
  );
}

function TrendIcon({ trend, label }: { trend: 'up' | 'down' | 'stable'; label: string }) {
  if (trend === 'up') return <TrendingUp className="h-3.5 w-3.5 text-danger-text" aria-label={label} />;
  if (trend === 'down') return <TrendingDown className="h-3.5 w-3.5 text-success-text" aria-label={label} />;
  return <Minus className="h-3.5 w-3.5 text-text-tertiary" aria-label={label} />;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CategoryBreakdown({ entries, isLoading }: CategoryBreakdownProps) {
  const t = useTranslations('regulatory.antiBullying');

  const entryMap = React.useMemo(() => {
    const map = new Map<string, CategoryBreakdownEntry>();
    for (const e of entries) map.set(e.category, e);
    return map;
  }, [entries]);

  const maxCount = React.useMemo(
    () => Math.max(1, ...entries.map((e) => e.count)),
    [entries],
  );

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-base font-semibold text-text-primary">{t('breakdownTitle')}</h2>
      <p className="mt-1 text-xs text-text-secondary">{t('breakdownDescription')}</p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? ANTI_BULLYING_CATEGORIES.map((c) => <SkeletonCell key={c} />)
          : ANTI_BULLYING_CATEGORIES.map((category) => {
              const entry = entryMap.get(category);
              const count = entry?.count ?? 0;
              const trend = entry?.trend ?? 'stable';
              const hasIncidents = count > 0;
              const widthPct = Math.round((count / maxCount) * 100);

              return (
                <div
                  key={category}
                  className={cn(
                    'flex min-w-0 flex-col gap-2 rounded-2xl border p-4 transition-colors',
                    hasIncidents ? 'border-border bg-surface' : 'border-border/50 bg-surface/40',
                  )}
                >
                  <p
                    className={cn(
                      'text-xs font-medium',
                      hasIncidents ? 'text-text-secondary' : 'text-text-tertiary',
                    )}
                  >
                    {categoryKey(category)}
                  </p>

                  <div className="flex items-end justify-between gap-2">
                    <span
                      className={cn(
                        'text-2xl font-semibold leading-tight tabular-nums',
                        hasIncidents ? 'text-text-primary' : 'text-text-tertiary',
                      )}
                    >
                      {count}
                    </span>
                    {hasIncidents && (
                      <div className="flex items-center gap-1 pb-0.5">
                        <TrendIcon
                          trend={trend}
                          label={
                            trend === 'up'
                              ? t('trendUp')
                              : trend === 'down'
                                ? t('trendDown')
                                : t('trendStable')
                          }
                        />
                        <span
                          className={cn(
                            'text-xs font-medium',
                            trend === 'up' && 'text-danger-text',
                            trend === 'down' && 'text-success-text',
                            trend === 'stable' && 'text-text-tertiary',
                          )}
                        >
                          {trend === 'up'
                            ? t('trendUp')
                            : trend === 'down'
                              ? t('trendDown')
                              : t('trendStable')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div
                    className="h-1 rounded-full bg-surface-secondary"
                    role="presentation"
                    aria-hidden="true"
                  >
                    <div
                      className={cn(
                        'h-1 rounded-full transition-all',
                        hasIncidents ? 'bg-danger-500' : 'bg-transparent',
                      )}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}
