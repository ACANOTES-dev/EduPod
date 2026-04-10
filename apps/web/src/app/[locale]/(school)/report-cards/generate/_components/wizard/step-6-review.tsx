'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { WizardState } from './types';

interface Step6Props {
  state: WizardState;
}

// ─── Step 6 — Review & submit ────────────────────────────────────────────────
// Pure summary view. The submit button lives in the page-level footer so
// it sits alongside the Back button.

export function Step6Review({ state }: Step6Props) {
  const t = useTranslations('reportCards.wizard');

  return (
    <div className="space-y-4">
      <ReviewRow
        label={t('reviewScope')}
        value={
          state.scope.mode
            ? `${t(scopeLabelKey(state.scope.mode))} (${state.scope.ids.length})`
            : '—'
        }
      />
      <ReviewRow
        label={t('reviewPeriod')}
        value={
          state.academicPeriodId !== null
            ? state.academicPeriodId
            : state.academicYearId !== null
              ? t('reviewPeriodFullYear')
              : '—'
        }
      />
      <ReviewRow label={t('reviewTemplate')} value={state.contentScope ?? '—'} />
      <ReviewRow
        label={t('reviewFields')}
        value={
          state.personalInfoFields.length > 0
            ? state.personalInfoFields.map((f) => t(`field_${f}`)).join(', ')
            : '—'
        }
      />
      <ReviewRow
        label={t('reviewCommentGate')}
        value={
          state.dryRun.result?.would_block
            ? state.overrideCommentGate
              ? t('reviewCommentGateOverride')
              : t('commentGateBlocked')
            : t('reviewCommentGateOk')
        }
      />
    </div>
  );
}

function scopeLabelKey(mode: 'year_group' | 'class' | 'individual') {
  if (mode === 'year_group') return 'scopeYear';
  if (mode === 'class') return 'scopeClass';
  return 'scopeIndividual';
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {label}
      </div>
      <div className="text-sm text-text-primary sm:max-w-[60%] sm:text-end">{value}</div>
    </div>
  );
}
