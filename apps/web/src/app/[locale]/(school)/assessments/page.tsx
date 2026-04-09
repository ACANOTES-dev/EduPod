'use client';

import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  LayoutGrid,
  Scale,
  Target,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, cn, StatCard, StatusBadge } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { ADMIN_ROLES } from '@/lib/route-roles';
import type { RoleKey } from '@/lib/route-roles';
import { useAuth } from '@/providers/auth-provider';

import { InlineApprovalQueue } from './_components/inline-approval-queue';
import { LeadershipDashboard } from './_components/leadership-dashboard';

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

interface PaginatedResponse<T> {
  data: T[];
  meta?: { page: number; pageSize: number; total: number };
}

interface ConfigCounts {
  categories: number;
  approvedCategories: number;
  weights: number;
  rubrics: number;
  standards: number;
}

type ConfigTabKey = 'categories' | 'weights' | 'rubrics' | 'standards';

interface MyConfigItem {
  id: string;
  name: string;
  type: 'category' | 'weight' | 'rubric' | 'standard';
  status: string;
  rejection_reason?: string | null;
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-surface-secondary" />
        ))}
      </div>
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
    <div className="space-y-2">
      <p className="text-xs text-text-tertiary">{t('clickToManage')}</p>
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
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {allocations.map((allocation) => (
                <tr
                  key={`${allocation.class_id}-${allocation.subject_id}`}
                  className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary group"
                >
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    <Link
                      href={`/assessments/workspace/${allocation.class_id}/${allocation.subject_id}`}
                      className="block"
                    >
                      {allocation.class_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-primary">
                    <Link
                      href={`/assessments/workspace/${allocation.class_id}/${allocation.subject_id}`}
                      className="block"
                    >
                      <span>{allocation.subject_name}</span>
                      {allocation.subject_code && (
                        <span className="ms-1.5 font-mono text-xs text-text-tertiary">
                          ({allocation.subject_code})
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-sm text-text-secondary sm:table-cell">
                    <Link
                      href={`/assessments/workspace/${allocation.class_id}/${allocation.subject_id}`}
                      className="block"
                    >
                      {allocation.year_group_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center">
                      <StatusIcon ok={allocation.has_grade_config} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center">
                      <Badge
                        variant={allocation.has_approved_categories > 0 ? 'success' : 'warning'}
                      >
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
                  <td className="px-4 py-3">
                    <Link
                      href={`/assessments/workspace/${allocation.class_id}/${allocation.subject_id}`}
                      className="text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={t('viewWorkspace')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    <Link
      href={`/assessments/workspace/${allocation.class_id}/${allocation.subject_id}`}
      className="block rounded-2xl border border-border bg-surface p-4 space-y-3 transition-colors hover:border-primary-300 cursor-pointer"
    >
      <div className="flex items-start justify-between">
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
        <ExternalLink className="h-4 w-4 text-text-tertiary shrink-0" />
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
    </Link>
  );
}

// ─── Config quick-access card ───────────────────────────────────────────────

function ConfigCard({
  href,
  icon: Icon,
  title,
  description,
  countLabel,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
  countLabel: string | null;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary-300 cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary transition-colors group-hover:bg-primary-100">
          <Icon className="h-5 w-5" />
        </div>
        {countLabel !== null && <Badge variant="secondary">{countLabel}</Badge>}
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="text-xs text-text-secondary mt-0.5">{description}</p>
      </div>
    </Link>
  );
}

// ─── Status helpers ─────────────────────────────────────────────────────────

const STATUS_SORT_ORDER: Record<string, number> = {
  pending_approval: 0,
  rejected: 1,
  draft: 2,
  approved: 3,
  archived: 4,
};

function statusToSemantic(status: string): 'neutral' | 'warning' | 'success' | 'danger' {
  switch (status) {
    case 'approved':
      return 'success';
    case 'pending_approval':
      return 'warning';
    case 'rejected':
      return 'danger';
    default:
      return 'neutral';
  }
}

// ─── My config status ──────────────────────────────────────────────────────

function MyConfigStatus({ t }: { t: ReturnType<typeof useTranslations> }) {
  const [activeTab, setActiveTab] = React.useState<ConfigTabKey>('categories');
  const [categoryItems, setCategoryItems] = React.useState<MyConfigItem[]>([]);
  const [weightItems, setWeightItems] = React.useState<MyConfigItem[]>([]);
  const [rubricItems, setRubricItems] = React.useState<MyConfigItem[]>([]);
  const [standardItems, setStandardItems] = React.useState<MyConfigItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchMyConfig() {
      try {
        const [categoriesRes, weightsRes, rubricsRes, standardsRes] = await Promise.all([
          apiClient<
            PaginatedResponse<{
              id: string;
              name: string;
              status: string;
              rejection_reason?: string | null;
            }>
          >('/api/v1/gradebook/assessment-categories?pageSize=100', {
            silent: true,
          }).catch(() => null),
          apiClient<
            PaginatedResponse<{
              id: string;
              subject_name?: string;
              year_group_name?: string;
              status: string;
              rejection_reason?: string | null;
            }>
          >('/api/v1/gradebook/teacher-grading-weights?pageSize=100', {
            silent: true,
          }).catch(() => null),
          apiClient<
            PaginatedResponse<{
              id: string;
              name: string;
              status: string;
              rejection_reason?: string | null;
            }>
          >('/api/v1/gradebook/rubric-templates?page=1&pageSize=100', {
            silent: true,
          }).catch(() => null),
          apiClient<
            PaginatedResponse<{
              id: string;
              code: string;
              status: string;
              rejection_reason?: string | null;
            }>
          >('/api/v1/gradebook/curriculum-standards?page=1&pageSize=100', {
            silent: true,
          }).catch(() => null),
        ]);

        const sortItems = (items: MyConfigItem[]) =>
          items.sort(
            (a, b) => (STATUS_SORT_ORDER[a.status] ?? 99) - (STATUS_SORT_ORDER[b.status] ?? 99),
          );

        if (categoriesRes) {
          setCategoryItems(
            sortItems(
              categoriesRes.data.map((cat) => ({
                id: cat.id,
                name: cat.name,
                type: 'category' as const,
                status: cat.status,
                rejection_reason: cat.rejection_reason,
              })),
            ),
          );
        }

        if (weightsRes) {
          setWeightItems(
            sortItems(
              weightsRes.data.map((w) => ({
                id: w.id,
                name: `${w.subject_name ?? '\u2014'} / ${w.year_group_name ?? '\u2014'}`,
                type: 'weight' as const,
                status: w.status,
                rejection_reason: w.rejection_reason,
              })),
            ),
          );
        }

        if (rubricsRes) {
          setRubricItems(
            sortItems(
              rubricsRes.data.map((r) => ({
                id: r.id,
                name: r.name,
                type: 'rubric' as const,
                status: r.status,
                rejection_reason: r.rejection_reason,
              })),
            ),
          );
        }

        if (standardsRes) {
          setStandardItems(
            sortItems(
              standardsRes.data.map((s) => ({
                id: s.id,
                name: s.code,
                type: 'standard' as const,
                status: s.status,
                rejection_reason: s.rejection_reason,
              })),
            ),
          );
        }
      } catch (err) {
        console.error('[MyConfigStatus.fetchMyConfig]', err);
      } finally {
        setLoading(false);
      }
    }

    void fetchMyConfig();
  }, []);

  const tabConfig: { key: ConfigTabKey; label: string; items: MyConfigItem[] }[] = [
    { key: 'categories', label: t('categories'), items: categoryItems },
    { key: 'weights', label: t('weights'), items: weightItems },
    { key: 'rubrics', label: t('rubricTemplates'), items: rubricItems },
    { key: 'standards', label: t('curriculumStandards'), items: standardItems },
  ];

  const activeItems = tabConfig.find((tab) => tab.key === activeTab)?.items ?? [];

  if (loading) {
    return (
      <div className="space-y-3 pb-8">
        <div className="h-6 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
      </div>
    );
  }

  const totalItems =
    categoryItems.length + weightItems.length + rubricItems.length + standardItems.length;

  if (totalItems === 0) {
    return (
      <div className="space-y-3 pb-8">
        <h2 className="text-lg font-semibold text-text-primary">{t('myConfigStatus')}</h2>
        <div className="rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm text-text-tertiary text-center">{t('noConfigItems')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-8">
      <h2 className="text-lg font-semibold text-text-primary">{t('myConfigStatus')}</h2>

      {/* Tab buttons */}
      <div className="flex overflow-x-auto border-b border-border">
        {tabConfig.map((tab) => (
          <button
            key={tab.key}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
              activeTab === tab.key
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-text-secondary hover:text-text-primary hover:border-border',
            )}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label} ({tab.items.length})
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeItems.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-6">
          <p className="text-sm text-text-tertiary text-center">{t('noConfigItems')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('configItemName')}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('status')}
                  </th>
                  <th className="px-4 py-2.5 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {t('rejectionReason')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeItems.map((item) => (
                  <tr
                    key={`${item.type}-${item.id}`}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-4 py-2.5 text-sm text-text-primary">{item.name}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={statusToSemantic(item.status)}>
                        {t(item.status === 'pending_approval' ? 'pendingApproval' : item.status)}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-text-secondary">
                      {item.status === 'rejected' && item.rejection_reason
                        ? item.rejection_reason
                        : '\u2014'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AssessmentsDashboardPage() {
  const { user } = useAuth();

  // Admin / leadership roles get the purpose-built oversight dashboard.
  // Teachers (and all other staff roles) see the teacher-centric allocations view.
  const isLeadership = React.useMemo(() => {
    if (!user?.memberships) return false;
    const roleKeys = user.memberships.flatMap(
      (m) => m.roles?.map((r) => r.role_key as RoleKey) ?? [],
    );
    return ADMIN_ROLES.some((r) => roleKeys.includes(r));
  }, [user]);

  if (isLeadership) {
    return <LeadershipDashboard />;
  }

  return <TeacherAssessmentsDashboard />;
}

function TeacherAssessmentsDashboard() {
  const t = useTranslations('teacherAssessments');

  const [allocations, setAllocations] = React.useState<TeachingAllocation[]>([]);
  const [configCounts, setConfigCounts] = React.useState<ConfigCounts>({
    categories: 0,
    approvedCategories: 0,
    weights: 0,
    rubrics: 0,
    standards: 0,
  });
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchData = React.useCallback(async () => {
    try {
      const [allocationsRes, categoriesRes, weightsRes, rubricsRes, standardsRes] =
        await Promise.all([
          apiClient<AllocationsResponse>('/api/v1/gradebook/teaching-allocations'),
          apiClient<PaginatedResponse<{ id: string; status: string }>>(
            '/api/v1/gradebook/assessment-categories?pageSize=100',
          ).catch(() => ({ data: [], meta: { page: 1, pageSize: 100, total: 0 } })),
          apiClient<PaginatedResponse<{ id: string }>>(
            '/api/v1/gradebook/teacher-grading-weights?pageSize=1',
          ).catch(() => ({ data: [], meta: { page: 1, pageSize: 1, total: 0 } })),
          apiClient<PaginatedResponse<{ id: string }>>(
            '/api/v1/gradebook/rubric-templates?page=1&pageSize=1',
          ).catch(() => ({ data: [], meta: { page: 1, pageSize: 1, total: 0 } })),
          apiClient<PaginatedResponse<{ id: string }>>(
            '/api/v1/gradebook/curriculum-standards?page=1&pageSize=1',
          ).catch(() => ({ data: [], meta: { page: 1, pageSize: 1, total: 0 } })),
        ]);

      setAllocations(allocationsRes.data);

      const allCategories = categoriesRes.data;
      const approvedCats = allCategories.filter(
        (c: { id: string; status: string }) => c.status === 'approved',
      ).length;

      setConfigCounts({
        categories: categoriesRes.meta?.total ?? allCategories.length,
        approvedCategories: approvedCats,
        weights: weightsRes.meta?.total ?? weightsRes.data.length,
        rubrics: rubricsRes.meta?.total ?? rubricsRes.data.length,
        standards: standardsRes.meta?.total ?? standardsRes.data.length,
      });
    } catch (err) {
      console.error('[TeacherAssessmentsDashboard.fetchData]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

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

      {/* ── Config Quick-Access Cards ──────────────────────────────────────── */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">{t('configSection')}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ConfigCard
            href="/assessments/categories"
            icon={BookOpen}
            title={t('configCategoriesTitle')}
            description={t('configCategoriesDesc')}
            countLabel={`${configCounts.approvedCategories}/${configCounts.categories}`}
          />
          <ConfigCard
            href="/assessments/grading-weights"
            icon={Scale}
            title={t('configWeightsTitle')}
            description={t('configWeightsDesc')}
            countLabel={String(configCounts.weights)}
          />
          <ConfigCard
            href="/assessments/rubric-templates"
            icon={ClipboardList}
            title={t('configRubricsTitle')}
            description={t('configRubricsDesc')}
            countLabel={String(configCounts.rubrics)}
          />
          <ConfigCard
            href="/assessments/curriculum-standards"
            icon={Target}
            title={t('configStandardsTitle')}
            description={t('configStandardsDesc')}
            countLabel={String(configCounts.standards)}
          />
        </div>
      </div>

      {/* ── My Config Status (teacher view) ──────────────────────────────── */}
      <MyConfigStatus t={t} />

      {/* ── Approval Queue (leadership only) ───────────────────────────────── */}
      <InlineApprovalQueue />
    </div>
  );
}
