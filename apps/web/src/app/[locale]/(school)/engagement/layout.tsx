'use client';

import { BarChart3, CalendarDays, ClipboardCheck, ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

const engagementTabs = [
  {
    key: 'formTemplates',
    label: 'formTemplates',
    href: '/engagement/form-templates',
    icon: ClipboardList,
  },
  {
    key: 'events',
    label: 'events',
    href: '/engagement/events',
    icon: CalendarDays,
  },
  {
    key: 'analytics',
    label: 'analytics',
    href: '/engagement/analytics',
    icon: BarChart3,
  },
  {
    key: 'consentArchive',
    label: 'consentArchive',
    href: '/engagement/consent-archive',
    icon: ClipboardCheck,
  },
];

export default function EngagementLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const t = useTranslations('engagement');
  const isParentRoute = (pathname ?? '').includes('/engagement/parent/');

  if (isParentRoute) {
    return <div className="pt-2">{children}</div>;
  }

  return (
    <div>
      <nav className="sticky top-0 z-10 flex gap-1 overflow-x-auto border-b border-border bg-surface pb-px">
        {engagementTabs.map((tab) => {
          const fullHref = `/${locale}${tab.href}`;
          const isActive = (pathname ?? '').startsWith(fullHref);

          return (
            <Link
              key={tab.key}
              href={fullHref}
              className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {t(`nav.${tab.label}`)}
            </Link>
          );
        })}
      </nav>
      <div className="pt-6">{children}</div>
    </div>
  );
}
