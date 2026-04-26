'use client';

import { useTranslations } from 'next-intl';

interface Props {
  horizon: 1 | 3 | 5;
  fiscalYearStart: string;
  activeYear: number;
  onChange: (year: number) => void;
}

export function YearSelector({ horizon, fiscalYearStart, activeYear, onChange }: Props) {
  const t = useTranslations('financeBudgetingWorkspace.yearSelector');
  if (horizon <= 1) return null;

  const startYear = new Date(fiscalYearStart).getUTCFullYear();
  const years = Array.from({ length: horizon }, (_, i) => i + 1);

  return (
    <section className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-border bg-surface p-3">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {t('label')}
      </span>
      {years.map((y) => {
        const startFy = startYear + (y - 1);
        const endFy = startFy + 1;
        const label = t('academicYear', {
          from: String(startFy),
          to: String(endFy).slice(2),
        });
        return (
          <button
            key={y}
            type="button"
            onClick={() => onChange(y)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              activeYear === y
                ? 'bg-primary-600 text-white'
                : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
            }`}
          >
            {t('yearN', { n: y })} · {label}
          </button>
        );
      })}
    </section>
  );
}
