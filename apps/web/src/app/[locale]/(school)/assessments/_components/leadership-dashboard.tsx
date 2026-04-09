'use client';

import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  LayoutGrid,
  RefreshCw,
  Scale,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, cn, StatCard } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { InlineApprovalQueue } from './inline-approval-queue';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Allocation {
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

interface Assessment {
  id: string;
  title: string;
  status:
    | 'draft'
    | 'open'
    | 'closed'
    | 'locked'
    | 'submitted_locked'
    | 'unlock_requested'
    | 'reopened'
    | 'final_locked';
  class_id: string;
  class_entity?: { id: string; name: string } | null;
  subject_id: string;
  subject?: { id: string; name: string; code: string | null } | null;
  category_id: string;
  category?: { id: string; name: string } | null;
  due_date: string | null;
  grading_deadline: string | null;
  created_at: string;
}

interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

interface ConfigCounts {
  categories: number;
  approvedCategories: number;
  pendingCategories: number;
  weights: number;
  approvedWeights: number;
  pendingWeights: number;
  rubrics: number;
  standards: number;
}

// ─── Derived KPI types ───────────────────────────────────────────────────────

interface Kpis {
  scheduled: number;
  pendingGrading: number;
  overdue: number;
  submittedLocked: number;
  finalLocked: number;
  activeTeachers: number;
  totalOpen: number;
  totalLocked: number;
  totalActive: number;
}

interface TeacherAttention {
  staff_profile_id: string;
  teacher_name: string;
  overdue: number;
  pendingGrading: number;
  scheduled: number;
  oldestOverdueDays: number | null;
}

interface SubjectActivity {
  subject_id: string;
  subject_name: string;
  scheduled: number;
  pendingGrading: number;
  overdue: number;
  submittedLocked: number;
  finalLocked: number;
  total: number;
}

// ─── Date helpers (local-TZ safe comparisons) ────────────────────────────────

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseYmdAsLocal(ymd: string | null): Date | null {
  if (!ymd) return null;
  // API returns ISO strings like "2025-11-01T00:00:00.000Z" — take the date part only
  const datePart = ymd.split('T')[0];
  if (!datePart) return null;
  const parts = datePart.split('-').map(Number);
  const [y, m, d] = parts;
  if (y == null || m == null || d == null) return null;
  const result = new Date(y, m - 1, d);
  result.setHours(0, 0, 0, 0);
  return result;
}

function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Status categorisation ───────────────────────────────────────────────────

type LiveBucket = 'scheduled' | 'pendingGrading' | 'overdue' | 'submittedLocked' | 'finalLocked';

function categoriseAssessment(a: Assessment, today: Date): LiveBucket | null {
  switch (a.status) {
    case 'open':
    case 'reopened': {
      const dueDate = parseYmdAsLocal(a.due_date);
      const gradingDeadline = parseYmdAsLocal(a.grading_deadline);
      if (gradingDeadline && today > gradingDeadline) return 'overdue';
      if (dueDate && today >= dueDate) return 'pendingGrading';
      return 'scheduled';
    }
    case 'submitted_locked':
    case 'unlock_requested':
      return 'submittedLocked';
    case 'final_locked':
    case 'locked':
      return 'finalLocked';
    case 'draft':
    case 'closed':
    default:
      return null;
  }
}

// ─── Small UI helpers ────────────────────────────────────────────────────────

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-4 w-4 text-success-text" />
  ) : (
    <XCircle className="h-4 w-4 text-danger-text" />
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-secondary" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
        ))}
      </div>
      <div className="h-32 animate-pulse rounded-2xl bg-surface-secondary" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="h-80 animate-pulse rounded-2xl bg-surface-secondary lg:col-span-3" />
        <div className="h-80 animate-pulse rounded-2xl bg-surface-secondary lg:col-span-2" />
      </div>
    </div>
  );
}

