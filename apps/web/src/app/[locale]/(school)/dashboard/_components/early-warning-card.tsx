'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';
import { TIER_COLORS, type TierSummaryResponse } from '@/lib/early-warning';

// ─── Donut segment SVG ────────────────────────────────────────────────────────

interface DonutSegment {
  tier: 'green' | 'yellow' | 'amber' | 'red';
  count: number;
  color: string;
}

function TierDonut({ segments, total }: { segments: DonutSegment[]; total: number }) {
  if (total === 0) return null;

  const size = 80;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width={size} height={size} className="shrink-0" aria-hidden="true">
      {segments.map((seg) => {
        if (seg.count === 0) return null;
        const fraction = seg.count / total;
        const dashArray = `${fraction * circumference} ${circumference}`;
        const dashOffset = -offset * circumference;
        offset += fraction;

        return (
          <circle
            key={seg.tier}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
      })}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-text-primary text-sm font-semibold"
      >
        {total}
      </text>
    </svg>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function EarlyWarningCard() {
  const t = useTranslations('early_warning');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [summary, setSummary] = React.useState<TierSummaryResponse['data'] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<TierSummaryResponse>('/api/v1/early-warnings/summary', { silent: true })
      .then((res) => setSummary(res.data))
      .catch((err) => {
        console.error('[EarlyWarningCard]', err);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (!summary) return null;

  const total = summary.red + summary.amber + summary.yellow + summary.green;

  const segments: DonutSegment[] = [
    { tier: 'red', count: summary.red, color: '#ef4444' },
    { tier: 'amber', count: summary.amber, color: '#f59e0b' },
    { tier: 'yellow', count: summary.yellow, color: '#eab308' },
    { tier: 'green', count: summary.green, color: '#10b981' },
  ];

  return (
    <Link
      href={`/${locale}/early-warnings`}
      className="block rounded-2xl border border-border bg-surface p-5 transition-colors hover:bg-surface-secondary"
    >
      <h3 className="text-sm font-semibold text-text-primary">{t('title')}</h3>
      <p className="mt-1 text-xs text-text-secondary">{t('subtitle')}</p>

      <div className="mt-4 flex items-center gap-4">
        <TierDonut segments={segments} total={total} />

        <div className="flex flex-1 flex-wrap gap-x-4 gap-y-1">
          {segments.map((seg) => {
            const colors = TIER_COLORS[seg.tier];
            return (
              <div key={seg.tier} className="flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors.bg}`} />
                <span className="text-xs text-text-secondary">
                  {t(`summary.${seg.tier}` as never)}
                </span>
                <span className="font-mono text-xs font-medium text-text-primary">
                  {seg.count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Link>
  );
}
