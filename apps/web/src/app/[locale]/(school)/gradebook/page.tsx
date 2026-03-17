'use client';

import { BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import {
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}

interface AcademicPeriod {
  id: string;
  name: string;
}

interface Assessment {
  id: string;
  title: string;
  class_id: string;
  class_name: string;
  subject_name: string;
  status: string;
  category_name: string;
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
  subject_name: string;
  assessment_count: number;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GradebookPage() {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [academicPeriods, setAcademicPeriods] = React.useState<AcademicPeriod[]>([]);
  const [yearFilter, setYearFilter] = React.useState('all');
  const [periodFilter, setPeriodFilter] = React.useState('all');

  const [classGroups, setClassGroups] = React.useState<ClassGroup[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Load filter options
  React.useEffect(() => {
    apiClient<ListResponse<AcademicYear>>('/api/v1/academic-years?pageSize=50')
      .then((res) => setAcademicYears(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setAcademicPeriods(res.data))
      .catch(() => undefined);
  }, []);

  const fetchAssessments = React.useCallback(
    async (year: string, period: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ pageSize: '500' });
        if (year !== 'all') params.set('academic_year_id', year);
        if (period !== 'all') params.set('academic_period_id', period);
        const res = await apiClient<AssessmentsResponse>(
          `/api/v1/gradebook/assessments?${params.toString()}`,
        );

        // Group by class_id
        const grouped = new Map<string, ClassGroup>();
        for (const a of res.data) {
          const existing = grouped.get(a.class_id);
          if (existing) {
            existing.assessment_count += 1;
          } else {
            grouped.set(a.class_id, {
              class_id: a.class_id,
              class_name: a.class_name,
              subject_name: a.subject_name,
              assessment_count: 1,
            });
          }
        }
        setClassGroups(Array.from(grouped.values()));
      } catch {
        setClassGroups([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchAssessments(yearFilter, periodFilter);
  }, [yearFilter, periodFilter, fetchAssessments]);

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
            <SelectValue placeholder="Academic Period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Periods</SelectItem>
            {academicPeriods.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Classes grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-secondary" />
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
              <p className="text-sm text-text-secondary">{cg.subject_name}</p>
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
