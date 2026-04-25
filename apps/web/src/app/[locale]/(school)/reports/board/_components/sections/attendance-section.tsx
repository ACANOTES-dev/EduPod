'use client';

import { useTranslations } from 'next-intl';

import type { AttendanceSection as AttendanceSectionData } from '@school/shared/reports';

interface AttendanceSectionProps {
  section: AttendanceSectionData;
}

export function AttendanceSection({ section }: AttendanceSectionProps) {
  const t = useTranslations('reports');

  return (
    <section className="space-y-6 rounded-xl border border-border bg-surface p-6">
      <header className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">{t('board.section.attendance')}</h3>
        <div className="text-end">
          <p className="text-3xl font-bold text-text-primary">
            {section.average_rate_pct.toFixed(1)}%
          </p>
          <p className="text-xs text-text-tertiary">{t('board.attendanceAverage')}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* By year group */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.byYearGroup')}</h4>
          <div className="space-y-2">
            {section.rate_by_year_group.map((yg, idx) => (
              <div
                key={yg.year_group_id ?? `yg-${idx.toString()}`}
                className="flex items-center gap-3"
              >
                <span className="flex-1 text-sm text-text-secondary">{yg.year_group_name}</span>
                <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-secondary">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${Math.min(100, Math.max(0, yg.rate_pct))}%` }}
                  />
                </div>
                <span className="w-12 text-end text-sm font-semibold text-text-primary">
                  {yg.rate_pct.toFixed(1)}%
                </span>
              </div>
            ))}
            {section.rate_by_year_group.length === 0 && (
              <p className="text-xs text-text-tertiary">{t('board.noData')}</p>
            )}
          </div>
        </div>

        {/* By day of week */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.byDayOfWeek')}</h4>
          <div className="space-y-2">
            {section.day_of_week_pattern.map((dow) => (
              <div key={dow.weekday} className="flex items-center gap-3">
                <span className="flex-1 text-sm text-text-secondary">{dow.weekday_label}</span>
                <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-secondary">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${Math.min(100, Math.max(0, dow.rate_pct))}%` }}
                  />
                </div>
                <span className="w-12 text-end text-sm font-semibold text-text-primary">
                  {dow.rate_pct.toFixed(1)}%
                </span>
              </div>
            ))}
            {section.day_of_week_pattern.length === 0 && (
              <p className="text-xs text-text-tertiary">{t('board.noData')}</p>
            )}
          </div>
        </div>
      </div>

      {section.chronic_absenteeism_count > 0 && (
        <div className="border-t border-border pt-4">
          <p className="text-sm text-text-secondary">
            <span className="font-semibold text-red-600">{section.chronic_absenteeism_count}</span>{' '}
            {t('board.chronicAbsenteeism', {
              threshold: section.chronic_absenteeism_threshold_pct.toFixed(0),
            })}
          </p>
        </div>
      )}
    </section>
  );
}
