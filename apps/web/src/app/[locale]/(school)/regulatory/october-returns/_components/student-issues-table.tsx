'use client';

import { StatusBadge, cn } from '@school/ui';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

type Severity = 'error' | 'warning';

interface StudentProblem {
  field: string;
  message: string;
  severity: Severity;
}

interface StudentIssue {
  student_id: string;
  student_name: string;
  student_number: string | null;
  problems: StudentProblem[];
}

interface OctoberIssuesResponse {
  academic_year: string;
  total_students: number;
  students_with_issues: number;
  issues: StudentIssue[];
}

interface StudentIssuesTableProps {
  data: OctoberIssuesResponse | null;
  isLoading: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SEVERITY_BADGE: Record<Severity, 'danger' | 'warning'> = {
  error: 'danger',
  warning: 'warning',
};

function worstSeverity(problems: StudentProblem[]): Severity {
  return problems.some((p) => p.severity === 'error') ? 'error' : 'warning';
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface-primary">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {[1, 2, 3, 4].map((i) => (
              <th key={i} className="px-4 py-3">
                <div className="h-3 w-24 animate-pulse rounded bg-border" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }).map((_, i) => (
            <tr key={`skel-${i}`} className="border-b border-border last:border-b-0">
              {[1, 2, 3, 4].map((j) => (
                <td key={j} className="px-4 py-3">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-surface-secondary" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function StudentIssuesTable({ data, isLoading }: StudentIssuesTableProps) {
  const t = useTranslations('regulatory');
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());

  const toggleExpanded = React.useCallback((studentId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-48 animate-pulse rounded bg-border" />
        <TableSkeleton />
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

  // No issues — success state
  if (data.issues.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-primary py-12">
        <CheckCircle2 className="h-10 w-10 text-success-text" aria-hidden="true" />
        <p className="text-sm font-medium text-text-primary">
          {t('octoberReturns.allStudentsComplete')}
        </p>
        <p className="text-sm text-text-secondary">
          {data.total_students} {t('octoberReturns.studentsChecked')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ─── Summary ─────────────────────────────────────────────────── */}
      <p className="text-sm text-text-secondary">
        <span className="font-semibold text-text-primary">
          {data.students_with_issues}
        </span>{' '}
        {t('octoberReturns.of')}{' '}
        <span className="font-semibold text-text-primary">
          {data.total_students}
        </span>{' '}
        {t('octoberReturns.studentsHaveIssues')}
      </p>

      {/* ─── Issues Table ────────────────────────────────────────────── */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface-primary">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('octoberReturns.studentName')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('octoberReturns.studentNumber')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('octoberReturns.issuesCount')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('octoberReturns.severity')}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.issues.map((student) => {
              const isExpanded = expandedIds.has(student.student_id);
              const worst = worstSeverity(student.problems);

              return (
                <React.Fragment key={student.student_id}>
                  {/* ─── Main Row ────────────────────────────────────── */}
                  <tr
                    className={cn(
                      'cursor-pointer border-b border-border transition-colors hover:bg-surface-secondary',
                      isExpanded && 'bg-surface-secondary',
                    )}
                    onClick={() => toggleExpanded(student.student_id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleExpanded(student.student_id);
                      }
                    }}
                    aria-expanded={isExpanded}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      <div className="flex items-center gap-2">
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 shrink-0 text-text-tertiary transition-transform',
                            isExpanded && 'rotate-180',
                          )}
                          aria-hidden="true"
                        />
                        {student.student_name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">
                      {student.student_number ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary">
                      {student.problems.length}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={SEVERITY_BADGE[worst]} dot>
                        {worst === 'error'
                          ? t('octoberReturns.severityError')
                          : t('octoberReturns.severityWarning')}
                      </StatusBadge>
                    </td>
                  </tr>

                  {/* ─── Expanded Problems ───────────────────────────── */}
                  {isExpanded && (
                    <tr className="border-b border-border last:border-b-0">
                      <td colSpan={4} className="bg-surface-secondary px-4 py-3">
                        <div className="space-y-2 ps-6">
                          {student.problems.map((problem, idx) => (
                            <div
                              key={`${problem.field}-${idx}`}
                              className="flex flex-wrap items-start gap-2 text-sm"
                            >
                              <StatusBadge
                                status={SEVERITY_BADGE[problem.severity]}
                                className="shrink-0 text-xs"
                              >
                                {problem.severity === 'error'
                                  ? t('octoberReturns.severityError')
                                  : t('octoberReturns.severityWarning')}
                              </StatusBadge>
                              <span className="font-medium text-text-primary">
                                {problem.field}:
                              </span>
                              <span className="text-text-secondary">
                                {problem.message}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