// Tone wrapper around StatCard for KPI visual weight
function KpiCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'info' | 'warning' | 'danger' | 'success';
  icon?: React.ElementType;
}) {
  const toneClasses: Record<typeof tone, string> = {
    neutral: 'border-border',
    info: 'border-info-text/30 bg-info-fill/40',
    warning: value > 0 ? 'border-warning-text/40 bg-warning-fill/40' : 'border-border',
    danger: value > 0 ? 'border-danger-text/40 bg-danger-fill/40' : 'border-border',
    success: 'border-success-text/30 bg-success-fill/30',
  };
  return (
    <div className="relative">
      <StatCard label={label} value={value} className={cn(toneClasses[tone], 'pe-10')} />
      {Icon && (
        <Icon
          className={cn(
            'pointer-events-none absolute end-3 top-3 h-5 w-5',
            tone === 'info' && 'text-info-text/60',
            tone === 'warning' && (value > 0 ? 'text-warning-text/70' : 'text-text-tertiary/40'),
            tone === 'danger' && (value > 0 ? 'text-danger-text/70' : 'text-text-tertiary/40'),
            tone === 'success' && 'text-success-text/60',
            tone === 'neutral' && 'text-text-tertiary/50',
          )}
        />
      )}
    </div>
  );
}

// ─── Config quick-access card ───────────────────────────────────────────────

