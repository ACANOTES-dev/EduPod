'use client';

import { Calendar, Check, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

import type { WizardAction, WizardState } from './types';

interface AcademicPeriod {
  id: string;
  name: string;
  academic_year?: { id: string; name: string } | null;
}

interface AcademicYear {
  id: string;
  name: string;
  status?: string;
}

interface ListResponse<T> {
  data: T[];
}

interface Step2Props {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

// ─── Step 2 — Period selection ───────────────────────────────────────────────
//
// Phase 1b — Option B: the wizard now offers a real "Full Year <name>"
// option at the top of the period list. Selecting it stores
// `academicYearId` (and clears `academicPeriodId`) so the generation run
// flows through the worker's full-year branch.
//
// We fetch academic years in parallel with periods. If multiple years are
// returned (rare during a school's normal flow but possible during a
// transition), we render one "Full Year" card per year — typically only
// the active year is shown.

export function Step2Period({ state, dispatch }: Step2Props) {
  const t = useTranslations('reportCards.wizard');
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [years, setYears] = React.useState<AcademicYear[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [periodsRes, yearsRes] = await Promise.all([
          apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50'),
          apiClient<ListResponse<AcademicYear>>('/api/v1/academic-years?pageSize=20'),
        ]);
        if (cancelled) return;
        setPeriods(periodsRes.data ?? []);
        // Prefer the active year first, then the rest by name desc.
        const sortedYears = [...(yearsRes.data ?? [])].sort((a, b) => {
          if (a.status === 'active' && b.status !== 'active') return -1;
          if (b.status === 'active' && a.status !== 'active') return 1;
          return b.name.localeCompare(a.name);
        });
        setYears(sortedYears);
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

  if (periods.length === 0 && years.length === 0) {
    return <p className="text-sm text-text-tertiary">{t('noPeriods')}</p>;
  }

  return (
    <div className="space-y-2">
      {/* Full-year options — one per available academic year. */}
      {years.map((year) => {
        const selected = state.academicYearId === year.id && state.academicPeriodId === null;
        return (
          <button
            key={`year-${year.id}`}
            type="button"
            onClick={() => dispatch({ type: 'SET_FULL_YEAR', academicYearId: year.id })}
            className={`flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-start transition-all ${
              selected
                ? 'border-primary-500 bg-primary-50/50 shadow-sm'
                : 'border-border bg-surface hover:border-primary-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  selected ? 'bg-primary-500 text-white' : 'bg-primary-50 text-primary-600'
                }`}
              >
                <Sparkles className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-text-primary">
                  {t('periodFullYear', { year: year.name })}
                </div>
                <div className="text-xs text-text-tertiary">{t('periodFullYearHint')}</div>
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
