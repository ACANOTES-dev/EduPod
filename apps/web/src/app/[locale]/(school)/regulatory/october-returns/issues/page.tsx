'use client';

import { ArrowRight, CheckCircle2, ChevronDown, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Input, Label, StatusBadge, cn } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { ErrorBanner } from '../../_components/error-banner';
import { fixLinkForField, isKnownField } from '../_components/issue-to-fix-link';

// ─── Types ──────────────────────────────────────────────────────────────────

type Severity = 'error' | 'warning';

interface StudentProblem {
  field: string;
  message: string;
  severity: Severity;
}

interface StudentIssueEntry {
  student_id: string;
  student_name: string;
  student_number: string | null;
  problems: StudentProblem[];
}

interface OctoberIssuesResponse {
  academic_year: string;
  total_students: number;
  students_with_issues: number;
  issues: StudentIssueEntry[];
}

type SeverityFilter = 'all' | 'error' | 'warning';

const DEFAULT_ACADEMIC_YEAR = '2025-2026';

// ─── Envelope helper ─────────────────────────────────────────────────────────

function unwrap<T>(res: { data: T } | T): T {
  if (res && typeof res === 'object' && 'data' in (res as object)) {
    return (res as { data: T }).data;
  }
  return res as T;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function OctoberReturnsIssuesPage() {
  const t = useTranslations('regulatory.octoberReturns');
  const locale = useLocale();
  const searchParams = useSearchParams();

  const urlYear = searchParams?.get('year');
  const [academicYear, setAcademicYear] = React.useState<string>(urlYear ?? DEFAULT_ACADEMIC_YEAR);
  const [draftYear, setDraftYear] = React.useState<string>(urlYear ?? DEFAULT_ACADEMIC_YEAR);

  const [data, setData] = React.useState<OctoberIssuesResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const [severityFilter, setSeverityFilter] = React.useState<SeverityFilter>('all');
  const [fieldFilter, setFieldFilter] = React.useState<string>('all');
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());

  // ── Fetch issues ─────────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setFetchError(null);

    apiClient<{ data: OctoberIssuesResponse } | OctoberIssuesResponse>(
      `/api/v1/regulatory/october-returns/issues?academic_year=${encodeURIComponent(academicYear)}`,
      { silent: true },
    )
      .then((res) => {
        if (cancelled) return;
        setData(unwrap(res));
      })
      .catch((err) => {
        console.error('[OctoberReturnsIssuesPage] fetch failed', err);
        if (!cancelled) {
          setData(null);
          setFetchError(t('loadError'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [academicYear, reloadKey, t]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleApplyYear() {
    const trimmed = draftYear.trim();
    if (trimmed && trimmed !== academicYear) setAcademicYear(trimmed);
  }

  function handleYearKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleApplyYear();
  }

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Derived: distinct fields for filter dropdown ─────────────────────────
  const availableFields = React.useMemo(() => {
    const set = new Set<string>();
    if (data) {
      for (const issue of data.issues) {
        for (const p of issue.problems) set.add(p.field);
      }
    }
    return Array.from(set).sort();
  }, [data]);

  // ── Derived: filtered issues ─────────────────────────────────────────────
  const filteredIssues = React.useMemo(() => {
    if (!data) return [];
    return data.issues
      .map((issue) => {
        const problems = issue.problems.filter((p) => {
          if (severityFilter !== 'all' && p.severity !== severityFilter) return false;
          if (fieldFilter !== 'all' && p.field !== fieldFilter) return false;
          return true;
        });
        return { ...issue, problems };
      })
      .filter((issue) => issue.problems.length > 0);
  }, [data, severityFilter, fieldFilter]);

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('issues.pageTitle')}
        description={t('issues.pageDescription')}
        back={{ href: `/${locale}/regulatory/october-returns`, label: t('backToHub') }}
      />

      {fetchError && (
        <ErrorBanner
          message={fetchError}
          retryLabel={t('retry')}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

      {/* ── Filter bar ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface-primary p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="october-issues-year">{t('academicYear')}</Label>
          <Input
            id="october-issues-year"
            value={draftYear}
            onChange={(e) => setDraftYear(e.target.value)}
            onKeyDown={handleYearKeyDown}
            onBlur={handleApplyYear}
            placeholder={t('academicYearPlaceholder')}
            className="w-full text-base sm:w-44"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="october-severity-filter">{t('filter.severity')}</Label>
          <select
            id="october-severity-filter"
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
            className="h-10 rounded-lg border border-border bg-surface-primary px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 sm:w-40"
          >
            <option value="all">{t('filter.all')}</option>
            <option value="error">{t('severity.error')}</option>
            <option value="warning">{t('severity.warning')}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="october-field-filter">{t('filter.field')}</Label>
          <select
            id="october-field-filter"
            value={fieldFilter}
            onChange={(e) => setFieldFilter(e.target.value)}
            className="h-10 rounded-lg border border-border bg-surface-primary px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 sm:w-48"
          >
            <option value="all">{t('filter.all')}</option>
            {availableFields.map((field) => (
              <option key={field} value={field}>
                {isKnownField(field) ? t(`issueFields.${field}`) : field}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Summary ──────────────────────────────────────────────────────── */}
      {!isLoading && data && (
        <p className="text-sm text-text-secondary">
          {t('issues.summary', {
            withIssues: data.students_with_issues,
            total: data.total_students,
          })}
        </p>
      )}

      {/* ── List ─────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-2 rounded-2xl border border-border bg-surface-primary p-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex animate-pulse items-center gap-3 rounded-xl border border-border p-3"
            >
              <div className="h-5 w-5 rounded-full bg-border" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-40 rounded bg-border" />
                <div className="h-3 w-28 rounded bg-border" />
              </div>
              <div className="h-6 w-16 rounded bg-border" />
            </div>
          ))}
        </div>
      ) : !data ? null : filteredIssues.length === 0 && data.issues.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-primary py-16">
          <CheckCircle2 className="h-10 w-10 text-teal-600" aria-hidden="true" />
          <p className="text-base font-semibold text-text-primary">{t('issues.emptyStateTitle')}</p>
          <p className="max-w-md text-center text-sm text-text-secondary">
            {t('issues.emptyStateBody', { total: data.total_students })}
          </p>
        </div>
      ) : filteredIssues.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface-secondary p-8 text-center text-sm text-text-secondary">
          {t('issues.noResultsForFilter')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-primary">
          <ul className="divide-y divide-border">
            {filteredIssues.map((issue) => {
              const isExpanded = expandedIds.has(issue.student_id);
              const worst: Severity = issue.problems.some((p) => p.severity === 'error')
                ? 'error'
                : 'warning';

              return (
                <li key={issue.student_id}>
                  <button
                    type="button"
                    onClick={() => toggleExpanded(issue.student_id)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-surface-secondary"
                  >
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 shrink-0 text-text-tertiary transition-transform',
                        isExpanded && 'rotate-180',
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {issue.student_name}
                      </p>
                      {issue.student_number && (
                        <p className="truncate text-xs text-text-tertiary">
                          {t('studentNumberLabel')}: {issue.student_number}
                        </p>
                      )}
                    </div>
                    <span className="hidden text-xs text-text-tertiary sm:inline">
                      {t('issues.problemCount', { count: issue.problems.length })}
                    </span>
                    <StatusBadge status={worst === 'error' ? 'danger' : 'warning'} dot>
                      {t(`severity.${worst}`)}
                    </StatusBadge>
                  </button>

                  {isExpanded && (
                    <div className="space-y-2 bg-surface-secondary px-4 py-3">
                      {issue.problems.map((problem, idx) => {
                        const fieldLabel = isKnownField(problem.field)
                          ? t(`issueFields.${problem.field}`)
                          : problem.field;
                        const fixHref = `/${locale}${fixLinkForField(problem.field, issue.student_id)}`;

                        return (
                          <div
                            key={`${problem.field}-${idx}`}
                            className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-surface-primary p-3"
                          >
                            <div className="flex min-w-0 flex-1 items-start gap-2">
                              {problem.severity === 'error' ? (
                                <XCircle
                                  className="mt-0.5 h-4 w-4 shrink-0 text-danger-600"
                                  aria-hidden="true"
                                />
                              ) : (
                                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-warning-500" />
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-text-primary">
                                  {fieldLabel}
                                </p>
                                <p className="text-sm text-text-secondary">{problem.message}</p>
                              </div>
                            </div>
                            <Link
                              href={fixHref}
                              className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-teal-500 bg-white px-3 py-1.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                            >
                              {t('issues.fixLink')}
                              <ArrowRight
                                className="h-3.5 w-3.5 rtl:rotate-180"
                                aria-hidden="true"
                              />
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
