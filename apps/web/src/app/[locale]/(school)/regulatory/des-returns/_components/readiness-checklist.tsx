'use client';

import { cn } from '@school/ui';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import * as React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReadinessCategory {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: { total: number; valid: number; issues: number };
}

interface ReadinessChecklistProps {
  categories: ReadinessCategory[];
  isLoading: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: 'pass' | 'fail' | 'warning' }) {
  if (status === 'pass') {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-success-600" aria-hidden="true" />;
  }
  if (status === 'warning') {
    return <AlertTriangle className="h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />;
  }
  return <XCircle className="h-5 w-5 shrink-0 text-danger-600" aria-hidden="true" />;
}

function statusRowBorder(status: 'pass' | 'fail' | 'warning') {
  switch (status) {
    case 'pass':
      return 'border-s-success-500';
    case 'warning':
      return 'border-s-warning-500';
    case 'fail':
      return 'border-s-danger-500';
  }
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ChecklistSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading readiness checklist">
      <div className="animate-pulse rounded-xl bg-surface-secondary p-4">
        <div className="h-4 w-40 rounded bg-border" />
      </div>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="animate-pulse rounded-xl border border-border bg-surface-primary p-4">
          <div className="flex items-start gap-3">
            <div className="h-5 w-5 shrink-0 rounded-full bg-border" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-36 rounded bg-border" />
              <div className="h-3 w-56 rounded bg-border" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReadinessChecklist({ categories, isLoading }: ReadinessChecklistProps) {
  if (isLoading) {
    return <ChecklistSkeleton />;
  }

  if (categories.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-secondary p-6 text-center text-sm text-text-secondary">
        No readiness data available.
      </div>
    );
  }

  // ─── Summary counts ─────────────────────────────────────────────────────────
  const passCount = categories.filter((c) => c.status === 'pass').length;
  const warnCount = categories.filter((c) => c.status === 'warning').length;
  const failCount = categories.filter((c) => c.status === 'fail').length;

  const overallStatus: 'pass' | 'fail' | 'warning' =
    failCount > 0 ? 'fail' : warnCount > 0 ? 'warning' : 'pass';

  const summaryBg = {
    pass: 'bg-success-50 border-success-200 text-success-800',
    warning: 'bg-warning-50 border-warning-200 text-warning-800',
    fail: 'bg-danger-50 border-danger-200 text-danger-800',
  }[overallStatus];

  const summaryLabel = {
    pass: 'All checks passed',
    warning: `${warnCount} warning${warnCount !== 1 ? 's' : ''} — review before submitting`,
    fail: `${failCount} check${failCount !== 1 ? 's' : ''} failed — action required`,
  }[overallStatus];

  return (
    <div className="space-y-3">
      {/* ─── Overall status banner ────────────────────────────────────────── */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium',
          summaryBg,
        )}
      >
        <StatusIcon status={overallStatus} />
        <span>{summaryLabel}</span>
        <span className="ms-auto flex gap-3 text-xs font-normal">
          {passCount > 0 && (
            <span className="text-success-700">{passCount} passed</span>
          )}
          {warnCount > 0 && (
            <span className="text-warning-700">{warnCount} warning{warnCount !== 1 ? 's' : ''}</span>
          )}
          {failCount > 0 && (
            <span className="text-danger-700">{failCount} failed</span>
          )}
        </span>
      </div>

      {/* ─── Category rows ────────────────────────────────────────────────── */}
      {categories.map((category, idx) => (
        <div
          key={idx}
          className={cn(
            'rounded-xl border border-s-4 border-border bg-surface-primary p-4',
            statusRowBorder(category.status),
          )}
        >
          <div className="flex items-start gap-3">
            <StatusIcon status={category.status} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">{category.name}</p>
              <p className="mt-0.5 text-sm text-text-secondary">{category.message}</p>

              {category.details && (
                <div className="mt-2 flex items-center gap-2">
                  {/* Progress bar */}
                  <div
                    className="h-1.5 w-32 overflow-hidden rounded-full bg-border"
                    aria-hidden="true"
                  >
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        category.status === 'pass'
                          ? 'bg-success-500'
                          : category.status === 'warning'
                            ? 'bg-warning-500'
                            : 'bg-danger-500',
                      )}
                      style={{
                        width:
                          category.details.total > 0
                            ? `${Math.round((category.details.valid / category.details.total) * 100)}%`
                            : '0%',
                      }}
                    />
                  </div>
                  <span className="text-xs text-text-secondary">
                    {category.details.valid} of {category.details.total} valid
                    {category.details.issues > 0 && (
                      <span className="ms-1 text-danger-600">
                        ({category.details.issues} issue{category.details.issues !== 1 ? 's' : ''})
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
