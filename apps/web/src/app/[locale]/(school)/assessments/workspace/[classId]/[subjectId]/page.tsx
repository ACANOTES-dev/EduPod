'use client';

import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  LayoutGrid,
  Plus,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button, StatusBadge, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TeachingAllocation {
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  subject_code: string | null;
  year_group_id: string;
  year_group_name: string;
  staff_profile_id: string;
  teacher_name: string;
  is_primary: boolean;
  has_grade_config: boolean;
  has_approved_categories: number;
  has_approved_weights: boolean;
  assessment_count: number;
}

interface AllocationsResponse {
  data: TeachingAllocation[];
}

type AssessmentStatus =
  | 'draft'
  | 'open'
  | 'submitted_locked'
  | 'unlock_requested'
  | 'reopened'
  | 'final_locked';

interface Assessment {
  id: string;
  title: string;
  status: AssessmentStatus;
  max_score: number | null;
  due_date: string | null;
}

interface AssessmentsResponse {
  data: Assessment[];
  meta: { page: number; pageSize: number; total: number };
}

interface AssessmentCategory {
  id: string;
  name: string;
  status: string;
}

interface CategoriesResponse {
  data: AssessmentCategory[];
}

// ─── Status variant map ─────────────────────────────────────────────────────

type SemanticVariant = 'warning' | 'info' | 'success' | 'neutral' | 'danger';

const STATUS_VARIANT: Record<string, SemanticVariant> = {
  draft: 'warning',
  open: 'info',
  submitted_locked: 'success',
  unlock_requested: 'warning',
  reopened: 'info',
  final_locked: 'neutral',
};

// ─── Loading skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-secondary" />
      <div className="h-5 w-48 animate-pulse rounded bg-surface-secondary" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-secondary" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface p-12">
      <LayoutGrid className="mb-3 h-10 w-10 text-text-tertiary" />
      <p className="text-sm text-text-tertiary">{message}</p>
    </div>
  );
}

// ─── Status icon component ──────────────────────────────────────────────────

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-4 w-4 text-success-text" />
  ) : (
    <XCircle className="h-4 w-4 text-danger-text" />
  );
}

// ─── Setup status card ──────────────────────────────────────────────────────

function SetupCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
        {label}
      </span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

// ─── Status label helper ────────────────────────────────────────────────────

function statusLabel(status: string, t: ReturnType<typeof useTranslations>): string {
  const map: Record<string, string> = {
    draft: t('draft'),
    open: t('wsOpen'),
    submitted_locked: t('wsSubmittedLocked'),
    unlock_requested: t('wsUnlockRequested'),
    reopened: t('wsReopened'),
    final_locked: t('wsFinalLocked'),
  };
  return map[status] ?? status;
}

