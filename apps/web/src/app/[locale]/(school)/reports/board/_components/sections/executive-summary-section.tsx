'use client';

import { useTranslations } from 'next-intl';

import type { ExecutiveSummarySection as ExecutiveSummarySectionData } from '@school/shared/reports';

interface ExecutiveSummarySectionProps {
  section: ExecutiveSummarySectionData;
}

export function ExecutiveSummarySection({ section }: ExecutiveSummarySectionProps) {
  const t = useTranslations('reports');

  const metrics = [
    {
      label: t('board.metrics.studentHeadcount'),
      value: section.headline_metrics.student_headcount.toLocaleString(),
    },
    {
      label: t('board.metrics.attendanceRate'),
      value: `${section.headline_metrics.attendance_rate_pct.toFixed(1)}%`,
    },
    {
      label: t('board.metrics.collectionRate'),
      value: `${section.headline_metrics.collection_rate_pct.toFixed(1)}%`,
    },
    {
      label: t('board.metrics.atRiskStudents'),
      value: section.headline_metrics.at_risk_student_count.toLocaleString(),
    },
    {
      label: t('board.metrics.openSafeguarding'),
      value: section.headline_metrics.open_safeguarding_concerns.toLocaleString(),
    },
  ];

  return (
    <section className="space-y-6 rounded-xl border border-border bg-surface p-6">
      <h3 className="text-lg font-semibold text-text-primary">{t('board.section.executive')}</h3>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {metrics.map((metric) => (
          <div key={metric.label} className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-text-tertiary">{metric.label}</p>
            <p className="text-2xl font-bold text-text-primary">{metric.value}</p>
          </div>
        ))}
      </div>

      {section.narrative ? (
        <div className="border-t border-border pt-4">
          <p className="text-sm leading-relaxed text-text-secondary">{section.narrative}</p>
        </div>
      ) : (
        <p className="text-xs italic text-text-tertiary">{t('board.narrativeNotAvailable')}</p>
      )}
    </section>
  );
}
