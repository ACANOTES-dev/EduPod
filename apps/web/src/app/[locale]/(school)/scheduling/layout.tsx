'use client';

import { BarChart3, Calendar, ClipboardList, Clock, Heart, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

const tabs = [
  { key: 'periodGrid', href: '/scheduling/period-grid', icon: Calendar },
  { key: 'requirements', href: '/scheduling/requirements', icon: ClipboardList },
  { key: 'availability', href: '/scheduling/availability', icon: Clock },
  { key: 'preferences', href: '/scheduling/preferences', icon: Heart },
  { key: 'autoScheduler', href: '/scheduling/auto', icon: Sparkles },
  { key: 'dashboard', href: '/scheduling/dashboard', icon: BarChart3 },
];

export default function SchedulingLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('scheduling');
  const pathname = usePathname();
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';

  return (
    <div className="space-y-6">
      <nav className="flex gap-1 overflow-x-auto border-b border-border pb-px">
        {tabs.map((tab) => {
          const fullHref = `/${locale}${tab.href}`;
          const isActive = pathname.startsWith(fullHref);
          return (
            <Link
              key={tab.key}
              href={fullHref}
              className={`flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {t(`auto.${tab.key}`)}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
