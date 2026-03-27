'use client';

import { cn } from '@school/ui';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

interface StudentBehaviourHeaderProps {
  studentName: string;
  yearGroup: string | null;
  totalPoints: number;
  positiveCount: number;
  negativeCount: number;
}

export function StudentBehaviourHeader({
  studentName,
  yearGroup,
  totalPoints,
  positiveCount,
  negativeCount,
}: StudentBehaviourHeaderProps) {
  const t = useTranslations('behaviour.components.studentHeader');
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Student info */}
        <div>
          <h2 className="text-xl font-semibold text-text-primary">{studentName}</h2>
          {yearGroup && (
            <p className="mt-0.5 text-sm text-text-secondary">{yearGroup}</p>
          )}
        </div>

        {/* Stats */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
              {t('points')}
            </p>
            <p className={cn(
              'text-2xl font-bold',
              totalPoints > 0 ? 'text-green-600' : totalPoints < 0 ? 'text-red-600' : 'text-text-primary',
            )}>
              {totalPoints > 0 ? '+' : ''}{totalPoints}
            </p>
          </div>

          <div className="h-8 w-px bg-border" />

          <div className="flex items-center gap-1.5 text-center">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('positive')}</p>
              <p className="text-lg font-semibold text-green-600">{positiveCount}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-center">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('negative')}</p>
              <p className="text-lg font-semibold text-red-600">{negativeCount}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
