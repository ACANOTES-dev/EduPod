'use client';

import { useTranslations } from 'next-intl';

import type { EnrolmentSection as EnrolmentSectionData } from '@school/shared/reports';

interface EnrolmentSectionProps {
  section: EnrolmentSectionData;
}

export function EnrolmentSection({ section }: EnrolmentSectionProps) {
  const t = useTranslations('reports');

  const delta = section.enrolment_change_vs_prior_term.delta;
  const deltaColor =
    delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-text-tertiary';

  return (
    <section className="space-y-6 rounded-xl border border-border bg-surface p-6">
      <header className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">{t('board.section.enrolment')}</h3>
        <div className="text-end">
          <p className="text-3xl font-bold text-text-primary">{section.total_headcount}</p>
          <p className={`text-sm ${deltaColor}`}>
            {delta > 0 ? '+' : ''}
            {delta} {t('board.vsPriorTerm')}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Year group */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.byYearGroup')}</h4>
          <div className="space-y-2">
            {section.headcount_by_year_group.map((yg, idx) => (
              <div
                key={yg.year_group_id ?? `yg-${idx.toString()}`}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-text-secondary">{yg.year_group_name}</span>
                <span className="font-semibold text-text-primary">{yg.count}</span>
              </div>
            ))}
            {section.headcount_by_year_group.length === 0 && (
              <p className="text-xs text-text-tertiary">{t('board.noData')}</p>
            )}
          </div>
        </div>

        {/* Gender */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.byGender')}</h4>
          <div className="space-y-2">
            {section.gender_split.map((g) => (
              <div key={g.gender} className="flex items-center justify-between text-sm">
                <span className="text-text-secondary capitalize">{g.gender}</span>
                <span className="font-semibold text-text-primary">{g.count}</span>
              </div>
            ))}
            {section.gender_split.length === 0 && (
              <p className="text-xs text-text-tertiary">{t('board.noData')}</p>
            )}
          </div>
        </div>

        {/* Nationality */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.byNationality')}</h4>
          <div className="max-h-32 space-y-2 overflow-y-auto">
            {section.nationality_split.slice(0, 5).map((n) => (
              <div key={n.nationality} className="flex items-center justify-between text-sm">
                <span className="truncate text-text-secondary">{n.nationality}</span>
                <span className="flex-shrink-0 font-semibold text-text-primary">{n.count}</span>
              </div>
            ))}
            {section.nationality_split.length === 0 && (
              <p className="text-xs text-text-tertiary">{t('board.noData')}</p>
            )}
            {section.nationality_split.length > 5 && (
              <p className="pt-2 text-xs text-text-tertiary">
                {t('board.andMore', { count: section.nationality_split.length - 5 })}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
