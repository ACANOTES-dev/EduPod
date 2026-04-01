'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge } from '@school/ui';

import { DOMAIN_COLORS, SEVERITY_COLORS, type RiskSignal } from '@/lib/early-warning';
import { formatDateTime } from '@/lib/format-date';

interface SignalBreakdownProps {
  signals: RiskSignal[];
}

export function SignalBreakdown({ signals }: SignalBreakdownProps) {
  const t = useTranslations('early_warning');

  const sorted = [...signals].sort((a, b) => b.score_contribution - a.score_contribution);

  if (sorted.length === 0) {
    return <p className="text-sm text-text-tertiary">{t('detail.no_signals')}</p>;
  }

  return (
    <div className="space-y-2">
      {sorted.map((signal) => {
        const severity = SEVERITY_COLORS[signal.severity];
        const domainColor = DOMAIN_COLORS[signal.domain];

        return (
          <div
            key={signal.id}
            className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${domainColor}`} />
                <span className="text-xs font-medium uppercase text-text-tertiary">
                  {t(`domains.${signal.domain}` as never)}
                </span>
                <Badge className={`${severity.bg} ${severity.text}`}>{signal.severity}</Badge>
              </div>
              <p className="mt-1 text-sm text-text-primary">{signal.summary_fragment}</p>
              <p className="mt-1 text-xs text-text-tertiary">
                {formatDateTime(signal.detected_at)}
              </p>
            </div>
            <div className="shrink-0 text-end">
              <span className="font-mono text-sm font-medium text-text-primary">
                +{signal.score_contribution.toFixed(0)}
              </span>
              <p className="text-xs text-text-tertiary">{t('detail.points')}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
