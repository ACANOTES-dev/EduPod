'use client';

import { Badge } from '@school/ui';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { formatDate } from '@/lib/format-date';

import { ParentCompletionToggle } from './parent-completion-toggle';

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

interface OverdueAlertCardProps {
  assignment: Assignment;
  studentName: string;
  onMarkDone?: (assignmentId: string) => void;
  showCompletionToggle?: boolean;
  markingId?: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OverdueAlertCard({
  assignment,
  studentName,
  onMarkDone,
  showCompletionToggle,
  markingId,
}: OverdueAlertCardProps) {
  const t = useTranslations('homework');

  const daysOverdue = React.useMemo(() => {
    const due = new Date(assignment.due_date);
    const now = new Date();
    const diff = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [assignment.due_date]);

  return (
    <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-sm font-semibold text-text-primary">{assignment.title}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-secondary">{studentName}</span>
              {assignment.subject && (
                <Badge variant="secondary" className="text-xs">
                  {assignment.subject.name}
                </Badge>
              )}
              <span className="text-xs text-text-tertiary">
                {t('parent.dueDate')}: {formatDate(assignment.due_date)}
              </span>
            </div>
            <Badge variant="danger" className="text-xs">
              {daysOverdue} {daysOverdue === 1 ? t('parent.dayOverdue') : t('parent.daysOverdue')}
            </Badge>
          </div>
        </div>

        {showCompletionToggle && onMarkDone && (
          <div className="shrink-0">
            <ParentCompletionToggle
              assignmentId={assignment.id}
              currentStatus={assignment.completion?.status ?? null}
              onComplete={onMarkDone}
              loading={markingId === assignment.id}
            />
          </div>
        )}
      </div>
    </div>
  );
}
