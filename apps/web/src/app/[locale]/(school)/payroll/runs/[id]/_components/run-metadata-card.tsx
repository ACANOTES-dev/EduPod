'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, StatusBadge } from '@school/ui';

const statusVariantMap: Record<string, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
  draft: 'warning',
  pending_approval: 'info',
  finalised: 'success',
  cancelled: 'neutral',
};

interface PayrollRun {
  id: string;
  period_label: string;
  period_month: number;
  period_year: number;
  status: string;
  headcount: number;
  total_working_days: number;
  created_at: string;
}

interface RunMetadataCardProps {
  run: PayrollRun;
  isDraft: boolean;
  onUpdateWorkingDays: (days: number) => void;
}

export function RunMetadataCard({ run, isDraft, onUpdateWorkingDays }: RunMetadataCardProps) {
  const t = useTranslations('payroll');
  const [editingDays, setEditingDays] = React.useState(false);
  const [daysValue, setDaysValue] = React.useState(String(run.total_working_days));

  React.useEffect(() => {
    setDaysValue(String(run.total_working_days));
  }, [run.total_working_days]);

  const handleSaveDays = () => {
    const n = Number(daysValue);
    if (n > 0 && n <= 31) {
      onUpdateWorkingDays(n);
      setEditingDays(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-text-primary">{run.period_label}</h2>
            <StatusBadge status={statusVariantMap[run.status] ?? 'neutral'}>
              {t(run.status as Parameters<typeof t>[0])}
            </StatusBadge>
          </div>
          <p className="text-sm text-text-secondary">
            {t('created')}: {new Date(run.created_at).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-end">
            <p className="text-xs text-text-tertiary">{t('headcount')}</p>
            <p className="text-lg font-semibold text-text-primary">{run.headcount}</p>
          </div>
          <div className="text-end">
            <p className="text-xs text-text-tertiary">{t('totalWorkingDays')}</p>
            {isDraft && editingDays ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  max="31"
                  className="w-20"
                  value={daysValue}
                  onChange={(e) => setDaysValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveDays();
                    if (e.key === 'Escape') setEditingDays(false);
                  }}
                  autoFocus
                />
                <Button size="sm" onClick={handleSaveDays}>
                  {t('save')}
                </Button>
              </div>
            ) : (
              <p
                className={`text-lg font-semibold text-text-primary ${isDraft ? 'cursor-pointer hover:text-primary' : ''}`}
                onClick={() => isDraft && setEditingDays(true)}
              >
                {run.total_working_days}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
