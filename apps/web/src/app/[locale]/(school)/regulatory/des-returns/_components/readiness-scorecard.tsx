'use client';

import { AlertTriangle, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { StatusBadge, cn } from '@school/ui';

// ─── Types ───────────────────────────────────────────────────────────────────

export type CategoryKey =
  | 'staff_data'
  | 'class_data'
  | 'subject_mappings'
  | 'student_data'
  | 'schedule_data';

export interface ReadinessCategory {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: { total: number; valid: number; issues: number };
}

export interface ReadinessResponse {
  ready?: boolean;
  academic_year?: string;
  categories: ReadinessCategory[];
}

export interface FileSubmissionInfo {
  fileType: string;
  lastGeneratedAt: string | null;
}

interface ReadinessScorecardProps {
  readiness: ReadinessResponse | null;
  submissions: FileSubmissionInfo[];
  isLoading: boolean;
}

// ─── File ↔ category dependency map ─────────────────────────────────────────

const FILE_DEPENDENCIES: Record<string, CategoryKey[]> = {
  file_a: ['staff_data'],
  file_c: ['class_data'],
  file_d: ['subject_mappings'],
  file_e: ['student_data'],
  form_tl: ['schedule_data', 'subject_mappings', 'staff_data'],
};

const FILE_ORDER = ['file_a', 'file_c', 'file_d', 'file_e', 'form_tl'] as const;
type FileKey = (typeof FILE_ORDER)[number];

// ─── Fix-link map (deep links to the screens that resolve each category) ────

const CATEGORY_FIX_LINKS: Record<CategoryKey, string> = {
  staff_data: '/staff',
  class_data: '/academic/classes',
  subject_mappings: '/regulatory/des-returns/subject-mappings',
  student_data: '/students',
  schedule_data: '/timetable',
};

// ─── Status visuals ─────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: 'pass' | 'fail' | 'warning' }) {
  if (status === 'pass') {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-600" aria-hidden="true" />;
  }
  if (status === 'warning') {
    return <AlertTriangle className="h-5 w-5 shrink-0 text-warning-600" aria-hidden="true" />;
  }
  return <XCircle className="h-5 w-5 shrink-0 text-danger-600" aria-hidden="true" />;
}

function borderTone(status: 'pass' | 'fail' | 'warning') {
  switch (status) {
    case 'pass':
      return 'border-s-teal-500';
    case 'warning':
      return 'border-s-warning-500';
    case 'fail':
      return 'border-s-danger-500';
  }
}

