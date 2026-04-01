'use client';

import { cn } from '@school/ui';
import {
  BarChart3,
  Clock,
  GraduationCap,
  HeartHandshake,
  LayoutDashboard,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

// ─── Tab definitions ──────────────────────────────────────────────────────────

interface NavTab {
  key: string;
  href: string;
  icon: LucideIcon;
}

const tabs: NavTab[] = [
  { key: 'dashboard', href: '/sen', icon: LayoutDashboard },
  { key: 'students', href: '/sen/students', icon: GraduationCap },
  { key: 'resource-allocation', href: '/sen/resource-allocation', icon: Clock },
  { key: 'sna-assignments', href: '/sen/sna-assignments', icon: Users },
  { key: 'reports', href: '/sen/reports', icon: BarChart3 },
];

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function SenLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('sen');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  return (
    <div className="space-y-6">
      {/* Module header */}
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2.5">
          <HeartHandshake className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            {t('module.title')}
          </h1>
          <p className="text-sm text-text-secondary">{t('module.description')}</p>
        </div>
      </div>

      {/* Tab navigation — horizontally scrollable */}
      <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => {
          const fullHref = `/${locale}${tab.href}`;
          const isActive =
            tab.key === 'dashboard'
              ? (pathname ?? '') === fullHref
              : (pathname ?? '').startsWith(fullHref);

          return (
            <Link
              key={tab.key}
              href={fullHref}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-b-2 border-primary-700 bg-surface-secondary text-primary-700'
                  : 'text-text-secondary hover:text-text-primary',
              )}
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              {t(`nav.${tab.key}`)}
            </Link>
          );
        })}
      </nav>

      {/* Page content */}
      <div>{children}</div>
    </div>
  );
}
