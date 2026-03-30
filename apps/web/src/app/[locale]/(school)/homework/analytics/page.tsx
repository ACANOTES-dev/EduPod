'use client';

import { EmptyState, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatCard } from '@school/ui';
import { BookOpen, Filter, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompletionRate {
  class_id: string;
  class_name: string;
  subject_id: string | null;
  subject_name: string | null;
  total_assignments: number;
  total_completions: number;
  total_possible: number;
  completion_rate: number;
}

interface NonCompleter {
  student_id: string;
  student_name: string;
  class_name: string;
  uncompleted_count: number;
  total_assigned: number;
  completion_rate: number;
}

interface ClassOption {
  id: string;
  name: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#94a3b8', '#8b5cf6'];

export default function HomeworkAnalyticsPage() {
  const t = useTranslations('homework');
  const [loading, setLoading] = React.useState(true);
  const [completionData, setCompletionData] = React.useState<CompletionRate[]>([]);
  const [nonCompleters, setNonCompleters] = React.useState<NonCompleter[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [selectedClass, setSelectedClass] = React.useState('');

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      // Fetch classes for filter
      const classesRes = await apiClient<{ data: ClassOption[] }>('/api/v1/classes', {
        silent: true,
      });
      setClasses(classesRes.data ?? []);

      // Fetch completion rates
      const params = selectedClass ? `?class_id=${selectedClass}` : '';
      const completionRes = await apiClient<{ data: CompletionRate[] }>(
        `/api/v1/homework/analytics/completion-rates${params}`,
        { silent: true },
      );
      setCompletionData(completionRes.data ?? []);

      // Fetch non-completers
      const nonCompletersRes = await apiClient<{ data: NonCompleter[] }>(
        `/api/v1/homework/analytics/non-completers${params}`,
        { silent: true },
      );
      setNonCompleters(nonCompletersRes.data ?? []);
    } catch {
      console.error('[Analytics] Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [selectedClass]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Aggregate data by class
  const byClass = React.useMemo(() => {
    const map = new Map<string, { name: string; rate: number; assignments: number }>();
    for (const item of completionData) {
      const existing = map.get(item.class_id);
      if (existing) {
        existing.rate = (existing.rate + item.completion_rate) / 2;
        existing.assignments += item.total_assignments;
      } else {
        map.set(item.class_id, {
          name: item.class_name,
          rate: item.completion_rate,
          assignments: item.total_assignments,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.rate - a.rate);
  }, [completionData]);

  // Aggregate by subject
  const bySubject = React.useMemo(() => {
    const map = new Map<string, { name: string; rate: number; count: number }>();
    for (const item of completionData) {
      if (!item.subject_name) continue;
      const existing = map.get(item.subject_name);
      if (existing) {
        existing.rate =
          (existing.rate * existing.count + item.completion_rate) / (existing.count + 1);
        existing.count += 1;
      } else {
        map.set(item.subject_name, {
          name: item.subject_name,
          rate: item.completion_rate,
          count: 1,
        });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 6);
  }, [completionData]);

  // Calculate overall stats
  const overallRate = React.useMemo(() => {
    if (completionData.length === 0) return 0;
    const total = completionData.reduce((sum, item) => sum + item.completion_rate, 0);
    return Math.round(total / completionData.length);
  }, [completionData]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('analytics.title')} />

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 text-text-tertiary" />
        <Select value={selectedClass || 'all'} onValueChange={(v) => setSelectedClass(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-48"><SelectValue placeholder={t('filterAll')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filterAll')}</SelectItem>
            {classes.map((cls) => (
              <SelectItem key={cls.id} value={cls.id}>
                {cls.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label={t('analytics.completionRate')}
          value={`${overallRate}%`}
          trend={overallRate > 80 ? { direction: 'up', label: `${overallRate}%` } : overallRate < 60 ? { direction: 'down', label: `${overallRate}%` } : undefined}
        />
        <StatCard label={t('analytics.nonCompleters')} value={nonCompleters.length.toString()} />
        <StatCard label={t('thisWeek')} value={completionData.length.toString()} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Completion by Class */}
        <div className="rounded-2xl bg-surface p-6">
          <h3 className="mb-4 text-base font-semibold text-text-primary">
            {t('analytics.byClass')}
          </h3>
          {loading ? (
            <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
          ) : byClass.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byClass} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" domain={[0, 100]} unit="%" />
                  <YAxis type="category" dataKey="name" width={100} />
                  <Tooltip
                    formatter={(value: unknown) => [`${value}%`, t('completionRate')]}
                  />
                  <Bar dataKey="rate" fill="#22c55e" radius={[0, 4, 4, 0]}>
                    {byClass.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon={BookOpen} title="No data" description="" />
          )}
        </div>

        {/* Completion by Subject */}
        <div className="rounded-2xl bg-surface p-6">
          <h3 className="mb-4 text-base font-semibold text-text-primary">
            {t('analytics.bySubject')}
          </h3>
          {loading ? (
            <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
          ) : bySubject.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={bySubject}
                    dataKey="rate"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    label={false}
                  >
                    {bySubject.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown) => [`${value}%`, t('completionRate')]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon={BookOpen} title="No data" description="" />
          )}
        </div>
      </div>

      {/* Non-Completers Table */}
      <div className="rounded-2xl bg-surface p-6">
        <h3 className="mb-4 text-base font-semibold text-text-primary">
          {t('analytics.nonCompleters')}
        </h3>
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-secondary" />
            ))}
          </div>
        ) : nonCompleters.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-tertiary">
                  <th className="py-2 pe-4 text-start">{t('student')}</th>
                  <th className="py-2 pe-4 text-start">{t('class')}</th>
                  <th className="py-2 pe-4 text-end">{t('analytics.completionRate')}</th>
                  <th className="py-2 pe-4 text-end">Uncompleted</th>
                </tr>
              </thead>
              <tbody>
                {nonCompleters.slice(0, 10).map((student) => (
                  <tr key={student.student_id} className="border-b border-border/50">
                    <td className="py-3 pe-4">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-text-tertiary" />
                        <span className="font-medium text-text-primary">
                          {student.student_name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pe-4 text-text-secondary">{student.class_name}</td>
                    <td className="py-3 pe-4 text-end">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          student.completion_rate < 50
                            ? 'bg-red-100 text-red-700'
                            : student.completion_rate < 75
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {Math.round(student.completion_rate)}%
                      </span>
                    </td>
                    <td className="py-3 pe-4 text-end text-text-secondary">
                      {student.uncompleted_count}/{student.total_assigned}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No non-completers"
            description="All students are on track!"
          />
        )}
      </div>
    </div>
  );
}
