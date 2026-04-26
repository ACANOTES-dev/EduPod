'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { PeriodOption, VariancePeriodType } from './variance-types';

interface Props {
  selected: PeriodOption;
  available: PeriodOption[];
  onChange: (next: PeriodOption) => void;
}

const TYPES: VariancePeriodType[] = ['month', 'term', 'year'];

export function VariancePeriodSelector({ selected, available, onChange }: Props) {
  const t = useTranslations('financeBudgetingVariance.period');

  const optionsForType = React.useMemo(
    () => available.filter((p) => p.type === selected.type),
    [available, selected.type],
  );

  const handleTypeChange = (next: VariancePeriodType): void => {
    if (next === selected.type) return;
    // Pick the first available period of the new type, otherwise keep
    // the current label so the parent can fetch and surface "no data".
    const fallback = available.find((p) => p.type === next);
    onChange(fallback ?? { type: next, label: selected.label });
  };

  const handleLabelChange = (label: string): void => {
    onChange({ type: selected.type, label });
  };

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <div
        role="radiogroup"
        aria-label={t('selectPeriod')}
        className="inline-flex items-center gap-1 rounded-full bg-surface-secondary p-1"
      >
        {TYPES.map((type) => {
          const active = type === selected.type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => handleTypeChange(type)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                active
                  ? 'bg-surface text-text-primary shadow'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t(type)}
            </button>
          );
        })}
      </div>

      <select
        aria-label={t('selectPeriod')}
        value={selected.label}
        onChange={(e) => handleLabelChange(e.target.value)}
        className="min-h-[40px] rounded-2xl border border-border bg-surface px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {optionsForType.length === 0 ? (
          <option value={selected.label}>{selected.label}</option>
        ) : (
          optionsForType.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
