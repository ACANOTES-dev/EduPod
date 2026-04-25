'use client';

import { useTranslations } from 'next-intl';

import type { SafeguardingSection as SafeguardingSectionData } from '@school/shared/reports';

interface SafeguardingSectionProps {
  section: SafeguardingSectionData;
}

export function SafeguardingSection({ section }: SafeguardingSectionProps) {
  const t = useTranslations('reports');

  const ageColor =
    section.oldest_open_concern_age_days !== null && section.oldest_open_concern_age_days > 14
      ? 'text-red-700'
      : 'text-text-secondary';

  const maxBucket = section.age_histogram.reduce((max, bucket) => Math.max(max, bucket.count), 1);

  return (
    <section className="space-y-6 rounded-xl border border-border bg-surface p-6">
      <header className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">
          {t('board.section.safeguarding')}
        </h3>
        <div className="text-end">
          <p className="text-3xl font-bold text-text-primary">{section.open_concerns_count}</p>
          <p className="text-xs text-text-tertiary">{t('board.openConcerns')}</p>
        </div>
      </header>

      {section.oldest_open_concern_age_days !== null && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className={`text-sm ${ageColor}`}>
            {t('board.oldestConcern')}{' '}
            <span className="font-semibold">
              {section.oldest_open_concern_age_days} {t('board.days')}
            </span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Age histogram */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.ageDistribution')}</h4>
          <div className="space-y-2">
            {section.age_histogram.map((bucket) => (
              <div key={bucket.bucket_label} className="flex items-center gap-3">
                <span className="w-16 text-sm text-text-secondary">{bucket.bucket_label}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-secondary">
                  <div
                    className="h-full bg-purple-500"
                    style={{
                      width: `${Math.max(4, (bucket.count / maxBucket) * 100)}%`,
                    }}
                  />
                </div>
                <span className="w-8 text-end text-sm font-semibold text-text-primary">
                  {bucket.count}
                </span>
              </div>
            ))}
            {section.age_histogram.length === 0 && (
              <p className="text-xs text-text-tertiary">{t('board.noData')}</p>
            )}
          </div>
        </div>

        {/* Summary stats */}
        <div className="space-y-4">
          <div className="rounded-lg bg-surface-secondary p-3">
            <p className="text-xs text-text-tertiary">{t('board.actions')}</p>
            <p className="text-2xl font-bold text-text-primary">{section.actions_taken_count}</p>
          </div>
          <div className="rounded-lg bg-red-50 p-3">
            <p className="text-xs text-red-700">{t('board.criticalIncidents')}</p>
            <p className="text-2xl font-bold text-red-600">{section.critical_incidents_count}</p>
          </div>
        </div>
      </div>

      {section.detail_summary && (
        <div className="border-t border-border pt-4">
          <p className="text-sm text-text-secondary">{section.detail_summary}</p>
        </div>
      )}
    </section>
  );
}
