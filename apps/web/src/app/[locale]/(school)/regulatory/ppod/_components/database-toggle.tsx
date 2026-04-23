'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { cn } from '@school/ui';

// ─── Types ──────────────────────────────────────────────────────────────────

export type DatabaseType = 'ppod' | 'pod';

interface DatabaseToggleProps {
  value: DatabaseType;
  onChange: (value: DatabaseType) => void;
  className?: string;
}

// ─── Database Toggle ────────────────────────────────────────────────────────

export function DatabaseToggle({ value, onChange, className }: DatabaseToggleProps) {
  const t = useTranslations('regulatory.ppod');

  return (
    <div
      role="tablist"
      aria-label={t('toggleAriaLabel')}
      className={cn(
        'inline-flex gap-1 rounded-xl border border-border bg-surface-secondary p-1',
        className,
      )}
    >
      {(['ppod', 'pod'] as const).map((type) => {
        const isActive = value === type;
        return (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(type)}
            className={cn(
              'min-h-[36px] rounded-lg px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500',
              isActive
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {type === 'ppod' ? t('typePpod') : t('typePod')}
          </button>
        );
      })}
    </div>
  );
}