// ─── Format date helper ─────────────────────────────────────────────────────

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AssessmentWorkspacePage() {
  const t = useTranslations('teacherAssessments');
  const tc = useTranslations('common');
  const params = useParams();
  const classId = params?.classId as string;
  const subjectId = params?.subjectId as string;

  // ── State ──────────────────────────────────────────────────────────────────

  const [allocation, setAllocation] = React.useState<TeachingAllocation | null>(null);
  const [assessments, setAssessments] = React.useState<Assessment[]>([]);
  const [approvedCategoryCount, setApprovedCategoryCount] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [assessmentsLoading, setAssessmentsLoading] = React.useState(true);

  // ── Fetch allocation ───────────────────────────────────────────────────────

  const fetchAllocation = React.useCallback(async () => {
    try {
      const res = await apiClient<AllocationsResponse>('/api/v1/gradebook/teaching-allocations');
      const match = res.data.find((a) => a.class_id === classId && a.subject_id === subjectId);
      setAllocation(match ?? null);
    } catch (err) {
      console.error('[AssessmentWorkspace.fetchAllocation]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setIsLoading(false);
    }
  }, [classId, subjectId, tc]);

  // ── Fetch assessments ──────────────────────────────────────────────────────

  const fetchAssessments = React.useCallback(async () => {
    setAssessmentsLoading(true);
    try {
      const res = await apiClient<AssessmentsResponse>(
        `/api/v1/gradebook/assessments?class_id=${classId}&subject_id=${subjectId}&pageSize=10`,
      );
      setAssessments(res.data);
    } catch (err) {
      console.error('[AssessmentWorkspace.fetchAssessments]', err);
    } finally {
      setAssessmentsLoading(false);
    }
  }, [classId, subjectId]);

  // ── Fetch approved categories count ────────────────────────────────────────

  const fetchCategories = React.useCallback(async () => {
    try {
      const res = await apiClient<CategoriesResponse>(
        `/api/v1/gradebook/assessment-categories?subject_id=${subjectId}&status=approved&pageSize=100`,
      );
      setApprovedCategoryCount(res.data.length);
    } catch (err) {
      console.error('[AssessmentWorkspace.fetchCategories]', err);
    }
  }, [subjectId]);

  // ── Effects ────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    void fetchAllocation();
  }, [fetchAllocation]);

  React.useEffect(() => {
    void fetchAssessments();
  }, [fetchAssessments]);

  React.useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  // ── Loading state ──────────────────────────────────────────────────────────

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!allocation) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('wsTitle')} />
        <EmptyState message={t('wsAllocationNotFound')} />
      </div>
    );
  }

  // ── Setup completeness ─────────────────────────────────────────────────────

  const hasGradeConfig = allocation.has_grade_config;
  const hasCategories = approvedCategoryCount > 0;
  const hasWeights = allocation.has_approved_weights;
  const setupComplete = hasGradeConfig && hasCategories && hasWeights;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={`${allocation.class_name} — ${allocation.subject_name}`}
        description={`${allocation.year_group_name}`}
        actions={
          setupComplete ? (
            <Button asChild>
              <Link href={`/assessments/workspace/${classId}/${subjectId}/create`}>
                <Plus className="me-2 h-4 w-4" />
                {t('wsCreateAssessment')}
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* Setup warning */}
      {!setupComplete && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning-border bg-warning-bg p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-text" />
          <div>
            <p className="text-sm font-medium text-warning-text">{t('wsSetupIncomplete')}</p>
            <p className="mt-1 text-xs text-warning-text/80">{t('wsSetupIncompleteDescription')}</p>
          </div>
        </div>
      )}

      {/* Setup Status */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-tertiary">
          {t('setupStatus')}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SetupCard label={t('gradeConfig')}>
            <StatusIcon ok={hasGradeConfig} />
            <span className="text-sm text-text-primary">
              {hasGradeConfig ? t('configured') : t('notConfigured')}
            </span>
          </SetupCard>

          <SetupCard label={t('approvedCategories')}>
            <Badge variant={hasCategories ? 'success' : 'warning'}>{approvedCategoryCount}</Badge>
            <span className="text-sm text-text-primary">{t('approved')}</span>
          </SetupCard>

          <SetupCard label={t('approvedWeights')}>
            <StatusIcon ok={hasWeights} />
            <span className="text-sm text-text-primary">
              {hasWeights ? t('configured') : t('notConfigured')}
            </span>
          </SetupCard>
        </div>
      </div>

      {/* Recent Assessments */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-text-tertiary">
          {t('wsRecentAssessments')}
        </h2>

        {assessmentsLoading ? (
          <div className="h-40 animate-pulse rounded-2xl bg-surface-secondary" />
        ) : assessments.length === 0 ? (
          <EmptyState message={t('wsNoAssessments')} />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <div className="rounded-2xl border border-border bg-surface overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                          {t('wsAssessmentTitle')}
                        </th>
                        <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                          {t('status')}
                        </th>
                        <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                          {t('wsMaxScore')}
                        </th>
                        <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                          {t('wsDueDate')}
                        </th>
                        <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                          {tc('actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {assessments.map((assessment) => (
                        <tr
                          key={assessment.id}
                          className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-text-primary">
                            {assessment.title}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              status={STATUS_VARIANT[assessment.status] ?? 'neutral'}
                              dot
                            >
                              {statusLabel(assessment.status, t)}
                            </StatusBadge>
                          </td>
                          <td className="px-4 py-3 text-end text-sm font-mono text-text-primary">
                            {assessment.max_score ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-text-secondary">
                            {formatShortDate(assessment.due_date)}
                          </td>
                          <td className="px-4 py-3 text-end">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/gradebook/assessments/${assessment.id}/grades`}>
                                <BookOpen className="h-4 w-4" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Mobile card view */}
            <div className="flex flex-col gap-3 sm:hidden">
              {assessments.map((assessment) => (
                <div
                  key={assessment.id}
                  className="rounded-2xl border border-border bg-surface p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-text-primary">{assessment.title}</p>
                    <StatusBadge status={STATUS_VARIANT[assessment.status] ?? 'neutral'} dot>
                      {statusLabel(assessment.status, t)}
                    </StatusBadge>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-text-secondary">
                    {assessment.max_score != null && (
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3.5 w-3.5" />
                        {assessment.max_score}
                      </span>
                    )}
                    {assessment.due_date && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {formatShortDate(assessment.due_date)}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-end border-t border-border pt-2">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/gradebook/assessments/${assessment.id}/grades`}>
                        <BookOpen className="me-1.5 h-4 w-4" />
                        {t('wsGradeEntry')}
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
