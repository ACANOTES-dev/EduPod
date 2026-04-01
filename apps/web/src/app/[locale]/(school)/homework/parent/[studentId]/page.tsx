'use client';

import { Calendar, CheckCircle, Circle, Clock, List } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { ParentHomeworkCalendar } from '../_components/parent-homework-calendar';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  homework_type: string;
  due_date: string;
  due_time: string | null;
  max_points: number | null;
  subject: { id: string; name: string } | null;
  class_entity: { id: string; name: string };
  completion: {
    status: string;
    completed_at: string | null;
    points_awarded: number | null;
  } | null;
}

interface SummaryData {
  total_assigned: number;
  completed: number;
  in_progress: number;
  overdue: number;
  completion_rate: number;
  recent: Assignment[];
}

interface StudentHomework {
  student: { id: string; first_name: string; last_name: string };
  assignments: Assignment[];
}

// ─── Type badge colours ──────────────────────────────────────────────────────

const TYPE_COLOURS: Record<string, string> = {
  written: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  reading: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  research: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  revision: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  project_work: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  online_activity: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChildHomeworkDetailPage() {
  const t = useTranslations('homework');
  const params = useParams<{ studentId: string }>();
  const studentId = params?.studentId ?? '';

  const [summary, setSummary] = React.useState<SummaryData | null>(null);
  const [allAssignments, setAllAssignments] = React.useState<Assignment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [viewMode, setViewMode] = React.useState<'list' | 'calendar'>('list');
  const [filterSubject, setFilterSubject] = React.useState<string>('all');
  const [filterType, setFilterType] = React.useState<string>('all');
  const [filterStatus, setFilterStatus] = React.useState<string>('all');

  // Calendar month/year state
  const now = new Date();
  const [calMonth, setCalMonth] = React.useState(now.getMonth());
  const [calYear, setCalYear] = React.useState(now.getFullYear());

  // ─── Data fetching ──────────────────────────────────────────────────────

  React.useEffect(() => {
    if (!studentId) return;
    setLoading(true);

    Promise.all([
      apiClient<{ data: SummaryData }>(`/api/v1/parent/homework/${studentId}/summary`),
      apiClient<{ data: StudentHomework[]; meta: { total: number } }>(
        '/api/v1/parent/homework?page=1&pageSize=100',
      ),
    ])
      .then(([summaryRes, listRes]) => {
        setSummary(summaryRes.data);
        // Extract assignments for this student
        const studentEntry = (listRes.data ?? []).find((s) => s.student.id === studentId);
        setAllAssignments(studentEntry?.assignments ?? summaryRes.data.recent ?? []);
      })
      .catch(() => console.error('[ChildHomeworkDetail] Failed to load data'))
      .finally(() => setLoading(false));
  }, [studentId]);

  // ─── Filter logic ─────────────────────────────────────────────────────────

  const subjects = React.useMemo(() => {
    const set = new Map<string, string>();
    for (const a of allAssignments) {
      if (a.subject) set.set(a.subject.id, a.subject.name);
    }
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [allAssignments]);

  const types = React.useMemo(() => {
    const set = new Set<string>();
    for (const a of allAssignments) set.add(a.homework_type);
    return Array.from(set);
  }, [allAssignments]);

  const filtered = React.useMemo(() => {
    return allAssignments.filter((a) => {
      if (filterSubject !== 'all' && a.subject?.id !== filterSubject) return false;
      if (filterType !== 'all' && a.homework_type !== filterType) return false;
      if (filterStatus !== 'all') {
        const status = a.completion?.status ?? 'not_started';
        if (filterStatus !== status) return false;
      }
      return true;
    });
  }, [allAssignments, filterSubject, filterType, filterStatus]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('parent.detail.title')} />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('parent.detail.title')} />

      {/* Stats strip */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label={t('parent.detail.totalAssigned')} value={summary.total_assigned} />
          <StatCard
            label={t('parent.detail.completed')}
            value={summary.completed}
            colour="text-green-600"
          />
          <StatCard
            label={t('parent.detail.inProgress')}
            value={summary.in_progress}
            colour="text-amber-500"
          />
          <StatCard
            label={t('parent.detail.overdue')}
            value={summary.overdue}
            colour="text-destructive"
          />
          <StatCard
            label={t('parent.detail.completionRate')}
            value={`${summary.completion_rate}%`}
            colour="text-primary-600"
          />
        </div>
      )}

      {/* Filter bar + view toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {/* Subject filter */}
          <Select value={filterSubject} onValueChange={setFilterSubject}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder={t('parent.detail.filterBySubject')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('parent.detail.allSubjects')}</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Type filter */}
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder={t('parent.detail.filterByType')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('parent.detail.allTypes')}</SelectItem>
              {types.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`parent.types.${type}` as never)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder={t('parent.detail.filterByStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('parent.detail.allStatuses')}</SelectItem>
              <SelectItem value="completed">{t('parent.completed')}</SelectItem>
              <SelectItem value="in_progress">{t('parent.inProgress')}</SelectItem>
              <SelectItem value="not_started">{t('parent.notStarted')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* View toggle */}
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          <Button
            size="sm"
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            onClick={() => setViewMode('list')}
          >
            <List className="me-1.5 h-4 w-4" />
            {t('parent.detail.listView')}
          </Button>
          <Button
            size="sm"
            variant={viewMode === 'calendar' ? 'default' : 'ghost'}
            onClick={() => setViewMode('calendar')}
          >
            <Calendar className="me-1.5 h-4 w-4" />
            {t('parent.detail.calendarView')}
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'calendar' ? (
        <ParentHomeworkCalendar
          assignments={filtered}
          month={calMonth}
          year={calYear}
          onMonthChange={(m, y) => {
            setCalMonth(m);
            setCalYear(y);
          }}
        />
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-border bg-surface py-8 text-center">
              <p className="text-sm text-text-tertiary">{t('parent.noHomework')}</p>
            </div>
          ) : (
            filtered.map((assignment) => {
              const status = assignment.completion?.status ?? null;
              const typeColour =
                TYPE_COLOURS[assignment.homework_type] ?? 'bg-gray-100 text-gray-700';

              return (
                <div key={assignment.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {status === 'completed' ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : status === 'in_progress' ? (
                        <Clock className="h-5 w-5 text-amber-500" />
                      ) : (
                        <Circle className="h-5 w-5 text-text-tertiary" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium text-text-primary">{assignment.title}</p>
                      {assignment.description && (
                        <p className="text-xs text-text-secondary line-clamp-2">
                          {assignment.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeColour}`}
                        >
                          {t(`parent.types.${assignment.homework_type}` as never)}
                        </span>
                        {assignment.subject && (
                          <Badge variant="secondary" className="text-xs">
                            {assignment.subject.name}
                          </Badge>
                        )}
                        <span className="text-xs text-text-tertiary">
                          {assignment.class_entity.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  colour,
}: {
  label: string;
  value: number | string;
  colour?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-center">
      <p className={`text-2xl font-bold ${colour ?? 'text-text-primary'}`}>{value}</p>
      <p className="mt-0.5 text-xs text-text-tertiary">{label}</p>
    </div>
  );
}
