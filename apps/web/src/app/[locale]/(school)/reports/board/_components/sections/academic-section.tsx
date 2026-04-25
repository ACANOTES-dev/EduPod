'use client';

import { useTranslations } from 'next-intl';

import type { AcademicSection as AcademicSectionData } from '@school/shared/reports';

interface AcademicSectionProps {
  section: AcademicSectionData;
  anonymise: boolean;
}

export function AcademicSection({ section, anonymise }: AcademicSectionProps) {
  const t = useTranslations('reports');

  return (
    <section className="space-y-6 rounded-xl border border-border bg-surface p-6">
      <header className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold text-text-primary">{t('board.section.academic')}</h3>
        {anonymise && (
          <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">
            {t('board.anonymisedBadge')}
          </span>
        )}
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Pass/fail by year group */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-text-primary">
            {t('board.passFailByYearGroup')}
          </h4>
          <div className="space-y-3">
            {section.pass_fail_by_year_group.map((yg, idx) => (
              <div key={yg.year_group_id ?? `yg-${idx.toString()}`} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-secondary">{yg.year_group_name}</span>
                  <span className="text-text-tertiary">
                    {yg.graded_count} {t('board.graded')}
                  </span>
                </div>
                <div className="flex h-2 gap-1 overflow-hidden rounded-full bg-surface-secondary">
                  <div className="bg-emerald-500" style={{ width: `${yg.pass_rate_pct}%` }} />
                  <div className="bg-red-500" style={{ width: `${yg.fail_rate_pct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-text-secondary">
                  <span>{yg.pass_rate_pct.toFixed(0)}%</span>
                  <span>{yg.fail_rate_pct.toFixed(0)}%</span>
                </div>
              </div>
            ))}
            {section.pass_fail_by_year_group.length === 0 && (
              <p className="text-xs text-text-tertiary">{t('board.noData')}</p>
            )}
          </div>
        </div>

        {/* Subject averages */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-text-primary">{t('board.subjectAverages')}</h4>
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {section.subject_averages.map((subj, idx) => (
              <div
                key={subj.subject_id ?? `subj-${idx.toString()}`}
                className="flex items-center gap-3"
              >
                <span className="flex-1 truncate text-sm text-text-secondary">
                  {subj.subject_name}
                </span>
                <div className="h-2 w-20 flex-shrink-0 overflow-hidden rounded-full bg-surface-secondary">
                  <div
                    className="h-full bg-blue-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, subj.average_score_pct))}%`,
                    }}
                  />
                </div>
                <span className="w-12 flex-shrink-0 text-end text-sm font-semibold text-text-primary">
                  {subj.average_score_pct.toFixed(1)}%
                </span>
              </div>
            ))}
            {section.subject_averages.length === 0 && (
              <p className="text-xs text-text-tertiary">{t('board.noData')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Top and bottom performers */}
      <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 md:grid-cols-2">
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.topPerformers')}</h4>
          <div className="space-y-2" data-testid="academic-top-performers">
            {section.top_performers.slice(0, 5).map((p, idx) => (
              <div
                key={`top-${idx.toString()}`}
                className="flex items-start gap-2 rounded bg-emerald-50 p-2"
              >
                <span className="flex-shrink-0 text-xs font-semibold text-emerald-700">
                  {idx + 1}
                </span>
                <div className="flex-1 text-xs">
                  <p className="font-medium text-emerald-900">{p.display_label}</p>
                  <p className="text-emerald-700">
                    {p.year_group_name} · {p.average_score_pct.toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
            {section.top_performers.length === 0 && (
              <p className="text-xs text-text-tertiary">{t('board.noData')}</p>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.bottomPerformers')}</h4>
          <div className="space-y-2" data-testid="academic-bottom-performers">
            {section.bottom_performers.slice(0, 5).map((p, idx) => (
              <div
                key={`bottom-${idx.toString()}`}
                className="flex items-start gap-2 rounded bg-red-50 p-2"
              >
                <span className="flex-shrink-0 text-xs font-semibold text-red-700">{idx + 1}</span>
                <div className="flex-1 text-xs">
                  <p className="font-medium text-red-900">{p.display_label}</p>
                  <p className="text-red-700">
                    {p.year_group_name} · {p.average_score_pct.toFixed(1)}%
                  </p>
                </div>
              </div>
            ))}
            {section.bottom_performers.length === 0 && (
              <p className="text-xs text-text-tertiary">{t('board.noData')}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
