'use client';

import { CheckCircle2, LayoutGrid, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, StatCard } from '@school/ui';

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

// ─── Summary helpers ─────────────────────────────────────────────────────────

function computeSummary(allocations: TeachingAllocation[]) {
  const totalAllocations = allocations.length;
  const missingConfig = allocations.filter(
    (a) => !a.has_grade_config || a.has_approved_categories === 0 || !a.has_approved_weights,
  ).length;
  const approvedWeights = allocations.filter((a) => a.has_approved_weights).length;
  const totalAssessments = allocations.reduce((sum, a) => sum + a.assessment_count, 0);

  return { totalAllocations, missingConfig, approvedWeights, totalAssessments };
}

// ─── Status icon component ───────────────────────────────────────────────────

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-4 w-4 text-success-text" />
  ) : (
    <XCircle className="h-4 w-4 text-danger-text" />
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-secondary" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
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

// ─── Allocations table ──────────────────────────────────────────────────────

function AllocationsTable({
  allocations,
  t,
}: {
  allocations: TeachingAllocation[];
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('class')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('subject')}
              </th>
              <th className="hidden px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary sm:table-cell">
                {t('yearGroup')}
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('gradeConfig')}
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('categories')}
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('weights')}
              </th>
              <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('assessments')}
              </th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((allocation) => (
              <tr
                key={`${allocation.class_id}-${allocation.subject_id}`}
                className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary"
              >
                <td className="px-4 py-3 text-sm font-medium text-text-primary">
                  {allocation.class_name}
                </td>
                <td className="px-4 py-3 text-sm text-text-primary">
                  <span>{allocation.subject_name}</span>
                  {allocation.subject_code && (
                    <span className="ms-1.5 font-mono text-xs text-text-tertiary">
                      ({allocation.subject_code})
                    </span>
                  )}
                </td>
                <td className="hidden px-4 py-3 text-sm text-text-secondary sm:table-cell">
                  {allocation.year_group_name}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center">
                    <StatusIcon ok={allocation.has_grade_config} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center">
                    <Badge variant={allocation.has_approved_categories > 0 ? 'success' : 'warning'}>
                      {allocation.has_approved_categories}
                    </Badge>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center">
                    <StatusIcon ok={allocation.has_approved_weights} />
                  </div>
                </td>
                <td className="px-4 py-3 text-end">
                  <span className="text-sm font-mono text-text-primary">
                    {allocation.assessment_count}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Mobile card view ────────────────────────────────────────────────────────

function AllocationCard({
  allocation,
  t,
}: {
  allocation: TeachingAllocation;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-text-primary">{allocation.class_name}</p>
        <p className="text-xs text-text-secondary">
          {allocation.subject_name}
          {allocation.subject_code && (
            <span className="ms-1 font-mono text-text-tertiary">({allocation.subject_code})</span>
          )}
        </p>
        <p className="text-xs text-text-tertiary">{allocation.year_group_name}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-secondary p-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            {t('gradeConfig')}
          </span>
          <StatusIcon ok={allocation.has_grade_config} />
        </div>
        <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-secondary p-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            {t('categories')}
          </span>
          <Badge variant={allocation.has_approved_categories > 0 ? 'success' : 'warning'}>
            {allocation.has_approved_categories}
          </Badge>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-secondary p-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            {t('weights')}
          </span>
          <StatusIcon ok={allocation.has_approved_weights} />
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-2">
        <span className="text-xs text-text-tertiary">{t('assessments')}</span>
        <span className="text-sm font-mono font-medium text-text-primary">
          {allocation.assessment_count}
        </span>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TeacherAssessmentsDashboardPage() {
  const t = useTranslations('teacherAssessments');

  const [allocations, setAllocations] = React.useState<TeachingAllocation[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchAllocations = React.useCallback(async () => {
    try {
      const res = await apiClient<AllocationsResponse>('/api/v1/gradebook/teaching-allocations');
      setAllocations(res.data);
    } catch (err) {
      console.error('[TeacherAssessmentsDashboard.fetchAllocations]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchAllocations();
  }, [fetchAllocations]);

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  const summary = computeSummary(allocations);

  return (
    <div className="space-y-6">
      <PageHeader title={t('pageTitle')} description={t('pageDescription')} />

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('totalAllocations')} value={summary.totalAllocations} />
        <StatCard label={t('missingConfig')} value={summary.missingConfig} />
        <StatCard
          label={t('approvedWeights')}
          value={`${summary.approvedWeights}/${summary.totalAllocations}`}
        />
        <StatCard label={t('totalAssessments')} value={summary.totalAssessments} />
      </div>

      {/* Allocations data */}
      {allocations.length === 0 ? (
        <EmptyState message={t('noAllocations')} />
      ) : (
        <>
          {/* Desktop table view */}
          <div className="hidden sm:block">
            <AllocationsTable allocations={allocations} t={t} />
          </div>

          {/* Mobile card view */}
          <div className="flex flex-col gap-3 sm:hidden">
            {allocations.map((allocation) => (
              <AllocationCard
                key={`${allocation.class_id}-${allocation.subject_id}`}
                allocation={allocation}
                t={t}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
