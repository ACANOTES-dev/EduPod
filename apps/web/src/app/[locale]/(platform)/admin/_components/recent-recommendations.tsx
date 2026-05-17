'use client';

import { Lightbulb } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { cn } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface RecommendationSummary {
  id: string;
  category: string;
  title: string;
  risk_level: 'safe' | 'caution' | 'destructive';
  confidence: 'low' | 'medium' | 'high';
  generated_at: string;
}

export function RecentRecommendations({ className }: { className?: string }) {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const [recommendations, setRecommendations] = React.useState<RecommendationSummary[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await apiClient<RecommendationSummary[]>(
          '/api/v1/admin/copilot/recommendations',
        );
        if (!cancelled) setRecommendations(rows.slice(0, 3));
      } catch (err: unknown) {
        console.error('[RecentRecommendations.load]', err);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className={cn('rounded-lg border border-border bg-surface p-5 shadow-sm', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-text-tertiary" />
          <h2 className="text-sm font-semibold text-text-primary">Recent Recommendations</h2>
        </div>
        <Link
          href={`/${locale}/admin/copilot/recommendations`}
          className="text-xs font-semibold text-primary-700 hover:text-primary-800"
        >
          Open
        </Link>
      </div>
      <div className="mt-4 space-y-3">
        {recommendations.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Empty until you manually generate cited recommendations.
          </p>
        ) : null}
        {recommendations.map((recommendation) => (
          <Link
            key={recommendation.id}
            href={`/${locale}/admin/copilot/recommendations`}
            className="block rounded-lg border border-border bg-surface-secondary p-3 hover:bg-surface-hover"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-text-tertiary">
                {recommendation.category.replaceAll('_', ' ')}
              </span>
              <span className={cn('text-xs font-semibold', riskClass(recommendation.risk_level))}>
                {recommendation.risk_level}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm font-medium text-text-primary">
              {recommendation.title}
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              {recommendation.confidence} confidence ·{' '}
              {new Date(recommendation.generated_at).toLocaleDateString()}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}

function riskClass(risk: RecommendationSummary['risk_level']): string {
  if (risk === 'destructive') return 'text-danger-text';
  if (risk === 'caution') return 'text-warning-text';
  return 'text-info-text';
}
