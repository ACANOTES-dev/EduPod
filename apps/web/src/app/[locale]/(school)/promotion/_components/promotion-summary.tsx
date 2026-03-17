'use client';

import { useTranslations } from 'next-intl';

import type { PreviewStudent, OverrideMap } from './promotion-preview';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PromotionSummaryProps {
  students: PreviewStudent[];
  overrides: OverrideMap;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PromotionSummary({ students, overrides }: PromotionSummaryProps) {
  const t = useTranslations('promotion');

  const counts: Record<string, number> = {};
  for (const student of students) {
    const action = overrides[student.student_id] ?? student.proposed_action;
    counts[action] = (counts[action] ?? 0) + 1;
  }

  const ACTION_LABELS: Record<string, string> = {
    promote: t('actionPromote'),
    hold_back: t('actionHoldBack'),
    skip: t('actionSkip'),
    graduate: t('actionGraduate'),
    withdraw: t('actionWithdraw'),
  };

  const ACTION_COLORS: Record<string, string> = {
    promote: 'bg-success-fill text-success-text border-success-text/20',
    hold_back: 'bg-warning-fill text-warning-text border-warning-text/20',
    skip: 'bg-info-fill text-info-text border-info-text/20',
    graduate: 'bg-success-fill text-success-text border-success-text/20',
    withdraw: 'bg-danger-fill text-danger-text border-danger-text/20',
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">{t('summaryDescription')}</p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(counts).map(([action, count]) => (
          <div
            key={action}
            className={`rounded-xl border px-5 py-4 ${ACTION_COLORS[action] ?? 'bg-surface border-border'}`}
          >
            <p className="text-2xl font-bold">{count}</p>
            <p className="mt-0.5 text-sm font-medium">
              {ACTION_LABELS[action] ?? action}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
        <p className="font-medium text-text-primary">{t('summaryTotal')}: {students.length}</p>
        <p className="mt-1">{t('summaryConfirmNote')}</p>
      </div>
    </div>
  );
}
