'use client';

import { useTranslations } from 'next-intl';

import type { StaffingSection as StaffingSectionData } from '@school/shared/reports';

interface StaffingSectionProps {
  section: StaffingSectionData;
}

export function StaffingSection({ section }: StaffingSectionProps) {
  const t = useTranslations('reports');

  const totalHeadcount = section.headcount_active + section.headcount_inactive;
  const turnoverNet = section.turnover_this_term.arrivals - section.turnover_this_term.departures;
  const turnoverColour = turnoverNet >= 0 ? 'text-emerald-600' : 'text-red-600';
  const coverColour = section.cover_gaps_unfilled > 0 ? 'text-amber-600' : 'text-emerald-600';

  return (
    <section className="space-y-6 rounded-xl border border-border bg-surface p-6">
      <h3 className="text-lg font-semibold text-text-primary">{t('board.section.staffing')}</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Headcount */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.staffHeadcount')}</h4>
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-text-primary">{totalHeadcount}</span>
              <span className="text-sm text-text-tertiary">{t('board.total')}</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">{t('board.active')}</span>
                <span className="font-semibold text-emerald-600">{section.headcount_active}</span>
              </div>
              {section.headcount_inactive > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{t('board.inactive')}</span>
                  <span className="font-semibold text-text-tertiary">
                    {section.headcount_inactive}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Turnover */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.turnoverThisTerm')}</h4>
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${turnoverColour}`}>
                {turnoverNet >= 0 ? '+' : ''}
                {turnoverNet}
              </span>
              <span className="text-sm text-text-tertiary">{t('board.net')}</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">{t('board.arrivals')}</span>
                <span className="font-semibold text-emerald-600">
                  {section.turnover_this_term.arrivals}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">{t('board.departures')}</span>
                <span className="font-semibold text-red-600">
                  {section.turnover_this_term.departures}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 md:grid-cols-3">
        {/* Attendance */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">
            {t('board.staffAttendanceRate')}
          </p>
          <p className="text-2xl font-bold text-text-primary">
            {section.attendance_rate_pct.toFixed(1)}%
          </p>
        </div>

        {/* Pending leave */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">
            {t('board.pendingLeaveRequests')}
          </p>
          <p className="text-2xl font-bold text-text-primary">{section.pending_leave_requests}</p>
        </div>

        {/* Cover gaps */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">
            {t('board.coverGapsUnfilled')}
          </p>
          <p className={`text-2xl font-bold ${coverColour}`}>{section.cover_gaps_unfilled}</p>
        </div>
      </div>

      {section.absences_this_term > 0 && (
        <div className="border-t border-border pt-4">
          <p className="text-sm text-text-secondary">
            <span className="font-semibold">{section.absences_this_term}</span>{' '}
            {t('board.absencesThisTerm')}
          </p>
        </div>
      )}
    </section>
  );
}
