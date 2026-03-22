'use client';

import {
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@school/ui';
import { BookOpen } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
}

interface Assessment {
  id: string;
  title: string;
  class_id: string;
  class_name?: string;
  class_entity?: { id: string; name: string };
  subject?: { id: string; name: string; code?: string };
  status: string;
  max_score: number;
  due_date: string | null;
}

interface AssessmentsResponse {
  data: Assessment[];
  meta: { page: number; pageSize: number; total: number };
}

interface ListResponse<T> {
  data: T[];
}

interface ClassGroup {
  class_id: string;
  class_name: string;
  assessment_count: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GradebookPage() {
  const t = useTranslations('gradebook');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [academicYears, setAcademicYears] = React.useState<SelectOption[]>([]);
  const [academicPeriods, setAcademicPeriods] = React.useState<SelectOption[]>([]);
  const [classes, setClasses] = React.useState<SelectOption[]>([]);
  const [subjects, setSubjects] = React.useState<SelectOption[]>([]);

  const [yearFilter, setYearFilter] = React.useState('all');
  const [periodFilter, setPeriodFilter] = React.useState('all');
  const [classFilter, setClassFilter] = React.useState('all');
  const [subjectFilter, setSubjectFilter] = React.useState('all');

  const [classGroups, setClassGroups] = React.useState<ClassGroup[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Load filter options
  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/academic-years?pageSize=50')
      .then((res) => setAcademicYears(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<SelectOption>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setAcademicPeriods(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<SelectOption>>('/api/v1/classes?pageSize=100')
      .then((res) => setClasses(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<SelectOption>>('/api/v1/subjects?pageSize=100&subject_type=academic')
      .then((res) => setSubjects(res.data))
      .catch(() => undefined);
  }, []);

  const fetchAssessments = React.useCallback(
    async (year: string, period: string, classId: string, subjectId: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ pageSize: '200' });
        if (year !== 'all') params.set('academic_year_id', year);
        if (period !== 'all') params.set('academic_period_id', period);
        if (classId !== 'all') params.set('class_id', classId);
        if (subjectId !== 'all') params.set('subject_id', subjectId);
        const res = await apiClient<AssessmentsResponse>(
          `/api/v1/gradebook/assessments?${params.toString()}`,
        );

        // Group by class_id — one card per class, no subject-level grouping
        const grouped = new Map<string, ClassGroup>();
        const assessments = Array.isArray(res.data) ? res.data : [];
        for (const a of assessments) {
          if (!a.class_id) continue;
          const existing = grouped.get(a.class_id);
          if (existing) {
            existing.assessment_count += 1;
          } else {
            grouped.set(a.class_id, {
              class_id: a.class_id,
              class_name: a.class_name ?? a.class_entity?.name ?? '—',
              assessment_count: 1,
            });
          }
        }
        // Sort by class name
        setClassGroups(
          Array.from(grouped.values()).sort((a, b) => a.class_name.localeCompare(b.class_name)),
        );
      } catch {
        setClassGroups([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchAssessments(yearFilter, periodFilter, classFilter, subjectFilter);
  }, [yearFilter, periodFilter, classFilter, subjectFilter, fetchAssessments]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Academic Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {academicYears.map((y) => (
              <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('period')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Periods</SelectItem>
            {academicPeriods.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={classFilter} onValueChange={setClassFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classes</SelectItem>
            {classes.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t('subject')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subjects</SelectItem>
            {subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Classes grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : classGroups.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={t('noClasses')}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classGroups.map((cg) => (
            <button
              key={cg.class_id}
              onClick={() => router.push(`/${locale}/gradebook/${cg.class_id}`)}
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5 text-start transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <h3 className="text-sm font-semibold text-text-primary">
                {cg.class_name}
              </h3>
              <StatusBadge status="info">
                {cg.assessment_count} {t('assessments')}
              </StatusBadge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
