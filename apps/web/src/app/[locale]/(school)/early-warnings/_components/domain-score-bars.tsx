'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { DOMAIN_COLORS, type SignalDomain } from '@/lib/early-warning';

interface DomainScoreBarsProps {
  scores: Record<SignalDomain, number>;
}

const DOMAINS: SignalDomain[] = ['attendance', 'grades', 'behaviour', 'wellbeing', 'engagement'];

export function DomainScoreBars({ scores }: DomainScoreBarsProps) {
  const t = useTranslations('early_warning');

  return (
    <div className="space-y-3">
      {DOMAINS.map((domain) => {
        const score = scores[domain];
        const color = DOMAIN_COLORS[domain];

        return (
          <div key={domain}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">
                {t(`domains.${domain}` as never)}
              </span>
              <span className="font-mono text-text-primary">{score.toFixed(0)}</span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-surface-secondary">
              <div
                className={`h-2 rounded-full ${color} transition-all duration-500`}
                style={{ width: `${Math.min(score, 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
