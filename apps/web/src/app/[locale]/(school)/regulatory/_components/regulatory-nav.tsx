'use client';

import { cn } from '@school/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

// ─── Tab Definitions ─────────────────────────────────────────────────────────

interface RegulatoryTab {
  key: string;
  labelKey: string;
  href: string;
}

const TABS: RegulatoryTab[] = [
  { key: 'dashboard', labelKey: 'nav.dashboard', href: '' },
  { key: 'calendar', labelKey: 'nav.calendar', href: '/calendar' },
  { key: 'tusla', labelKey: 'nav.tusla', href: '/tusla' },
  { key: 'des-returns', labelKey: 'nav.desReturns', href: '/des-returns' },
  { key: 'october-returns', labelKey: 'nav.octoberReturns', href: '/october-returns' },
  { key: 'ppod', labelKey: 'nav.ppod', href: '/ppod' },
  { key: 'cba', labelKey: 'nav.cba', href: '/cba' },
  { key: 'transfers', labelKey: 'nav.transfers', href: '/transfers' },
  { key: 'anti-bullying', labelKey: 'nav.antiBullying', href: '/anti-bullying' },
  { key: 'submissions', labelKey: 'nav.submissions', href: '/submissions' },
  { key: 'safeguarding', labelKey: 'nav.safeguarding', href: '/safeguarding' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function RegulatoryNav() {
  const t = useTranslations('regulatory');
  const pathname = usePathname();

  // Extract locale and determine active tab
  const segments = (pathname ?? '').split('/').filter(Boolean);
  const locale = segments[0] ?? 'en';
  // Path after /regulatory — e.g., '' for dashboard, 'calendar', 'tusla', etc.
  const regulatorySegment = segments[2] ?? '';

  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-border pb-px"
      aria-label={t('title')}
    >
      {TABS.map((tab) => {
        const isActive =
          tab.key === 'dashboard'
            ? regulatorySegment === '' || regulatorySegment === 'regulatory'
            : regulatorySegment === tab.key;
        return (
          <Link
            key={tab.key}
            href={`/${locale}/regulatory${tab.href}`}
            className={cn(
              'relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
              isActive
                ? 'text-primary-700 bg-surface-secondary border-b-2 border-primary-700'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary',
            )}
            aria-current={isActive ? 'page' : undefined}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
