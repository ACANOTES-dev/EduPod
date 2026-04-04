'use client';

import { Calendar } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { StatusBadge } from '@school/ui';

import { formatDate } from '@/lib/format-date';

import { HomeworkTypeBadge } from './homework-type-badge';



// ─── Types ────────────────────────────────────────────────────────────────────

interface HomeworkCardProps {
  id: string;
  title: string;
  class_name: string;
  subject_name?: string;
  homework_type: string;
  due_date: string;
  due_time?: string;
  status: string;
  completion_rate?: number;
  onClick?: () => void;
}

// ─── Status mapping ───────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, 'warning' | 'success' | 'neutral'> = {
  draft: 'warning',
  published: 'success',
  archived: 'neutral',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function HomeworkCard({
  title,
  class_name,
  subject_name,
  homework_type,
  due_date,
  status,
  completion_rate,
  onClick,
}: HomeworkCardProps) {
  const t = useTranslations('homework');
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl bg-surface-secondary p-4 text-start hover:bg-surface transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-text-primary">{title}</h3>
          <p className="mt-0.5 text-xs text-text-secondary">
            {class_name}
            {subject_name ? ` · ${subject_name}` : ''}
          </p>
        </div>
        <StatusBadge status={STATUS_MAP[status] ?? 'neutral'}>{status}</StatusBadge>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <HomeworkTypeBadge type={homework_type} />
        <span className="flex items-center gap-1 text-xs text-text-tertiary">
          <Calendar className="h-3.5 w-3.5" />
          {formatDate(due_date)}
        </span>
      </div>
      {completion_rate != null && (
        <div className="mt-3">
          <div className="h-1.5 w-full rounded-full bg-surface">
            <div
              className="h-1.5 rounded-full bg-primary-600 transition-all"
              style={{ width: `${Math.min(100, completion_rate)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-text-tertiary">{Math.round(completion_rate)}{t('complete')}</p>
        </div>
      )}
    </button>
  );
}
