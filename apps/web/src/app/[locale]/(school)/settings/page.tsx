'use client';

import {
  ArrowRight,
  Bell,
  BookOpen,
  ClipboardCheck,
  CreditCard,
  Database,
  GraduationCap,
  Heart,
  type LucideIcon,
  Paintbrush,
  Scale,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import type { RoleKey } from '@/lib/route-roles';

// ─── Types ──────────────────────────────────────────────────────────────────

interface SettingsTileConfig {
  labelKey: string;
  descKey: string;
  href: string;
  icon: LucideIcon;
}

interface SettingsCategoryConfig {
  titleKey: string;
  descKey: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  roles: RoleKey[];
  items: SettingsTileConfig[];
}

// ─── Role sets ──────────────────────────────────────────────────────────────

const ADMIN_ROLES: RoleKey[] = [
  'school_owner',
  'school_principal',
  'admin',
  'school_vice_principal',
];

const ALL_ROLES: RoleKey[] = [
  ...ADMIN_ROLES,
  'teacher',
  'accounting',
  'front_office',
  'parent',
  'student',
];

// ─── Category definitions ───────────────────────────────────────────────────

const CATEGORIES: SettingsCategoryConfig[] = [
  {
    titleKey: 'hub.schoolIdentity',
    descKey: 'hub.schoolIdentityDesc',
    icon: Paintbrush,
    accent: 'from-violet-400 via-violet-500 to-violet-600',
    iconBg: 'bg-violet-100 text-violet-700',
    roles: ADMIN_ROLES,
    items: [
      {
        labelKey: 'hub.branding',
        descKey: 'hub.brandingDesc',
        href: '/settings/branding',
        icon: Paintbrush,
      },
      {
        labelKey: 'hub.general',
        descKey: 'hub.generalDesc',
        href: '/settings/general',
        icon: BookOpen,
      },
    ],
  },
  {
    titleKey: 'hub.peopleAccess',
    descKey: 'hub.peopleAccessDesc',
    icon: Users,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
    roles: ADMIN_ROLES,
    items: [
      {
        labelKey: 'hub.users',
        descKey: 'hub.usersDesc',
        href: '/settings/users',
        icon: Users,
      },
      {
        labelKey: 'hub.invitations',
        descKey: 'hub.invitationsDesc',
        href: '/settings/invitations',
        icon: Users,
      },
      {
        labelKey: 'hub.roles',
        descKey: 'hub.rolesDesc',
        href: '/settings/roles',
        icon: Users,
      },
    ],
  },
  {
    titleKey: 'hub.academicStructure',
    descKey: 'hub.academicStructureDesc',
    icon: GraduationCap,
    accent: 'from-emerald-400 via-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-700',
    roles: ADMIN_ROLES,
    items: [
      {
        labelKey: 'hub.academicYears',
        descKey: 'hub.academicYearsDesc',
        href: '/settings/academic-years',
        icon: GraduationCap,
      },
      {
        labelKey: 'hub.yearGroups',
        descKey: 'hub.yearGroupsDesc',
        href: '/settings/year-groups',
        icon: GraduationCap,
      },
    ],
  },
  {
    titleKey: 'hub.assessmentGrading',
    descKey: 'hub.assessmentGradingDesc',
    icon: ClipboardCheck,
    accent: 'from-amber-400 via-amber-500 to-amber-600',
    iconBg: 'bg-amber-100 text-amber-700',
    roles: ADMIN_ROLES,
    items: [
      {
        labelKey: 'hub.gradingScales',
        descKey: 'hub.gradingScalesDesc',
        href: '/settings/grading-scales',
        icon: ClipboardCheck,
      },
      {
        labelKey: 'hub.competencyScales',
        descKey: 'hub.competencyScalesDesc',
        href: '/settings/competency-scales',
        icon: ClipboardCheck,
      },
      {
        labelKey: 'hub.assessmentTemplates',
        descKey: 'hub.assessmentTemplatesDesc',
        href: '/settings/assessment-templates',
        icon: ClipboardCheck,
      },
      {
        labelKey: 'hub.reportCardTemplates',
        descKey: 'hub.reportCardTemplatesDesc',
        href: '/settings/report-card-templates',
        icon: ClipboardCheck,
      },
      {
        labelKey: 'hub.gradeThresholds',
        descKey: 'hub.gradeThresholdsDesc',
        href: '/settings/grade-thresholds',
        icon: ClipboardCheck,
      },
    ],
  },
  {
    titleKey: 'hub.communication',
    descKey: 'hub.communicationDesc',
    icon: Bell,
    accent: 'from-rose-400 via-rose-500 to-rose-600',
    iconBg: 'bg-rose-100 text-rose-700',
    roles: ADMIN_ROLES,
    items: [
      {
        labelKey: 'hub.notifications',
        descKey: 'hub.notificationsDesc',
        href: '/settings/notifications',
        icon: Bell,
      },
      {
        labelKey: 'hub.messagingPolicy',
        descKey: 'hub.messagingPolicyDesc',
        href: '/settings/messaging-policy',
        icon: Bell,
      },
    ],
  },
  {
    titleKey: 'hub.financePayments',
    descKey: 'hub.financePaymentsDesc',
    icon: CreditCard,
    accent: 'from-teal-400 via-teal-500 to-teal-600',
    iconBg: 'bg-teal-100 text-teal-700',
    roles: ['school_principal'],
    items: [
      {
        labelKey: 'hub.stripe',
        descKey: 'hub.stripeDesc',
        href: '/settings/stripe',
        icon: CreditCard,
      },
    ],
  },
  {
    titleKey: 'hub.legalCompliance',
    descKey: 'hub.legalComplianceDesc',
    icon: Scale,
    accent: 'from-indigo-400 via-indigo-500 to-indigo-600',
    iconBg: 'bg-indigo-100 text-indigo-700',
    roles: ALL_ROLES,
    items: [
      {
        labelKey: 'hub.legal',
        descKey: 'hub.legalDesc',
        href: '/settings/legal/dpa',
        icon: Scale,
      },
      {
        labelKey: 'hub.compliance',
        descKey: 'hub.complianceDesc',
        href: '/settings/compliance',
        icon: Scale,
      },
      {
        labelKey: 'hub.auditLog',
        descKey: 'hub.auditLogDesc',
        href: '/settings/audit-log',
        icon: Scale,
      },
    ],
  },
  {
    titleKey: 'hub.dataManagement',
    descKey: 'hub.dataManagementDesc',
    icon: Database,
    accent: 'from-slate-400 via-slate-500 to-slate-600',
    iconBg: 'bg-slate-100 text-slate-700',
    roles: ADMIN_ROLES,
    items: [
      {
        labelKey: 'hub.customFields',
        descKey: 'hub.customFieldsDesc',
        href: '/settings/custom-fields',
        icon: Database,
      },
      {
        labelKey: 'hub.imports',
        descKey: 'hub.importsDesc',
        href: '/settings/imports',
        icon: Database,
      },
    ],
  },
  {
    titleKey: 'hub.wellbeing',
    descKey: 'hub.wellbeingDesc',
    icon: Heart,
    accent: 'from-pink-400 via-pink-500 to-pink-600',
    iconBg: 'bg-pink-100 text-pink-700',
    roles: ADMIN_ROLES,
    items: [
      {
        labelKey: 'hub.sen',
        descKey: 'hub.senDesc',
        href: '/settings/sen',
        icon: Heart,
      },
    ],
  },
];

// ─── Tile Component ─────────────────────────────────────────────────────────

function SettingsTile({
  item,
  locale,
  t,
}: {
  item: SettingsTileConfig;
  locale: string;
  t: (key: string) => string;
}) {
  return (
    <Link
      href={`/${locale}${item.href}`}
      className="group flex items-start gap-3.5 rounded-xl border border-border bg-surface p-4 transition-all hover:border-border-strong hover:shadow-sm"
    >
      <div className="shrink-0 rounded-lg bg-surface-secondary p-2 transition-colors group-hover:bg-primary/10">
        <item.icon className="h-4 w-4 text-text-secondary transition-colors group-hover:text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{t(item.labelKey)}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">{t(item.descKey)}</p>
      </div>
      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180" />
    </Link>
  );
}

// ─── Category Section Component ─────────────────────────────────────────────

function CategorySection({
  category,
  locale,
  t,
}: {
  category: SettingsCategoryConfig;
  locale: string;
  t: (key: string) => string;
}) {
  const Icon = category.icon;

  return (
    <div className="group/section relative overflow-hidden rounded-2xl border border-border bg-surface">
      {/* Accent bar */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${category.accent}`}
      />

      {/* Category header */}
      <div className="flex items-start gap-4 px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-inset ring-black/5 ${category.iconBg}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-text-primary">
            {t(category.titleKey)}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">{t(category.descKey)}</p>
        </div>
      </div>

      {/* Tiles grid */}
      <div className="grid grid-cols-1 gap-2.5 px-5 pb-5 pt-3 sm:grid-cols-2 sm:px-6 sm:pb-6">
        {category.items.map((item) => (
          <SettingsTile key={item.href} item={item} locale={locale} t={t} />
        ))}
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SettingsHubPage() {
  const t = useTranslations('settings');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();

  const visibleCategories = React.useMemo(
    () => CATEGORIES.filter((cat) => hasAnyRole(...cat.roles)),
    [hasAnyRole],
  );

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <PageHeader title={t('hub.title')} description={t('hub.description')} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {visibleCategories.map((category) => (
          <CategorySection key={category.titleKey} category={category} locale={locale} t={t} />
        ))}
      </div>
    </div>
  );
}
