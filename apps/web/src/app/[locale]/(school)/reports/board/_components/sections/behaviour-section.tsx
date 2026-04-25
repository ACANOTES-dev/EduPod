'use client';

import { useTranslations } from 'next-intl';

import type { BehaviourSection as BehaviourSectionData } from '@school/shared/reports';

interface BehaviourSectionProps {
  section: BehaviourSectionData;
}

export function BehaviourSection({ section }: BehaviourSectionProps) {
  const t = useTranslations('reports');

  const delta = section.trend_vs_prior_term.delta;
  const deltaColor =
    delta > 0 ? 'text-red-600' : delta < 0 ? 'text-emerald-600' : 'text-text-tertiary';

  return (
    <section className="space-y-6 rounded-xl border border-border bg-surface p-6">
      <header className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">{t('board.section.behaviour')}</h3>
        <div className="text-end">
          <p className="text-3xl font-bold text-text-primary">{section.incident_count_total}</p>
          <p className={`text-sm ${deltaColor}`}>
            {delta > 0 ? '+' : ''}
            {delta} {t('board.vsPriorTerm')}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* By category */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.byCategory')}</h4>
          <div className="space-y-2">
            {section.incident_count_by_category.map((cat, idx) => (
              <div
                key={cat.category_id ?? `cat-${idx.toString()}`}
                className="flex items-center justify-between text-sm"
              >
                <span className="truncate text-text-secondary">{cat.category_name}</span>
                <span className="flex-shrink-0 font-semibold text-text-primary">{cat.count}</span>
              </div>
            ))}
            {section.incident_count_by_category.length === 0 && (
              <p className="text-xs text-text-tertiary">{t('board.noData')}</p>
            )}
          </div>
        </div>

        {/* By year group */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.byYearGroup')}</h4>
          <div className="space-y-2">
            {section.incident_count_by_year_group.map((yg, idx) => (
              <div
                key={yg.year_group_id ?? `yg-${idx.toString()}`}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-text-secondary">{yg.year_group_name}</span>
                <span className="font-semibold text-text-primary">{yg.count}</span>
              </div>
            ))}
            {section.incident_count_by_year_group.length === 0 && (
              <p className="text-xs text-text-tertiary">{t('board.noData')}</p>
            )}
          </div>
        </div>

        {/* Sanctions */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.sanctionOutcomes')}</h4>
          <div className="space-y-2">
            {section.sanction_outcomes.map((s) => (
              <div key={s.sanction_type} className="flex items-center justify-between text-sm">
                <span className="truncate text-text-secondary">{s.sanction_type}</span>
                <span className="flex-shrink-0 font-semibold text-text-primary">{s.count}</span>
              </div>
            ))}
            {section.sanction_outcomes.length === 0 && (
              <p className="text-xs text-text-tertiary">{t('board.noData')}</p>
            )}
          </div>
        </div>
      </div>

      {section.appeals_outcomes.length > 0 && (
        <div className="border-t border-border pt-4">
          <h4 className="mb-3 text-sm font-medium text-text-primary">
            {t('board.appealsOutcomes')}
          </h4>
          <div className="space-y-2">
            {section.appeals_outcomes.map((a) => (
              <div key={a.outcome} className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">{a.outcome}</span>
                <span className="font-semibold text-text-primary">{a.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
