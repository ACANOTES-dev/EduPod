'use client';

import { BarChart3, LayoutGrid, Table } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type CompareView = 'chart' | 'cards' | 'table';

interface Props {
  view: CompareView;
  onChange: (next: CompareView) => void;
}

const OPTIONS: Array<{ value: CompareView; icon: typeof BarChart3 }> = [
  { value: 'chart', icon: BarChart3 },
  { value: 'cards', icon: LayoutGrid },
  { value: 'table', icon: Table },
];

export function ViewToggle({ view, onChange }: Props) {
  const t = useTranslations('financeBudgetingCompare.viewToggle');

  return (
    <div
      role="radiogroup"
      aria-label={t('label')}
      className="inline-flex items-center gap-1 rounded-full bg-surface-secondary p-1"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = view === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t(opt.value)}</span>
          </button>
        );
      })}
    </div>
  );
}
