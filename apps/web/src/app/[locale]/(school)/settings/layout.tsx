'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { cn } from '@school/ui';

interface SettingsTab {
  key: string;
  labelKey: string;
  href: string;
}

const TABS: SettingsTab[] = [
  { key: 'branding', labelKey: 'branding', href: 'branding' },
  { key: 'general', labelKey: 'general', href: 'general' },
  { key: 'notifications', labelKey: 'notifications', href: 'notifications' },
  { key: 'stripe', labelKey: 'stripe', href: 'stripe' },
  { key: 'users', labelKey: 'users', href: 'users' },
  { key: 'invitations', labelKey: 'invitations', href: 'invitations' },
  { key: 'roles', labelKey: 'roles', href: 'roles' },
  { key: 'academic-years', labelKey: 'academicYears', href: 'academic-years' },
  { key: 'year-groups', labelKey: 'yearGroups', href: 'year-groups' },
  { key: 'subjects', labelKey: 'subjects', href: 'subjects' },
  { key: 'grading-scales', labelKey: 'gradingScales', href: 'grading-scales' },
  { key: 'assessment-categories', labelKey: 'assessmentCategories', href: 'assessment-categories' },
  { key: 'audit-log', labelKey: 'auditLog', href: 'audit-log' },
  { key: 'compliance', labelKey: 'compliance', href: 'compliance' },
  { key: 'imports', labelKey: 'imports', href: 'imports' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('settings');
  const pathname = usePathname();

  // Extract locale from pathname (e.g., /en/settings/branding -> en)
  const segments = (pathname ?? '').split('/').filter(Boolean);
  const locale = segments[0] ?? 'en';

  function getActiveTab(): string {
    // segments: [locale, 'settings', tab]
    return segments[2] ?? 'branding';
  }

  const activeTab = getActiveTab();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
        {t('title')}
      </h1>

      {/* Tab navigation */}
      <nav
        className="mt-6 flex gap-1 border-b border-border"
        aria-label={t('title')}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Link
              key={tab.key}
              href={`/${locale}/settings/${tab.href}`}
              className={cn(
                'relative px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
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

      {/* Page content */}
      <div className="mt-6">{children}</div>
    </div>
  );
}
