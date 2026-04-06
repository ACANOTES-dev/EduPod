'use client';

import { useTranslations } from 'next-intl';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeeklyMetrics {
  /** Average attendance rate this week as a percentage string, e.g. "96%". Null if unavailable. */
  attendanceRate: string | null;
  /** Number of new admission applications this week. Null if unavailable. */
  newAdmissions: number | null;
  /** Number of behaviour incidents logged this week. Null if unavailable. */
  incidentsLogged: number | null;
}

export interface ThisWeekCardProps {
  metrics?: WeeklyMetrics;
  loading?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

function MetricRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-[13px] font-medium text-text-secondary">{label}</span>
      <span className="text-[16px] font-bold text-text-primary tabular-nums">
        {value ?? '\u2014'}
      </span>
    </div>
  );
}

export function ThisWeekCard({ metrics, loading = false }: ThisWeekCardProps) {
  const t = useTranslations('dashboard');

  return (
    <div className="rounded-[16px] border border-border bg-surface p-5 shadow-sm flex flex-col gap-3">
      <h3 className="text-[16px] font-semibold text-text-primary">{t('thisWeek')}</h3>

      {loading ? (
        <div className="flex items-center justify-center py-4 text-[13px] text-text-tertiary">
          {t('loadingText')}
        </div>
      ) : (
        <div className="divide-y divide-border">
          <MetricRow label={t('attendanceRate')} value={metrics?.attendanceRate ?? null} />
          <MetricRow label={t('newAdmissions')} value={metrics?.newAdmissions ?? null} />
          <MetricRow label={t('incidentsLogged')} value={metrics?.incidentsLogged ?? null} />
        </div>
      )}
    </div>
  );
}
