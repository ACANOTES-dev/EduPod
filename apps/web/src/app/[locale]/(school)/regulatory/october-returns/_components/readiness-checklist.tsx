'use client';

import { AlertTriangle, ArrowRight, CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { StatusBadge, cn } from '@school/ui';

import { fixLinkForField, isKnownField } from './issue-to-fix-link';

// ─── Types ───────────────────────────────────────────────────────────────────

type ReadinessStatus = 'pass' | 'fail' | 'warning' | 'not_applicable';

export interface OctoberReadinessCategory {
  field: string;
  label: string;
  required: boolean;
  status: ReadinessStatus;
  message: string;
  count?: number;
}

export interface OctoberReadinessResponse {
  ready: boolean;
  academic_year: string;
  student_count: number;
  categories: OctoberReadinessCategory[];
}

interface ReadinessChecklistProps {
  readiness: OctoberReadinessResponse | null;
  isLoading: boolean;
}

// ─── Status visuals ─────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: ReadinessStatus }) {
  if (status === 'pass') {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600" aria-hidden="true" />;
  }
  if (status === 'warning') {
    return <AlertTriangle className="h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />;
  }
  if (status === 'not_applicable') {
    return <MinusCircle className="h-5 w-5 shrink-0 text-text-tertiary" aria-hidden="true" />;
  }
  return <XCircle className="h-5 w-5 shrink-0 text-danger-600" aria-hidden="true" />;
}

function statusBadgeVariant(status: ReadinessStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'pass':
      return 'success';
    case 'warning':
      return 'warning';
    case 'fail':
      return 'danger';
    case 'not_applicable':
      return 'neutral';
  }
}

function rowTone(status: ReadinessStatus) {
  switch (status) {
    case 'pass':
      return 'border-border';
    case 'warning':
      return 'border-warning-200';
    case 'fail':
      return 'border-danger-200';
    case 'not_applicable':
      return 'border-border';
  }
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function ChecklistSkeleton() {
  const t = useTranslations('regulatory.octoberReturns');
  return (
    <div
      className="space-y-2 rounded-2xl border border-border bg-surface-primary p-4"
      aria-busy="true"
      aria-label={t('checklist.loading')}
    >
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-3 rounded-xl border border-border p-3"
        >
          <div className="h-5 w-5 rounded-full bg-border" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-36 rounded bg-border" />
            <div className="h-3 w-48 rounded bg-border" />
          </div>
          <div className="h-6 w-16 rounded bg-border" />
        </div>
      ))}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ReadinessChecklist({ readiness, isLoading }: ReadinessChecklistProps) {
  const t = useTranslations('regulatory.octoberReturns');
  const locale = useLocale();

  if (isLoading) return <ChecklistSkeleton />;

  if (!readiness) {
    return (
      <div className="rounded-2xl border border-border bg-surface-secondary p-6 text-center text-sm text-text-secondary">
        {t('checklist.empty')}
      </div>
    );
  }

  if (readiness.categories.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface-secondary p-6 text-center text-sm text-text-secondary">
        {t('checklist.empty')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">{t('checklist.title')}</h2>
        <p className="text-xs text-text-tertiary">{t('checklist.description')}</p>
      </div>

      <ul className="space-y-2 rounded-2xl border border-border bg-surface-primary p-3">
        {readiness.categories.map((category) => {
          const hasFix = isKnownField(category.field) && category.status !== 'pass';
          const fixHref = `/${locale}${fixLinkForField(category.field)}`;
          const fieldLabel = isKnownField(category.field)
            ? t(`fields.${category.field}.label`)
            : category.label;
          const fieldDescription = category.message;

          return (
            <li
              key={category.field}
              className={cn(
                'flex flex-wrap items-start gap-3 rounded-xl border p-3 transition-colors',
                rowTone(category.status),
              )}
            >
              <StatusIcon status={category.status} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary">{fieldLabel}</p>
                  {category.required ? (
                    <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                      {t('checklist.required')}
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                      {t('checklist.optional')}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-text-secondary">{fieldDescription}</p>
                {typeof category.count === 'number' && category.count > 0 && (
                  <p className="mt-1 text-xs text-text-tertiary">
                    {t('checklist.countAffected', { count: category.count })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={statusBadgeVariant(category.status)} dot>
                  {t(`status.${category.status}`)}
                </StatusBadge>
                {hasFix && (
                  <Link
                    href={fixHref}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-teal-500 bg-white px-3 py-1.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                  >
                    {t('checklist.fix')}
                    <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
