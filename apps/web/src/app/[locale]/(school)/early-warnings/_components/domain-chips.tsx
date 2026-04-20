'use client';

import { Activity, BookOpen, CalendarCheck, HeartPulse, LayoutGrid, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { SignalDomain } from '@/lib/early-warning';

export type DomainFilter = SignalDomain | 'all';

interface DomainChipsProps {
  value: DomainFilter;
  onChange: (value: DomainFilter) => void;
  counts: Record<DomainFilter, number>;
}

const DOMAIN_ORDER: DomainFilter[] = [
  'all',
  'attendance',
  'grades',
  'behaviour',
  'wellbeing',
  'engagement',
];

const DOMAIN_ICON: Record<DomainFilter, LucideIcon> = {
  all: LayoutGrid,
  attendance: CalendarCheck,
  grades: BookOpen,
  behaviour: Activity,
  wellbeing: HeartPulse,
  engagement: Sparkles,
};

const DOMAIN_ACCENT: Record<DomainFilter, string> = {
  all: 'data-[active=true]:bg-slate-900 data-[active=true]:text-white',
  attendance: 'data-[active=true]:bg-sky-600 data-[active=true]:text-white',
  grades: 'data-[active=true]:bg-violet-600 data-[active=true]:text-white',
  behaviour: 'data-[active=true]:bg-rose-600 data-[active=true]:text-white',
  wellbeing: 'data-[active=true]:bg-teal-600 data-[active=true]:text-white',
  engagement: 'data-[active=true]:bg-pink-600 data-[active=true]:text-white',
};

export function DomainChips({ value, onChange, counts }: DomainChipsProps) {
  const t = useTranslations('earlyWarningsHub.domains');

  return (
    <div
      role="tablist"
      aria-label={t('ariaLabel')}
      className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1"
    >
      {DOMAIN_ORDER.map((domain) => {
        const Icon = DOMAIN_ICON[domain];
        const active = value === domain;
        const count = counts[domain] ?? 0;
        return (
          <button
            key={domain}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            onClick={() => onChange(domain)}
            className={`group inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-medium text-text-secondary transition-all hover:border-border-strong hover:bg-surface-secondary ${DOMAIN_ACCENT[domain]}`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{t(domain)}</span>
            {count > 0 && (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-black/10 px-1.5 py-0 text-[11px] font-semibold leading-tight group-data-[active=true]:bg-white/20">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