function overallOf(categories: ReadinessCategory[]): 'pass' | 'warning' | 'fail' {
  if (categories.some((c) => c.status === 'fail')) return 'fail';
  if (categories.some((c) => c.status === 'warning')) return 'warning';
  return 'pass';
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function Skeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label={label}>
      <div className="animate-pulse rounded-2xl bg-surface-secondary p-4">
        <div className="h-4 w-40 rounded bg-border" />
      </div>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-border bg-surface-primary p-4"
        >
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

// ─── Component ──────────────────────────────────────────────────────────────

export function ReadinessScorecard({ readiness, submissions, isLoading }: ReadinessScorecardProps) {
  const t = useTranslations('regulatory.desReturns');
  const locale = useLocale();

  if (isLoading) {
    return <Skeleton label={t('scorecard.loading')} />;
  }

  if (!readiness || readiness.categories.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface-secondary p-6 text-center text-sm text-text-secondary">
        {t('scorecard.empty')}
      </div>
    );
  }

  const categories = readiness.categories;
  const passCount = categories.filter((c) => c.status === 'pass').length;
  const warnCount = categories.filter((c) => c.status === 'warning').length;
  const failCount = categories.filter((c) => c.status === 'fail').length;
  const overall = overallOf(categories);

  const categoryByName = new Map<string, ReadinessCategory>();
  categories.forEach((c) => categoryByName.set(c.name, c));

  const submissionByFile = new Map<string, FileSubmissionInfo>();
  submissions.forEach((s) => submissionByFile.set(s.fileType, s));

  const bannerTone = {
    pass: 'border-teal-200 bg-teal-50 text-teal-900',
    warning: 'border-warning-200 bg-warning-50 text-warning-900',
    fail: 'border-danger-200 bg-danger-50 text-danger-900',
  }[overall];

  return (
    <section
      aria-label={t('scorecard.ariaLabel')}
      className="rounded-2xl border border-border bg-surface-primary"
    >
      <header className="flex flex-col gap-1 border-b border-border p-4 sm:p-5">
        <h2 className="text-base font-semibold text-text-primary">{t('scorecard.title')}</h2>
        <p className="text-sm text-text-secondary">{t('scorecard.description')}</p>
      </header>

      <div className="space-y-6 p-4 sm:p-5">
        {/* ── Overall banner ───────────────────────────────────────────── */}
        <div
          className={cn(
            'flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium',
            bannerTone,
          )}
        >
          <StatusIcon status={overall} />
          <span>
            {overall === 'pass'
              ? t('summary.allPassed')
              : overall === 'warning'
                ? t('summary.warnings', { count: warnCount })
                : t('summary.failed', { count: failCount })}
          </span>
          <span className="ms-auto flex gap-3 text-xs font-normal">
            {passCount > 0 && (
              <span className="text-teal-700">
                {t('summary.passedCount', { count: passCount })}
              </span>
            )}
            {warnCount > 0 && (
              <span className="text-warning-700">
                {t('summary.warningCount', { count: warnCount })}
              </span>
            )}
            {failCount > 0 && (
              <span className="text-danger-700">
                {t('summary.failedCount', { count: failCount })}
              </span>
            )}
          </span>
        </div>

        {/* ── Per-file readiness ───────────────────────────────────────── */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-text-primary">
            {t('scorecard.perFileTitle')}
          </h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {FILE_ORDER.map((fileKey) => {
              const deps = FILE_DEPENDENCIES[fileKey] ?? [];
              const depCategories = deps
                .map((d) => categoryByName.get(d))
                .filter((c): c is ReadinessCategory => Boolean(c));
              const depStatus = depCategories.length === 0 ? 'fail' : overallOf(depCategories);
              const submission = submissionByFile.get(fileKey);
              const lastGenerated = submission?.lastGeneratedAt ?? null;

              return (
                <FileTile
                  key={fileKey}
                  fileKey={fileKey}
                  status={depStatus}
                  lastGenerated={lastGenerated}
                />
              );
            })}
          </div>
        </div>

        {/* ── Category detail rows ─────────────────────────────────────── */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-text-primary">
            {t('scorecard.detailsTitle')}
          </h3>
          <ul className="space-y-3">
            {categories.map((category) => {
              const key = category.name as CategoryKey;
              const fixHref = CATEGORY_FIX_LINKS[key]
                ? `/${locale}${CATEGORY_FIX_LINKS[key]}`
                : null;
              const translatedName = t(`category.${key}.name`);
              const details = category.details;
              const validPct =
                details && details.total > 0
                  ? Math.round((details.valid / details.total) * 100)
                  : 0;

              return (
                <li
                  key={category.name}
                  className={cn(
                    'rounded-2xl border border-s-4 border-border bg-surface p-4',
                    borderTone(category.status),
                  )}
                >
                  <div className="flex items-start gap-3">
                    <StatusIcon status={category.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-text-primary">{translatedName}</p>
                        <StatusBadge
                          status={
                            category.status === 'pass'
                              ? 'success'
                              : category.status === 'warning'
                                ? 'warning'
                                : 'danger'
                          }
                          dot
                        >
                          {t(`status.${category.status}`)}
                        </StatusBadge>
                      </div>
                      <p className="mt-1 text-sm text-text-secondary">{category.message}</p>

                      {details && details.total > 0 && (
                        <div className="mt-2 flex items-center gap-3">
                          <div
                            className="h-1.5 w-36 overflow-hidden rounded-full bg-border"
                            aria-hidden="true"
                          >
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                category.status === 'pass'
                                  ? 'bg-teal-500'
                                  : category.status === 'warning'
                                    ? 'bg-warning-500'
                                    : 'bg-danger-500',
                              )}
                              style={{ width: `${validPct}%` }}
                            />
                          </div>
                          <span className="text-xs text-text-secondary">
                            {t('summary.validOfTotal', {
                              valid: details.valid,
                              total: details.total,
                            })}
                            {details.issues > 0 && (
                              <span className="ms-1 text-danger-600">
                                {t('summary.issuesCount', { count: details.issues })}
                              </span>
                            )}
                          </span>
                        </div>
                      )}

                      {fixHref && category.status !== 'pass' && (
                        <Link
                          href={fixHref}
                          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800"
                        >
                          {t(`category.${key}.fixLink`)}
                          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ─── File Tile ──────────────────────────────────────────────────────────────

interface FileTileProps {
  fileKey: FileKey;
  status: 'pass' | 'warning' | 'fail';
  lastGenerated: string | null;
}

function FileTile({ fileKey, status, lastGenerated }: FileTileProps) {
  const t = useTranslations('regulatory.desReturns');
  const locale = useLocale();

  const statusCopy = {
    pass: t('scorecard.ready'),
    warning: t('scorecard.incomplete'),
    fail: t('scorecard.notStarted'),
  }[status];

  return (
    <Link
      href={`/${locale}/regulatory/des-returns/generate?file_type=${fileKey}`}
      className="group flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-teal-300 hover:bg-teal-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text-primary">
          {t(`scorecard.files.${fileKey}.label`)}
        </span>
        <StatusBadge
          status={status === 'pass' ? 'success' : status === 'warning' ? 'warning' : 'danger'}
          dot
        >
          {statusCopy}
        </StatusBadge>
      </div>
      <p className="text-xs text-text-secondary">{t(`scorecard.files.${fileKey}.description`)}</p>
      <div className="mt-1 text-[11px] text-text-tertiary">
        {lastGenerated ? (
          <span>
            {t('scorecard.lastGenerated', {
              date: new Date(lastGenerated).toLocaleDateString(locale),
            })}
          </span>
        ) : (
          <span>{t('scorecard.neverGenerated')}</span>
        )}
      </div>
    </Link>
  );
}
