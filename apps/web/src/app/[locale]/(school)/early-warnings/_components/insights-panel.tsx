'use client';

import { RefreshCw, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { InsightSummary } from './compute-insights';

interface InsightsPanelProps {
  insights: InsightSummary | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export function InsightsPanel({ insights, isLoading, onRefresh }: InsightsPanelProps) {
  const t = useTranslations('earlyWarningsHub.insights');

  const hasContent = insights && insights.flagged_total > 0 && insights.themes.length > 0;

  return (
    <section
      aria-labelledby="early-warnings-insights-heading"
      className="relative overflow-hidden rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50/80 via-surface to-rose-50/30 p-6 shadow-sm"
    >
      <div className="pointer-events-none absolute -top-20 end-[-6rem] h-56 w-56 rounded-full bg-amber-200/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 start-[-4rem] h-48 w-48 rounded-full bg-rose-200/30 blur-3xl" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 text-white shadow-md">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2
              id="early-warnings-insights-heading"
              className="text-lg font-semibold tracking-tight text-text-primary"
            >
              {t('title')}
            </h2>
            <p className="mt-0.5 text-sm text-text-secondary">{t('description')}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-secondary shadow-sm transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </button>
      </div>

      <div className="relative mt-5">
        {isLoading && !insights && (
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-border/50" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-border/50" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-border/50" />
          </div>
        )}

        {!isLoading && !hasContent && (
          <p className="text-sm italic leading-relaxed text-text-secondary">{t('empty')}</p>
        )}

        {insights && hasContent && (
          <div className="space-y-3 text-[15px] leading-relaxed text-text-primary">
            <p>
              {t('summary', {
                flagged: insights.flagged_total,
                red: insights.red_total,
                amber: insights.amber_total,
              })}
            </p>
            <ul className="space-y-2">
              {insights.themes.map((theme) => (
                <li key={theme.key} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                  />
                  <span className="italic">{t(`themes.${theme.key}`, theme.params)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
