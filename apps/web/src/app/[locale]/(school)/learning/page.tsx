'use client';

import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  FileText,
  PenLine,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import type { RoleKey } from '@/lib/route-roles';
import { ADMIN_ROLES, STAFF_ROLES } from '@/lib/route-roles';

// ─── Card configuration ─────────────────────────────────────────────────────

interface LearningCardConfig {
  key: string;
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
  roles: RoleKey[];
}

const CARDS: LearningCardConfig[] = [
  {
    key: 'classes',
    href: '/learning/classes',
    icon: Users,
    accent: 'from-violet-400 via-violet-500 to-violet-600',
    iconBg: 'bg-violet-100 text-violet-700',
    glow: 'from-violet-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'curriculum',
    href: '/learning/curriculum',
    icon: BookOpen,
    accent: 'from-teal-400 via-teal-500 to-teal-600',
    iconBg: 'bg-teal-100 text-teal-700',
    glow: 'from-teal-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'assessment',
    href: '/assessments',
    icon: ClipboardCheck,
    accent: 'from-amber-400 via-amber-500 to-amber-600',
    iconBg: 'bg-amber-100 text-amber-700',
    glow: 'from-amber-50/80',
    roles: [...STAFF_ROLES, 'parent'],
  },
  {
    key: 'homework',
    href: '/learning/homework',
    icon: PenLine,
    accent: 'from-rose-400 via-rose-500 to-rose-600',
    iconBg: 'bg-rose-100 text-rose-700',
    glow: 'from-rose-50/80',
    roles: [...STAFF_ROLES, 'parent'],
  },
  {
    key: 'attendance',
    href: '/attendance',
    icon: CalendarCheck,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
    glow: 'from-sky-50/80',
    roles: [...STAFF_ROLES, 'parent'],
  },
  {
    key: 'reportCards',
    href: '/report-cards',
    icon: FileText,
    accent: 'from-emerald-400 via-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-700',
    glow: 'from-emerald-50/80',
    roles: [...ADMIN_ROLES, 'teacher'],
  },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function LearningHubPage() {
  const t = useTranslations('learningHub');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();

  const visibleCards = React.useMemo(
    () => CARDS.filter((card) => hasAnyRole(...card.roles)),
    [hasAnyRole],
  );

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <PageHeader title={t('title')} description={t('description')} />

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2" aria-label={t('cardsAria')}>
        {visibleCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => router.push(`/${locale}${card.href}`)}
              className="group relative flex min-w-0 flex-col gap-6 overflow-hidden rounded-3xl border border-border bg-surface p-7 text-start shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:p-8"
            >
              {/* Top accent bar */}
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${card.accent}`}
              />
              {/* Hover glow overlay */}
              <div
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.glow} to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
              />

              <div className="relative flex items-start justify-between gap-4">
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset ring-black/5 ${card.iconBg}`}
                >
                  <Icon className="h-7 w-7" />
                </div>
                <ArrowRight className="h-5 w-5 text-text-tertiary transition-colors duration-300 group-hover:text-primary-600 rtl:rotate-180" />
              </div>

              <div className="relative min-w-0 space-y-2">
                <h3 className="text-xl font-semibold tracking-tight text-text-primary">
                  {t(`cards.${card.key}.title`)}
                </h3>
                <p className="text-sm leading-relaxed text-text-tertiary">
                  {t(`cards.${card.key}.description`)}
                </p>
              </div>
            </button>
          );
        })}
      </section>
    </div>
  );
}
