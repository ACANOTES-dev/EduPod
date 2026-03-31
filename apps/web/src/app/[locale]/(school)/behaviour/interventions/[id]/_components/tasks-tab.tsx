'use client';

import { Badge } from '@school/ui';
import { useTranslations } from 'next-intl';

import type { TaskEntry } from './intervention-types';

import { formatDate } from '@/lib/format-date';


// ─── Props ───────────────────────────────────────────────────────────────────

interface TasksTabProps {
  tasks: TaskEntry[];
  tasksLoading: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function TasksTab({ tasks, tasksLoading }: TasksTabProps) {
  const t = useTranslations('behaviour.interventionDetail');

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-text-primary">Related Tasks ({tasks.length})</h3>

      {tasksLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-tertiary">{t('noTasks')}</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{task.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                  {task.assigned_to_user && (
                    <span>
                      {task.assigned_to_user.first_name} {task.assigned_to_user.last_name}
                    </span>
                  )}
                  {task.due_date && <span>Due: {formatDate(task.due_date)}</span>}
                </div>
              </div>
              <Badge
                variant="secondary"
                className={`shrink-0 text-xs capitalize ${
                  task.status === 'completed'
                    ? 'bg-green-100 text-green-700'
                    : task.status === 'overdue'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-blue-100 text-blue-700'
                }`}
              >
                {task.status.replace(/_/g, ' ')}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
