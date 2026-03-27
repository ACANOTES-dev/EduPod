'use client';

import { Badge, Button, StatCard } from '@school/ui';
import { CheckCircle, Clock, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { QuickLogFab } from '@/components/behaviour/quick-log-fab';
import { QuickLogSheet } from '@/components/behaviour/quick-log-sheet';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BehaviourTask {
  id: string;
  title: string;
  description: string | null;
  task_type: string;
  priority: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  assigned_to_user?: { first_name: string; last_name: string } | null;
  entity_type: string;
  entity_id: string;
}

interface TasksResponse {
  data: BehaviourTask[];
  meta: { page: number; pageSize: number; total: number };
}

interface TaskStatsData {
  pending: number;
  overdue: number;
  completed_today: number;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
  overdue: 'bg-red-100 text-red-700',
};

type ViewMode = 'my' | 'all';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BehaviourTasksPage() {
  const t = useTranslations('behaviour.tasks');
  const [tasks, setTasks] = React.useState<BehaviourTask[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);
  const [viewMode, setViewMode] = React.useState<ViewMode>('my');
  const [quickLogOpen, setQuickLogOpen] = React.useState(false);
  const [stats, setStats] = React.useState<TaskStatsData>({ pending: 0, overdue: 0, completed_today: 0 });
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);

  // Fetch stats
  React.useEffect(() => {
    apiClient<{ data: TaskStatsData }>('/api/v1/behaviour/tasks/stats')
      .then((res) => { if (res.data) setStats(res.data); })
      .catch(() => undefined);
  }, []);

  // Fetch tasks
  const fetchTasks = React.useCallback(
    async (p: number, mode: ViewMode) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (mode === 'my') params.set('assigned_to_id', 'me');
        const res = await apiClient<TasksResponse>(`/api/v1/behaviour/tasks?${params.toString()}`);
        setTasks(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      } catch {
        setTasks([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchTasks(page, viewMode);
  }, [page, viewMode, fetchTasks]);

  const handleComplete = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      await apiClient(`/api/v1/behaviour/tasks/${taskId}/complete`, { method: 'POST', body: JSON.stringify({}) });
      void fetchTasks(page, viewMode);
      setStats((prev) => ({
        ...prev,
        pending: Math.max(0, prev.pending - 1),
        completed_today: prev.completed_today + 1,
      }));
    } catch {
      // error toast handled by apiClient
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (taskId: string) => {
    setActionLoading(taskId);
    try {
      await apiClient(`/api/v1/behaviour/tasks/${taskId}/cancel`, { method: 'POST', body: JSON.stringify({ reason: 'Cancelled by user' }) });
      void fetchTasks(page, viewMode);
      setStats((prev) => ({
        ...prev,
        pending: Math.max(0, prev.pending - 1),
      }));
    } catch {
      // error toast handled by apiClient
    } finally {
      setActionLoading(null);
    }
  };

  const isOverdue = (task: BehaviourTask) => {
    if (!task.due_date || task.status === 'completed' || task.status === 'cancelled') return false;
    return new Date(task.due_date) < new Date();
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label={t('statsPending')} value={stats.pending} className="border border-border" />
        <StatCard
          label={t('statsOverdue')}
          value={stats.overdue}
          trend={stats.overdue > 0 ? { direction: 'up', label: t('needsAttention') } : undefined}
          className="border border-border"
        />
        <StatCard label={t('statsCompletedToday')} value={stats.completed_today} className="border border-border" />
      </div>

      {/* View toggle */}
      <div className="flex gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => { setViewMode('my'); setPage(1); }}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            viewMode === 'my'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-text-tertiary hover:text-text-primary'
          }`}
        >
          {t('tabs.myTasks')}
        </button>
        <button
          type="button"
          onClick={() => { setViewMode('all'); setPage(1); }}
          className={`border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            viewMode === 'all'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-text-tertiary hover:text-text-primary'
          }`}
        >
          {t('tabs.allTasks')}
        </button>
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-12 text-center">
          <CheckCircle className="mx-auto h-8 w-8 text-text-tertiary" />
          <p className="mt-2 text-sm text-text-tertiary">{t('noResults')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const overdue = isOverdue(task);
            return (
              <div
                key={task.id}
                className={`rounded-xl border bg-surface p-4 ${
                  overdue ? 'border-red-200' : 'border-border'
                }`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-text-primary">{task.title}</p>
                      <Badge variant="secondary" className={PRIORITY_COLORS[task.priority] ?? ''}>
                        {task.priority}
                      </Badge>
                      <Badge variant="secondary" className={STATUS_COLORS[task.status] ?? ''}>
                        {task.status.replace(/_/g, ' ')}
                      </Badge>
                      {overdue && (
                        <Badge variant="danger" className="bg-red-100 text-red-700">
                          {t('overdue')}
                        </Badge>
                      )}
                    </div>
                    {task.description && (
                      <p className="mt-1 text-xs text-text-secondary line-clamp-2">{task.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                      <span className="capitalize">{task.task_type.replace(/_/g, ' ')}</span>
                      {task.due_date && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {t('due')}: {formatDate(task.due_date)}
                        </span>
                      )}
                      {task.assigned_to_user && (
                        <span>
                          {t('assigned')}: {task.assigned_to_user.first_name} {task.assigned_to_user.last_name}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {(task.status === 'pending' || task.status === 'in_progress' || task.status === 'overdue') && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleComplete(task.id)}
                        disabled={actionLoading === task.id}
                        className="text-green-700 hover:text-green-800"
                      >
                        <CheckCircle className="me-1 h-3.5 w-3.5" />
                        {t('complete')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancel(task.id)}
                        disabled={actionLoading === task.id}
                        className="text-text-tertiary hover:text-red-600"
                      >
                        <XCircle className="me-1 h-3.5 w-3.5" />
                        {t('cancel')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <span>
            {t('showing', { from: (page - 1) * PAGE_SIZE + 1, to: Math.min(page * PAGE_SIZE, total), total })}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t('previous')}
            </Button>
            <span className="flex items-center px-2 text-sm text-text-primary">
              {page} / {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              {t('next')}
            </Button>
          </div>
        </div>
      )}

      <QuickLogFab onClick={() => setQuickLogOpen(true)} />
      <QuickLogSheet open={quickLogOpen} onOpenChange={setQuickLogOpen} />
    </div>
  );
}
