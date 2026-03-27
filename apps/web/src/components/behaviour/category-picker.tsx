'use client';

import { cn } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

export interface CategoryOption {
  id: string;
  name: string;
  polarity: 'positive' | 'negative' | 'neutral';
  severity: number;
  point_value: number;
  color: string | null;
  icon: string | null;
}

interface CategoryPickerProps {
  categories: CategoryOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  polarityFilter?: 'positive' | 'negative' | 'neutral' | null;
}

const POLARITY_BORDER: Record<string, string> = {
  positive: 'border-green-300',
  negative: 'border-red-300',
  neutral: 'border-gray-300',
};

const POLARITY_BG_SELECTED: Record<string, string> = {
  positive: 'bg-green-50 ring-2 ring-green-500',
  negative: 'bg-red-50 ring-2 ring-red-500',
  neutral: 'bg-gray-50 ring-2 ring-gray-500',
};

export function CategoryPicker({ categories, selectedId, onSelect, polarityFilter }: CategoryPickerProps) {
  const t = useTranslations('behaviour.components.categoryPicker');
  const filtered = polarityFilter
    ? categories.filter((c) => c.polarity === polarityFilter)
    : categories;

  if (filtered.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-text-tertiary">
        {t('noCategories')}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {filtered.map((cat) => {
        const isSelected = cat.id === selectedId;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            className={cn(
              'flex min-h-[56px] flex-col items-center justify-center rounded-xl border px-3 py-3 text-center transition-all',
              POLARITY_BORDER[cat.polarity] ?? 'border-border',
              isSelected
                ? POLARITY_BG_SELECTED[cat.polarity] ?? 'bg-surface-secondary ring-2 ring-primary-500'
                : 'bg-surface hover:bg-surface-secondary',
            )}
          >
            {cat.color && (
              <span
                className="mb-1 inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: cat.color }}
              />
            )}
            <span className="text-xs font-medium text-text-primary">{cat.name}</span>
            {cat.point_value !== 0 && (
              <span className={cn(
                'mt-0.5 text-[10px] font-semibold',
                cat.point_value > 0 ? 'text-green-600' : 'text-red-600',
              )}>
                {cat.point_value > 0 ? '+' : ''}{cat.point_value} pts
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
