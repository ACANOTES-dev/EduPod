'use client';

import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { ANTI_BULLYING_CATEGORIES } from '@school/shared/regulatory';
import { cn } from '@school/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BullyingIncidentSummary {
  academic_year: string;
  total_incidents: number;
  by_category: Array<{
    category: string;
    count: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  by_month: Array<{
    month: string;
    count: number;
  }>;
  resolved: number;
  open: number;
}

interface BullyingIncidentSummaryProps {
  data: BullyingIncidentSummary | null;
  isLoading: boolean;
  locale: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCategoryName(category: string): string {
  return category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Skeleton Card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-border bg-surface p-4">
      <div className="h-3 w-2/3 rounded bg-surface-secondary" />
      <div className="mt-3 h-7 w-1/3 rounded bg-surface-secondary" />
      <div className="mt-2 h-3 w-1/4 rounded bg-surface-secondary" />
    </div>
  );
}

// ─── Trend Icon ───────────────────────────────────────────────────────────────

function TrendIcon({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') {
    return <TrendingUp className="h-3.5 w-3.5 text-danger-text" aria-label={t('trendingUp')} />;
  }
  if (trend === 'down') {
    return <TrendingDown className="h-3.5 w-3.5 text-success-text" aria-label={t('trendingDown')} />;
  }
  return <Minus className="h-3.5 w-3.5 text-text-tertiary" aria-label={t('stable')} />;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BullyingIncidentSummary({ data, isLoading, locale }: BullyingIncidentSummaryProps) {
  const t = useTranslations('regulatory');

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-text-primary">
          {t('antiBullying.breakdownTitle')}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ANTI_BULLYING_CATEGORIES.map((cat) => (
            <SkeletonCard key={cat} />
          ))}
        </div>
      </div>
    );
  }

  // ── Empty / error state ──
  if (!data) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="text-sm font-medium text-text-primary">{t('antiBullying.noDataTitle')}</p>
        <p className="mt-1 text-sm text-text-secondary">{t('antiBullying.noDataDescription')}</p>
        <div className="mt-4">
          <Link
            href={`/${locale}/behaviour`}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            {t('antiBullying.goToBehaviour')}
          </Link>
        </div>
      </div>
    );
  }

  // ── Build a lookup map from the API response ──
  const categoryMap = new Map<string, { count: number; trend: 'up' | 'down' | 'stable' }>();
  for (const item of data.by_category) {
    categoryMap.set(item.category, { count: item.count, trend: item.trend });
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-text-primary">
        {t('antiBullying.breakdownTitle')}
      </h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ANTI_BULLYING_CATEGORIES.map((category) => {
          const info = categoryMap.get(category);
          const count = info?.count ?? 0;
          const trend = info?.trend ?? 'stable';
          const hasIncidents = count > 0;

          return (
            <div
              key={category}
              className={cn(
                'flex flex-col gap-2 rounded-2xl border p-4 transition-colors',
                hasIncidents ? 'border-border bg-surface' : 'border-border/50 bg-surface/50',
              )}
            >
              <p
                className={cn(
                  'text-xs font-medium',
                  hasIncidents ? 'text-text-secondary' : 'text-text-tertiary',
                )}
              >
                {formatCategoryName(category)}
              </p>

              <div className="flex items-end justify-between gap-2">
                <span
                  className={cn(
                    'text-2xl font-semibold leading-tight',
                    hasIncidents ? 'text-text-primary' : 'text-text-tertiary',
                  )}
                >
                  {count}
                </span>

                {hasIncidents && (
                  <div className="flex items-center gap-1 pb-0.5">
                    <TrendIcon trend={trend} />
                    <span
                      className={cn(
                        'text-xs font-medium',
                        trend === 'up' && 'text-danger-text',
                        trend === 'down' && 'text-success-text',
                        trend === 'stable' && 'text-text-tertiary',
                      )}
                    >
                      {trend === 'up'
                        ? t('antiBullying.trendUp')
                        : trend === 'down'
                          ? t('antiBullying.trendDown')
                          : t('antiBullying.trendStable')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
