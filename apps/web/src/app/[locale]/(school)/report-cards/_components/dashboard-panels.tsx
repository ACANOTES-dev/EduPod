'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button } from '@school/ui';

// ─── Shared types ────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  period_id: string | null;
  total: number;
  published: number;
  draft: number;
  revised: number;
  pending_approval: number;
  completion_rate: number;
  comment_fill_rate: number;
}

export interface GenerationRunRow {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  total_count: number;
  completed_count: number;
  students_generated_count: number | null;
  students_blocked_count: number | null;
  academic_period_id: string | null;
  academic_year_id: string;
  created_at: string;
}

// ─── Quick action tile ───────────────────────────────────────────────────────

export function QuickActionTile({
  icon: Icon,
  title,
  description,
  actionLabel,
  accent,
  iconBg,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  accent: string;
  iconBg: string;
  badge?: number | null;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-2xl border border-border bg-surface p-5 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`}
      />
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-5 w-5" />
        </div>
        {badge != null && (
          <Badge variant="default" className="bg-rose-600 text-white hover:bg-rose-600">
            {badge}
          </Badge>
        )}
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <p className="text-xs leading-relaxed text-text-tertiary">{description}</p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 group-hover:text-primary-700">
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

// Reference to the generic imported icon so the IDE doesn't flag the type-only
// `Sparkles` dependency. The icon is exported for the page's convenience.
export const DefaultTileIcon: LucideIcon = Sparkles;

// ─── Live run status panel ───────────────────────────────────────────────────

export function LiveRunStatusPanel({
  run,
  locale,
}: {
  run: GenerationRunRow | null;
  locale: string;
}) {
  const t = useTranslations('reportCards');
  const router = useRouter();

  if (!run) {
    return (
      <div className="flex min-h-[11rem] flex-col justify-between rounded-2xl border border-dashed border-border bg-surface-secondary/40 p-5">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            {t('dashboard.liveRunHeading')}
          </h3>
          <p className="mt-1 text-xs text-text-tertiary">{t('dashboard.liveRunEmpty')}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => router.push(`/${locale}/report-cards/generate`)}
        >
          {t('dashboard.liveRunEmptyCta')}
          <ArrowRight className="ms-1 h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  const total = run.total_count || 1;
  const done = run.completed_count ?? 0;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="flex min-h-[11rem] flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            {t('dashboard.liveRunHeading')}
          </h3>
          <Badge variant="secondary">{t(`dashboard.runStatus.${run.status}`)}</Badge>
        </div>
        <p className="text-xs text-text-tertiary">
          {t('dashboard.liveRunProgress', { done, total })}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-600 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-primary">{pct}%</span>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => router.push(`/${locale}/report-cards/library`)}
          >
            {t('dashboard.liveRunViewLibrary')}
            <ArrowRight className="ms-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Analytics snapshot panel ────────────────────────────────────────────────

export function AnalyticsSnapshotPanel({
  analytics,
  loading,
  locale,
  periodId,
}: {
  analytics: AnalyticsSummary | null;
  loading: boolean;
  locale: string;
  /** Current period scope — forwarded to the full analytics page as a query
   *  param so the two surfaces stay in sync. Can be a UUID or `'full_year'`.
   */
  periodId: string | null;
}) {
  const t = useTranslations('reportCards');
  const router = useRouter();

  const items: Array<{ label: string; value: string }> = analytics
    ? [
        {
          label: t('dashboard.analyticsTotal'),
          value: String(analytics.total ?? 0),
        },
        {
          label: t('dashboard.analyticsPublished'),
          value: String(analytics.published ?? 0),
        },
        {
          label: t('dashboard.analyticsCompletion'),
          value: `${(analytics.completion_rate ?? 0).toFixed(1)}%`,
        },
        {
          label: t('dashboard.analyticsCommentFill'),
          value: `${(analytics.comment_fill_rate ?? 0).toFixed(1)}%`,
        },
      ]
    : [];

  return (
    <div className="flex min-h-[11rem] flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">
          {t('dashboard.analyticsHeading')}
        </h3>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0 text-xs"
          onClick={() => {
            const qs = periodId ? `?academic_period_id=${periodId}` : '';
            router.push(`/${locale}/report-cards/analytics${qs}`);
          }}
        >
          {t('dashboard.analyticsSeeFull')}
          <ArrowRight className="ms-1 h-3.5 w-3.5" />
        </Button>
      </div>

      {loading ? (
        <div className="mt-4 grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : !analytics ? (
        <div className="mt-4 flex flex-1 items-center justify-center text-xs text-text-tertiary">
          {t('dashboard.analyticsEmpty')}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4">
          {items.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-border/60 bg-surface-secondary/40 p-3"
            >
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                {item.label}
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-text-primary">{item.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
