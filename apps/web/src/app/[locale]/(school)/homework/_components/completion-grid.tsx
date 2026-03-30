'use client';

import { Button, cn, Input } from '@school/ui';
import { Check, Circle, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StudentCompletion {
  student_id: string;
  student_name: string;
  status: 'not_started' | 'in_progress' | 'completed';
  notes: string;
  points_awarded: number | null;
}

interface CompletionGridProps {
  students: StudentCompletion[];
  maxPoints: number | null;
  onUpdate: (studentId: string, field: 'status' | 'notes' | 'points_awarded', value: string | number | null) => void;
  onBulkComplete: () => void;
  disabled?: boolean;
}

type FilterStatus = 'all' | 'not_started' | 'in_progress' | 'completed';

// ─── Component ────────────────────────────────────────────────────────────────

export function CompletionGrid({ students, maxPoints, onUpdate, onBulkComplete, disabled }: CompletionGridProps) {
  const t = useTranslations('homework');
  const [filter, setFilter] = React.useState<FilterStatus>('all');

  const filtered = React.useMemo(
    () => (filter === 'all' ? students : students.filter((s) => s.status === filter)),
    [students, filter],
  );

  const filters: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: t('filterAll') },
    { key: 'not_started', label: t('filterNotStarted') },
    { key: 'in_progress', label: t('filterInProgress') },
    { key: 'completed', label: t('filterCompleted') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onBulkComplete} disabled={disabled}>
          {t('markAllCompleted')}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-secondary">
              <th className="sticky start-0 z-10 bg-surface-secondary px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">{t('studentName')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">{t('status')}</th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">{t('notes')}</th>
              {maxPoints != null && <th className="px-4 py-3 text-start text-xs font-semibold uppercase text-text-tertiary">{t('points')}</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.student_id} className="border-b border-border last:border-b-0">
                <td className="sticky start-0 z-10 bg-surface px-4 py-2.5 text-sm font-medium text-text-primary whitespace-nowrap">{s.student_name}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    {(['not_started', 'in_progress', 'completed'] as const).map((st) => {
                      const active = s.status === st;
                      const Icon = st === 'not_started' ? X : st === 'in_progress' ? Circle : Check;
                      const colors = st === 'not_started'
                        ? 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                        : st === 'in_progress'
                          ? 'bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200'
                          : 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200';
                      return (
                        <button
                          key={st}
                          type="button"
                          disabled={disabled}
                          onClick={() => onUpdate(s.student_id, 'status', st)}
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                            active ? colors : 'bg-surface-secondary text-text-tertiary hover:bg-surface',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <Input
                    value={s.notes}
                    onChange={(e) => onUpdate(s.student_id, 'notes', e.target.value)}
                    disabled={disabled}
                    className="h-8 text-sm"
                  />
                </td>
                {maxPoints != null && (
                  <td className="px-4 py-2.5">
                    <Input
                      type="number"
                      value={s.points_awarded ?? ''}
                      onChange={(e) => onUpdate(s.student_id, 'points_awarded', e.target.value ? Number(e.target.value) : null)}
                      disabled={disabled}
                      min={0}
                      max={maxPoints}
                      className="h-8 w-20 text-sm"
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
