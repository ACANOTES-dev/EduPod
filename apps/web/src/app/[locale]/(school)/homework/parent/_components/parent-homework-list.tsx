'use client';

import { CheckCircle, Circle, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge } from '@school/ui';

import { ParentCompletionToggle } from './parent-completion-toggle';

import { formatDate } from '@/lib/format-date';

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

interface ParentHomeworkListProps {
  assignments: Assignment[];
  onMarkDone?: (assignmentId: string) => void;
  showCompletionToggle?: boolean;
  markingId?: string | null;
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

// ─── Component ────────────────────────────────────────────────────────────────

export function ParentHomeworkList({
  assignments,
  onMarkDone,
  showCompletionToggle,
  markingId,
}: ParentHomeworkListProps) {
  const t = useTranslations('homework');

  if (assignments.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface py-8 text-center">
        <p className="text-sm text-text-tertiary">{t('parent.noHomework')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {assignments.map((assignment) => {
        const status = assignment.completion?.status ?? null;
        const typeColour = TYPE_COLOURS[assignment.homework_type] ?? 'bg-gray-100 text-gray-700';

        return (
          <div key={assignment.id} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                {/* Status icon */}
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
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Type badge */}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeColour}`}
                    >
                      {t(`parent.types.${assignment.homework_type}` as never)}
                    </span>

                    {/* Subject */}
                    {assignment.subject && (
                      <Badge variant="secondary" className="text-xs">
                        {assignment.subject.name}
                      </Badge>
                    )}

                    {/* Due date */}
                    <span className="text-xs text-text-tertiary">
                      {t('parent.dueDate')}: {formatDate(assignment.due_date)}
                    </span>

                    {/* Points */}
                    {assignment.max_points != null && (
                      <span className="text-xs text-text-tertiary">
                        {assignment.completion?.points_awarded != null
                          ? `${assignment.completion.points_awarded}/${assignment.max_points}`
                          : `/${assignment.max_points}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Completion toggle */}
              {showCompletionToggle && onMarkDone && (
                <div className="shrink-0">
                  <ParentCompletionToggle
                    assignmentId={assignment.id}
                    currentStatus={status}
                    onComplete={onMarkDone}
                    loading={markingId === assignment.id}
                  />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
