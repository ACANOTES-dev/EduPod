'use client';

import { StatusBadge, cn } from '@school/ui';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

type ReadinessStatus = 'pass' | 'fail' | 'warning';

interface CategoryDetails {
  total: number;
  valid: number;
  issues: number;
}

interface ReadinessCategory {
  name: string;
  status: ReadinessStatus;
  message: string;
  details?: CategoryDetails;
}

interface OctoberReadinessResponse {
  status: ReadinessStatus;
  academic_year: string;
  total_students: number;
  categories: ReadinessCategory[];
}

interface ReadinessOverviewProps {
  data: OctoberReadinessResponse | null;
  isLoading: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const STATUS_ICON: Record<ReadinessStatus, React.ElementType> = {
  pass: CheckCircle2,
  warning: AlertTriangle,
  fail: XCircle,
};

const STATUS_COLOR: Record<ReadinessStatus, string> = {
  pass: 'text-success-text',
  warning: 'text-warning-text',
  fail: 'text-danger-text',
};

const STATUS_BADGE_VARIANT: Record<ReadinessStatus, 'success' | 'warning' | 'danger'> = {
  pass: 'success',
  warning: 'warning',
  fail: 'danger',
};

function statusLabel(status: ReadinessStatus): string {
  switch (status) {
    case 'pass':
      return 'Pass';
    case 'warning':
      return 'Warning';
    case 'fail':
      return 'Fail';
  }
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function CategoryCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-border bg-surface-primary p-5">
      <div className="flex items-start gap-3">
        <div className="h-5 w-5 rounded-full bg-border" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-32 rounded bg-border" />
          <div className="h-3 w-48 rounded bg-border" />
          <div className="h-2 w-full rounded bg-border" />
        </div>
      </div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ReadinessOverview({ data, isLoading }: ReadinessOverviewProps) {
  const t = useTranslations('regulatory');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-7 w-20 animate-pulse rounded bg-border" />
          <div className="h-5 w-16 animate-pulse rounded bg-border" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CategoryCardSkeleton />
          <CategoryCardSkeleton />
          <CategoryCardSkeleton />
          <CategoryCardSkeleton />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-text-secondary">
        {t('octoberReturns.noData')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Summary Row ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm font-medium text-text-secondary">
          {t('octoberReturns.totalStudents')}:{' '}
          <span className="text-lg font-semibold text-text-primary">
            {data.total_students}
          </span>
        </span>
        <StatusBadge status={STATUS_BADGE_VARIANT[data.status]} dot>
          {statusLabel(data.status)}
        </StatusBadge>
      </div>

      {/* ─── Category Cards ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.categories.map((category) => {
          const Icon = STATUS_ICON[category.status];
          const iconColor = STATUS_COLOR[category.status];
          const progressPct =
            category.details && category.details.total > 0
              ? Math.round((category.details.valid / category.details.total) * 100)
              : null;

          return (
            <div
              key={category.name}
              className="rounded-2xl border border-border bg-surface-primary p-5"
            >
              <div className="flex items-start gap-3">
                <Icon
                  className={cn('mt-0.5 h-5 w-5 shrink-0', iconColor)}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-text-primary">
                    {category.name}
                  </p>
                  <p className="mt-0.5 text-sm text-text-secondary">
                    {category.message}
                  </p>

                  {category.details && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-text-secondary">
                        <span>
                          {category.details.valid}/{category.details.total}{' '}
                          {t('octoberReturns.valid')}
                        </span>
                        {category.details.issues > 0 && (
                          <span className="text-danger-text">
                            {category.details.issues}{' '}
                            {t('octoberReturns.issues')}
                          </span>
                        )}
                      </div>
                      {progressPct !== null && (
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-500',
                              progressPct === 100
                                ? 'bg-success-text'
                                : progressPct >= 80
                                  ? 'bg-warning-text'
                                  : 'bg-danger-text',
                            )}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
