'use client';

import { Calendar, Copy, Play, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, Separator } from '@school/ui';

import type { Survey } from './survey-types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface OverviewTabProps {
  survey: Survey;
  formatDateDisplay: (dateStr: string) => string;
  computeResponseRate: () => string;
  onActivate: () => void;
  onClose: () => void;
  onClone: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function OverviewTab({
  survey,
  formatDateDisplay,
  computeResponseRate,
  onActivate,
  onClose,
  onClone,
}: OverviewTabProps) {
  const t = useTranslations('wellbeing.surveyDetail');
  const participationCount = survey.participation_count ?? 0;
  const eligibleCount = survey.eligible_count ?? 0;

  return (
    <div className="space-y-6">
      {/* Survey info card */}
      <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Status & frequency */}
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                {t('overview')}
              </p>
              <p className="mt-1 text-sm text-text-primary">{survey.frequency}</p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-text-tertiary">
                <Calendar className="h-4 w-4" />
                <p className="text-xs font-medium uppercase tracking-wider">{t('overview')}</p>
              </div>
              <p className="mt-1 text-sm text-text-primary">
                {formatDateDisplay(survey.window_opens_at)}
                <span className="mx-2 text-text-tertiary">&rarr;</span>
                {formatDateDisplay(survey.window_closes_at)}
              </p>
            </div>
          </div>

          {/* Response stats */}
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                {t('responseStats')}
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-text-primary" dir="ltr">
                  {participationCount}
                </span>
                <span className="text-sm text-text-secondary">
                  / <span dir="ltr">{eligibleCount}</span>
                </span>
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                {t('responseCount', {
                  count: participationCount,
                  eligible: eligibleCount,
                  rate: computeResponseRate(),
                })}
              </p>
            </div>

            {/* Response rate bar */}
            {eligibleCount > 0 && (
              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (participationCount / eligibleCount) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-end text-xs text-text-tertiary" dir="ltr">
                  {computeResponseRate()}%
                </p>
              </div>
            )}
          </div>
        </div>

        <Separator className="my-6" />

        {/* Questions summary */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {t('viewResponses')}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {t('responsesReceived', { count: survey.questions.length })}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-3 sm:flex-row">
        {survey.status === 'draft' && (
          <Button onClick={onActivate} className="w-full sm:w-auto">
            <Play className="me-2 h-4 w-4" />
            {t('activate')}
          </Button>
        )}
        {survey.status === 'active' && (
          <Button variant="destructive" onClick={onClose} className="w-full sm:w-auto">
            <Square className="me-2 h-4 w-4" />
            {t('close')}
          </Button>
        )}
        <Button variant="outline" onClick={onClone} className="w-full sm:w-auto">
          <Copy className="me-2 h-4 w-4" />
          {t('clone')}
        </Button>
      </div>
    </div>
  );
}
