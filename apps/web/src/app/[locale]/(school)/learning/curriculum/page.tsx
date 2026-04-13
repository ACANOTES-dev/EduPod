'use client';

import { ArrowLeft, ArrowRight, BookOpen, Grid3X3 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import type { RoleKey } from '@/lib/route-roles';
import { ADMIN_ROLES } from '@/lib/route-roles';

// ─── Card configuration ─────────────────────────────────────────────────────

interface SubCardConfig {
  key: string;
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
  roles: RoleKey[];
}

const CARDS: SubCardConfig[] = [
  {
    key: 'subjects',
    href: '/subjects',
    icon: BookOpen,
    accent: 'from-teal-400 via-teal-500 to-teal-600',
    iconBg: 'bg-teal-100 text-teal-700',
    glow: 'from-teal-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'curriculumMatrix',
    href: '/curriculum-matrix',
    icon: Grid3X3,
    accent: 'from-indigo-400 via-indigo-500 to-indigo-600',
    iconBg: 'bg-indigo-100 text-indigo-700',
    glow: 'from-indigo-50/80',
    roles: ADMIN_ROLES,
  },
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CurriculumHubPage() {
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
      <div>
        <Link
          href={`/${locale}/learning`}
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
          {t('backToLearning')}
        </Link>
        <PageHeader title={t('curriculumHub.title')} description={t('curriculumHub.description')} />
      </div>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {visibleCards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => router.push(`/${locale}${card.href}`)}
              className="group relative flex min-w-0 flex-col gap-6 overflow-hidden rounded-3xl border border-border bg-surface p-7 text-start shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:p-8"
            >
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${card.accent}`}
              />
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
                  {t(`curriculumHub.cards.${card.key}.title`)}
                </h3>
                <p className="text-sm leading-relaxed text-text-tertiary">
                  {t(`curriculumHub.cards.${card.key}.description`)}
                </p>
              </div>
            </button>
          );
        })}
      </section>
    </div>
  );
}
