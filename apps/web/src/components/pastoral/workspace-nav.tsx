'use client';

import {
  Activity,
  ClipboardList,
  Heart,
  LayoutGrid,
  ListChecks,
  NotebookPen,
  Send,
  ShieldAlert,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Badge } from '@school/ui';

import { getLocaleFromPathname } from '@/lib/pastoral';

const ITEMS = [
  {
    href: '/pastoral',
    labelKey: 'overview',
    icon: LayoutGrid,
  },
  {
    href: '/pastoral/concerns',
    labelKey: 'concerns',
    icon: NotebookPen,
  },
  {
    href: '/pastoral/cases',
    labelKey: 'cases',
    icon: ClipboardList,
  },
  {
    href: '/pastoral/interventions',
    labelKey: 'interventions',
    icon: ListChecks,
  },
  {
    href: '/pastoral/referrals',
    labelKey: 'referrals',
    icon: Send,
  },
  {
    href: '/pastoral/sst',
    labelKey: 'sst',
    icon: Users,
  },
  {
    href: '/pastoral/checkins',
    labelKey: 'checkins',
    icon: Activity,
  },
  {
    href: '/pastoral/critical-incidents',
    labelKey: 'criticalIncidents',
    icon: ShieldAlert,
  },
] as const;

export function PastoralWorkspaceNav() {
  const t = useTranslations('pastoral.workspace');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const currentPath = (pathname ?? '').replace(/^\/[a-z]{2}(?=\/)/, '');

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[28px] border border-emerald-200 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_45%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(236,253,245,0.92))] p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-emerald-800">
              <Heart className="h-3.5 w-3.5" />
              {t('eyebrow')}
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{t('title')}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">{t('description')}</p>
            </div>
          </div>
          <Badge className="w-fit bg-white/80 text-emerald-900">{t('privacyBadge')}</Badge>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const href = `/${locale}${item.href}`;
          const isActive = currentPath === item.href || currentPath.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={href}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  : 'border-border bg-surface text-text-secondary hover:bg-surface-secondary'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{t(`tabs.${item.labelKey}` as never)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
