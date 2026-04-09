'use client';

import { Calendar, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

import type { WizardAction, WizardState } from './types';

interface AcademicPeriod {
  id: string;
  name: string;
  academic_year?: { id: string; name: string } | null;
}

interface ListResponse<T> {
  data: T[];
}

interface Step2Props {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

// ─── Step 2 — Period selection ───────────────────────────────────────────────

export function Step2Period({ state, dispatch }: Step2Props) {
  const t = useTranslations('reportCards.wizard');
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiClient<ListResponse<AcademicPeriod>>(
          '/api/v1/academic-periods?pageSize=50',
        );
        if (cancelled) return;
        setPeriods(res.data ?? []);
      } catch (err) {
        console.error('[Step2Period.load]', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-secondary" />
        ))}
      </div>
    );
  }

  if (periods.length === 0) {
    return <p className="text-sm text-text-tertiary">{t('noPeriods')}</p>;
  }

  return (
    <div className="space-y-2">
      {/* "All periods" (full-year) option — pending backend support. */}
      <div
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-surface-secondary/40 p-4 text-start opacity-70"
        aria-disabled="true"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-secondary text-text-tertiary">
            <Calendar className="h-4.5 w-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">{t('periodAll')}</span>
              <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700">
                {t('templateComingSoon')}
              </span>
            </div>
            <div className="text-xs text-text-tertiary">{t('periodAllHint')}</div>
          </div>
        </div>
      </div>

      {periods.map((period) => {
        const selected = state.academicPeriodId === period.id;
        return (
          <button
            key={period.id}
            type="button"
            onClick={() => dispatch({ type: 'SET_PERIOD', id: period.id })}
            className={`flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-start transition-all ${
              selected
                ? 'border-primary-500 bg-primary-50/50 shadow-sm'
                : 'border-border bg-surface hover:border-primary-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  selected ? 'bg-primary-500 text-white' : 'bg-surface-secondary text-text-tertiary'
                }`}
              >
                <Calendar className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-text-primary">{period.name}</div>
                {period.academic_year?.name ? (
                  <div className="text-xs text-text-tertiary">{period.academic_year.name}</div>
                ) : null}
              </div>
            </div>
            {selected ? (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-white">
                <Check className="h-3.5 w-3.5" />
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