function ConfigCard({
  href,
  icon: Icon,
  title,
  description,
  primaryLabel,
  secondaryLabel,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
  primaryLabel: string;
  secondaryLabel?: string | null;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary-300"
    >
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700 transition-colors group-hover:bg-primary-100">
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-end">
          <p className="font-mono text-lg font-semibold text-text-primary">{primaryLabel}</p>
          {secondaryLabel && (
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              {secondaryLabel}
            </p>
          )}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="mt-0.5 text-xs text-text-secondary">{description}</p>
      </div>
    </Link>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function LeadershipDashboard() {
  const t = useTranslations('teacherAssessments');

  const [allocations, setAllocations] = React.useState<Allocation[]>([]);
  const [assessments, setAssessments] = React.useState<Assessment[]>([]);
  const [configCounts, setConfigCounts] = React.useState<ConfigCounts>({
    categories: 0,
    approvedCategories: 0,
    pendingCategories: 0,
    weights: 0,
    approvedWeights: 0,
    pendingWeights: 0,
    rubrics: 0,
    standards: 0,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch allocations (school-wide) and config counts in parallel
      const [allocationsRes, categoriesRes, weightsRes, rubricsRes, standardsRes] =
        await Promise.all([
          apiClient<{ data: Allocation[] }>('/api/v1/gradebook/teaching-allocations/all', {
            silent: true,
          }).catch(() => ({ data: [] })),
          apiClient<PaginatedResponse<{ id: string; status: string }>>(
            '/api/v1/gradebook/assessment-categories?pageSize=100',
            { silent: true },
          ).catch(() => ({ data: [], meta: { page: 1, pageSize: 100, total: 0 } })),
          apiClient<PaginatedResponse<{ id: string; status: string }>>(
            '/api/v1/gradebook/teacher-grading-weights?pageSize=100',
            { silent: true },
          ).catch(() => ({ data: [], meta: { page: 1, pageSize: 100, total: 0 } })),
          apiClient<PaginatedResponse<{ id: string }>>(
            '/api/v1/gradebook/rubric-templates?page=1&pageSize=1',
            { silent: true },
          ).catch(() => ({ data: [], meta: { page: 1, pageSize: 1, total: 0 } })),
          apiClient<PaginatedResponse<{ id: string }>>(
            '/api/v1/gradebook/curriculum-standards?page=1&pageSize=1',
            { silent: true },
          ).catch(() => ({ data: [], meta: { page: 1, pageSize: 1, total: 0 } })),
        ]);

      setAllocations(allocationsRes.data);

      // Paginate through all non-cancelled assessments
      const PAGE_SIZE = 100;
      const firstPage = await apiClient<PaginatedResponse<Assessment>>(
        `/api/v1/gradebook/assessments?page=1&pageSize=${PAGE_SIZE}&exclude_cancelled=true`,
      );
      const all: Assessment[] = [...firstPage.data];
      const totalPages = Math.max(1, Math.ceil(firstPage.meta.total / PAGE_SIZE));
      if (totalPages > 1) {
        const remainingPages = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, i) =>
            apiClient<PaginatedResponse<Assessment>>(
              `/api/v1/gradebook/assessments?page=${i + 2}&pageSize=${PAGE_SIZE}&exclude_cancelled=true`,
            ),
          ),
        );
        for (const p of remainingPages) all.push(...p.data);
      }
      setAssessments(all);

      // Config counts
      const approvedCats = categoriesRes.data.filter((c) => c.status === 'approved').length;
      const pendingCats = categoriesRes.data.filter((c) => c.status === 'pending_approval').length;
      const approvedWts = weightsRes.data.filter((w) => w.status === 'approved').length;
      const pendingWts = weightsRes.data.filter((w) => w.status === 'pending_approval').length;

      setConfigCounts({
        categories: categoriesRes.meta?.total ?? categoriesRes.data.length,
        approvedCategories: approvedCats,
        pendingCategories: pendingCats,
        weights: weightsRes.meta?.total ?? weightsRes.data.length,
        approvedWeights: approvedWts,
        pendingWeights: pendingWts,
        rubrics: rubricsRes.meta?.total ?? rubricsRes.data.length,
        standards: standardsRes.meta?.total ?? standardsRes.data.length,
      });
    } catch (err) {
      console.error('[LeadershipDashboard.fetchData]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData, refreshKey]);

  // ─── Derived data ─────────────────────────────────────────────────────────

  const today = React.useMemo(() => startOfToday(), []);

  // class+subject → teacher_name lookup (first primary teacher if multiple)
  const teacherByClassSubject = React.useMemo(() => {
    const map = new Map<string, { staff_profile_id: string; teacher_name: string }>();
    for (const a of allocations) {
      const key = `${a.class_id}:${a.subject_id}`;
      // Prefer primary teachers when multiple exist
      const existing = map.get(key);
      if (!existing || (a.is_primary && !existing)) {
        map.set(key, { staff_profile_id: a.staff_profile_id, teacher_name: a.teacher_name });
      }
    }
    return map;
  }, [allocations]);

  const kpis = React.useMemo<Kpis>(() => {
    const result: Kpis = {
      scheduled: 0,
      pendingGrading: 0,
      overdue: 0,
      submittedLocked: 0,
      finalLocked: 0,
      activeTeachers: 0,
      totalOpen: 0,
      totalLocked: 0,
      totalActive: 0,
    };
    for (const a of assessments) {
      const bucket = categoriseAssessment(a, today);
      if (!bucket) continue;
      result[bucket] += 1;
      if (bucket === 'scheduled' || bucket === 'pendingGrading' || bucket === 'overdue') {
        result.totalOpen += 1;
      }
      if (bucket === 'submittedLocked' || bucket === 'finalLocked') result.totalLocked += 1;
      result.totalActive += 1;
    }
    result.activeTeachers = new Set(allocations.map((a) => a.staff_profile_id)).size;
    return result;
  }, [assessments, allocations, today]);

  const teachersNeedingAttention = React.useMemo<TeacherAttention[]>(() => {
    const byTeacher = new Map<string, TeacherAttention>();
    for (const a of assessments) {
      const bucket = categoriseAssessment(a, today);
      if (bucket !== 'overdue' && bucket !== 'pendingGrading' && bucket !== 'scheduled') {
        continue;
      }
      const key = `${a.class_id}:${a.subject_id}`;
      const teacher = teacherByClassSubject.get(key);
      if (!teacher) continue;
      let row = byTeacher.get(teacher.staff_profile_id);
      if (!row) {
        row = {
          staff_profile_id: teacher.staff_profile_id,
          teacher_name: teacher.teacher_name,
          overdue: 0,
          pendingGrading: 0,
          scheduled: 0,
          oldestOverdueDays: null,
        };
        byTeacher.set(teacher.staff_profile_id, row);
      }
      if (bucket === 'overdue') {
        row.overdue += 1;
        const deadline = parseYmdAsLocal(a.grading_deadline);
        if (deadline) {
          const days = daysBetween(deadline, today);
          if (row.oldestOverdueDays == null || days > row.oldestOverdueDays) {
            row.oldestOverdueDays = days;
          }
        }
      } else if (bucket === 'pendingGrading') {
        row.pendingGrading += 1;
      } else {
        row.scheduled += 1;
      }
    }
    return [...byTeacher.values()]
      .filter((r) => r.overdue > 0 || r.pendingGrading > 0)
      .sort((a, b) => {
        if (b.overdue !== a.overdue) return b.overdue - a.overdue;
        if ((b.oldestOverdueDays ?? 0) !== (a.oldestOverdueDays ?? 0)) {
          return (b.oldestOverdueDays ?? 0) - (a.oldestOverdueDays ?? 0);
        }
        return b.pendingGrading - a.pendingGrading;
      });
  }, [assessments, teacherByClassSubject, today]);

  const subjectActivity = React.useMemo<SubjectActivity[]>(() => {
    const map = new Map<string, SubjectActivity>();
    for (const a of assessments) {
      const bucket = categoriseAssessment(a, today);
      if (!bucket) continue;
      const subjectId = a.subject?.id ?? a.subject_id;
      const subjectName = a.subject?.name ?? '—';
      let row = map.get(subjectId);
      if (!row) {
        row = {
          subject_id: subjectId,
          subject_name: subjectName,
          scheduled: 0,
          pendingGrading: 0,
          overdue: 0,
          submittedLocked: 0,
          finalLocked: 0,
          total: 0,
        };
        map.set(subjectId, row);
      }
      row[bucket] += 1;
      row.total += 1;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [assessments, today]);

  const classConfigHealth = React.useMemo(() => {
    // Collapse to one row per class, reporting missing items
    interface Row {
      class_id: string;
      class_name: string;
      total: number;
      missing_grade_config: number;
      missing_categories: number;
      missing_weights: number;
    }
    const map = new Map<string, Row>();
    for (const a of allocations) {
      let row = map.get(a.class_id);
      if (!row) {
        row = {
          class_id: a.class_id,
          class_name: a.class_name,
          total: 0,
          missing_grade_config: 0,
          missing_categories: 0,
          missing_weights: 0,
        };
        map.set(a.class_id, row);
      }
      row.total += 1;
      if (!a.has_grade_config) row.missing_grade_config += 1;
      if (a.has_approved_categories === 0) row.missing_categories += 1;
      if (!a.has_approved_weights) row.missing_weights += 1;
    }
    return [...map.values()]
      .filter(
        (r) => r.missing_grade_config > 0 || r.missing_categories > 0 || r.missing_weights > 0,
      )
      .sort((a, b) => {
        const aMiss = a.missing_grade_config + a.missing_categories + a.missing_weights;
        const bMiss = b.missing_grade_config + b.missing_categories + b.missing_weights;
        return bMiss - aMiss;
      });
  }, [allocations]);

  const classesWithGaps = classConfigHealth.length;
  const totalClasses = new Set(allocations.map((a) => a.class_id)).size;

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Assessment Oversight"
          description="School-wide assessment activity, teacher grading progress, approvals, and configuration health."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="shrink-0"
        >
          <RefreshCw className="me-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* KPI strip — 6 tone-coded cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Scheduled" value={kpis.scheduled} tone="info" icon={Clock} />
        <KpiCard
          label="Pending Grading"
          value={kpis.pendingGrading}
          tone="warning"
          icon={ClipboardList}
        />
        <KpiCard label="Overdue" value={kpis.overdue} tone="danger" icon={AlertTriangle} />
        <KpiCard
          label="Submitted"
          value={kpis.submittedLocked}
          tone="success"
          icon={CheckCircle2}
        />
        <KpiCard label="Final Locked" value={kpis.finalLocked} tone="neutral" icon={Sparkles} />
        <KpiCard label="Active Teachers" value={kpis.activeTeachers} tone="neutral" icon={Users} />
      </div>

      {/* Approvals Action Queue (reuses existing InlineApprovalQueue) */}
      <div>
        <InlineApprovalQueue />
      </div>

      {/* Two-column split — teachers + config health */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Teachers Needing Attention */}
        <section className="lg:col-span-3 rounded-2xl border border-border bg-surface overflow-hidden">
          <header className="flex items-center justify-between border-b border-border bg-surface-secondary/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning-text" />
              <h2 className="text-sm font-semibold text-text-primary">
                Teachers needing attention
              </h2>
            </div>
            <span className="text-[11px] font-medium text-text-tertiary">
              {teachersNeedingAttention.length} teacher
              {teachersNeedingAttention.length === 1 ? '' : 's'}
            </span>
          </header>
          {teachersNeedingAttention.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-success-text" />
              <p className="text-sm text-text-secondary">
                Every teacher is on top of their grading. Nothing overdue.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary/30">
                    <th className="px-4 py-2 text-start text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Teacher
                    </th>
                    <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Overdue
                    </th>
                    <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Pending
                    </th>
                    <th className="hidden sm:table-cell px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Scheduled
                    </th>
                    <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Oldest overdue
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teachersNeedingAttention.map((row) => (
                    <tr
                      key={row.staff_profile_id}
                      className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary/40"
                    >
                      <td className="px-4 py-2.5 text-sm font-medium text-text-primary">
                        {row.teacher_name || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-end">
                        <span
                          className={cn(
                            'inline-flex min-w-[1.75rem] items-center justify-center rounded-md px-1.5 font-mono text-sm font-semibold',
                            row.overdue > 0
                              ? 'bg-danger-fill text-danger-text'
                              : 'text-text-tertiary',
                          )}
                        >
                          {row.overdue}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-end">
                        <span
                          className={cn(
                            'inline-flex min-w-[1.75rem] items-center justify-center rounded-md px-1.5 font-mono text-sm font-semibold',
                            row.pendingGrading > 0
                              ? 'bg-warning-fill text-warning-text'
                              : 'text-text-tertiary',
                          )}
                        >
                          {row.pendingGrading}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell px-3 py-2.5 text-end font-mono text-sm text-text-secondary">
                        {row.scheduled}
                      </td>
                      <td className="px-3 py-2.5 text-end text-sm">
                        {row.oldestOverdueDays != null && row.oldestOverdueDays > 0 ? (
                          <span className="font-mono text-danger-text">
                            {row.oldestOverdueDays}d
                          </span>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Class Config Health */}
        <section className="lg:col-span-2 rounded-2xl border border-border bg-surface overflow-hidden">
          <header className="flex items-center justify-between border-b border-border bg-surface-secondary/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-info-text" />
              <h2 className="text-sm font-semibold text-text-primary">Config health</h2>
            </div>
            <span className="text-[11px] font-medium text-text-tertiary">
              {totalClasses - classesWithGaps}/{totalClasses} ready
            </span>
          </header>
          {classesWithGaps === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-success-text" />
              <p className="text-sm text-text-secondary">
                Every class has grade config, categories, and weights approved.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary/30">
                    <th className="px-4 py-2 text-start text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Class
                    </th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Config
                    </th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Categories
                    </th>
                    <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                      Weights
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {classConfigHealth.map((row) => (
                    <tr
                      key={row.class_id}
                      className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary/40"
                    >
                      <td className="px-4 py-2.5 text-sm font-medium text-text-primary">
                        {row.class_name}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusIcon ok={row.missing_grade_config === 0} />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusIcon ok={row.missing_categories === 0} />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <StatusIcon ok={row.missing_weights === 0} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Subject Activity Table */}
      <section className="rounded-2xl border border-border bg-surface overflow-hidden">
        <header className="flex items-center justify-between border-b border-border bg-surface-secondary/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary-600" />
            <h2 className="text-sm font-semibold text-text-primary">Activity by subject</h2>
          </div>
          <span className="text-[11px] font-medium text-text-tertiary">
            {subjectActivity.length} subject{subjectActivity.length === 1 ? '' : 's'} ·{' '}
            {kpis.totalActive} active assessment{kpis.totalActive === 1 ? '' : 's'}
          </span>
        </header>
        {subjectActivity.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-tertiary">
            No active assessments across the school.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-secondary/30">
                  <th className="px-4 py-2 text-start text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Subject
                  </th>
                  <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Scheduled
                  </th>
                  <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Pending
                  </th>
                  <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Overdue
                  </th>
                  <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Submitted
                  </th>
                  <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Final
                  </th>
                  <th className="px-3 py-2 text-end text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {subjectActivity.map((row) => (
                  <tr
                    key={row.subject_id}
                    className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary/40"
                  >
                    <td className="px-4 py-2.5 text-sm font-medium text-text-primary">
                      {row.subject_name}
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-sm text-info-text">
                      {row.scheduled || <span className="text-text-tertiary">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-sm">
                      {row.pendingGrading > 0 ? (
                        <span className="text-warning-text">{row.pendingGrading}</span>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-sm">
                      {row.overdue > 0 ? (
                        <span className="text-danger-text">{row.overdue}</span>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-sm text-success-text">
                      {row.submittedLocked || <span className="text-text-tertiary">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-sm text-text-secondary">
                      {row.finalLocked || <span className="text-text-tertiary">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-sm font-semibold text-text-primary">
                      {row.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Configuration quick-access */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-text-primary">{t('configSection')}</h2>
          <span className="text-xs text-text-tertiary">
            Reusable building blocks teachers draw from when creating assessments
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ConfigCard
            href="/assessments/categories"
            icon={BookOpen}
            title={t('configCategoriesTitle')}
            description={t('configCategoriesDesc')}
            primaryLabel={`${configCounts.approvedCategories}/${configCounts.categories}`}
            secondaryLabel={
              configCounts.pendingCategories > 0
                ? `${configCounts.pendingCategories} pending`
                : 'Approved'
            }
          />
          <ConfigCard
            href="/assessments/grading-weights"
            icon={Scale}
            title={t('configWeightsTitle')}
            description={t('configWeightsDesc')}
            primaryLabel={`${configCounts.approvedWeights}/${configCounts.weights}`}
            secondaryLabel={
              configCounts.pendingWeights > 0
                ? `${configCounts.pendingWeights} pending`
                : 'Approved'
            }
          />
          <ConfigCard
            href="/assessments/rubric-templates"
            icon={ClipboardList}
            title={t('configRubricsTitle')}
            description={t('configRubricsDesc')}
            primaryLabel={String(configCounts.rubrics)}
            secondaryLabel="Templates"
          />
          <ConfigCard
            href="/assessments/curriculum-standards"
            icon={Target}
            title={t('configStandardsTitle')}
            description={t('configStandardsDesc')}
            primaryLabel={String(configCounts.standards)}
            secondaryLabel="Standards"
          />
        </div>
      </section>

      {/* Jump-off row — deep links to related tools */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">Jump to</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/assessments/approvals"
            className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary-300"
          >
            <div>
              <p className="text-sm font-medium text-text-primary">Approvals queue</p>
              <p className="text-xs text-text-secondary">
                Review pending categories, weights, and unlock requests
              </p>
            </div>
            <ExternalLink className="h-4 w-4 text-text-tertiary" />
          </Link>
          <Link
            href="/curriculum-matrix"
            className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary-300"
          >
            <div>
              <p className="text-sm font-medium text-text-primary">Curriculum matrix</p>
              <p className="text-xs text-text-secondary">Class × subject teaching coverage</p>
            </div>
            <ExternalLink className="h-4 w-4 text-text-tertiary" />
          </Link>
          <Link
            href="/gradebook"
            className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary-300"
          >
            <div>
              <p className="text-sm font-medium text-text-primary">Gradebook</p>
              <p className="text-xs text-text-secondary">Browse classes, assessments and grades</p>
            </div>
            <ExternalLink className="h-4 w-4 text-text-tertiary" />
          </Link>
          <Link
            href="/analytics"
            className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary-300"
          >
            <div>
              <p className="text-sm font-medium text-text-primary">Grade analytics</p>
              <p className="text-xs text-text-secondary">
                Class overview, subject deep dive, student profile
              </p>
            </div>
            <ExternalLink className="h-4 w-4 text-text-tertiary" />
          </Link>
        </div>
      </section>
    </div>
  );
}
