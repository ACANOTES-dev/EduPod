'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { RiskTierBadge } from './risk-tier-badge';

import { TIER_COLORS, type TierTransition } from '@/lib/early-warning';
import { formatDateTime } from '@/lib/format-date';


interface TierTransitionTimelineProps {
  transitions: TierTransition[];
}

export function TierTransitionTimeline({ transitions }: TierTransitionTimelineProps) {
  const t = useTranslations('early_warning');

  if (transitions.length === 0) {
    return <p className="text-sm text-text-tertiary">{t('detail.no_transitions')}</p>;
  }

  // Most recent first
  const sorted = [...transitions].sort(
    (a, b) => new Date(b.transitioned_at).getTime() - new Date(a.transitioned_at).getTime(),
  );

  return (
    <div className="relative space-y-4 ps-6">
      {/* Vertical line */}
      <div className="absolute start-2 top-1 bottom-1 w-0.5 bg-border" />

      {sorted.map((transition) => {
        const toColors = TIER_COLORS[transition.to_tier];

        return (
          <div key={transition.id} className="relative">
            {/* Dot on the timeline */}
            <div
              className={`absolute start-[-18px] top-1 h-3 w-3 rounded-full ring-2 ring-surface ${toColors.bg}`}
            />
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-2">
                {transition.from_tier ? (
                  <>
                    <RiskTierBadge tier={transition.from_tier} />
                    <span className="text-xs text-text-tertiary">→</span>
                  </>
                ) : null}
                <RiskTierBadge tier={transition.to_tier} />
              </div>
              <span className="font-mono text-xs text-text-tertiary">
                {t('detail.score_at_transition', {
                  score: transition.composite_score.toFixed(0),
                })}
              </span>
              <span className="text-xs text-text-tertiary">
                {formatDateTime(transition.transitioned_at)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
