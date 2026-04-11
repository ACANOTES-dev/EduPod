'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { cn } from '@school/ui';

import { useAuth } from '@/providers/auth-provider';

type RoleKey =
  | 'school_owner'
  | 'school_principal'
  | 'admin'
  | 'teacher'
  | 'accounting'
  | 'front_office'
  | 'parent'
  | 'school_vice_principal'
  | 'student';

const ADMIN_SETTINGS_ROLES: RoleKey[] = [
  'school_owner',
  'school_principal',
  'admin',
  'school_vice_principal',
];

const LEGAL_SETTINGS_ROLES: RoleKey[] = [
  ...ADMIN_SETTINGS_ROLES,
  'teacher',
  'accounting',
  'front_office',
  'parent',
  'student',
];

interface SettingsTab {
  key: string;
  labelKey: string;
  href: string;
  /** If set, tab only visible to users with one of these role_keys */
  roles?: RoleKey[];
}

const TABS: SettingsTab[] = [
  { key: 'legal', labelKey: 'legal', href: 'legal/dpa', roles: LEGAL_SETTINGS_ROLES },
  { key: 'branding', labelKey: 'branding', href: 'branding', roles: ADMIN_SETTINGS_ROLES },
  { key: 'general', labelKey: 'general', href: 'general', roles: ADMIN_SETTINGS_ROLES },
  {
    key: 'notifications',
    labelKey: 'notifications',
    href: 'notifications',
    roles: ADMIN_SETTINGS_ROLES,
  },
  {
    key: 'messaging-policy',
    labelKey: 'messagingPolicy',
    href: 'messaging-policy',
    roles: ADMIN_SETTINGS_ROLES,
  },
  { key: 'stripe', labelKey: 'stripe', href: 'stripe', roles: ['school_principal'] },
  { key: 'users', labelKey: 'users', href: 'users', roles: ADMIN_SETTINGS_ROLES },
  { key: 'invitations', labelKey: 'invitations', href: 'invitations', roles: ADMIN_SETTINGS_ROLES },
  { key: 'roles', labelKey: 'roles', href: 'roles', roles: ADMIN_SETTINGS_ROLES },
  {
    key: 'academic-years',
    labelKey: 'academicYears',
    href: 'academic-years',
    roles: ADMIN_SETTINGS_ROLES,
  },
  { key: 'year-groups', labelKey: 'yearGroups', href: 'year-groups', roles: ADMIN_SETTINGS_ROLES },
  {
    key: 'grading-scales',
    labelKey: 'gradingScales',
    href: 'grading-scales',
    roles: ADMIN_SETTINGS_ROLES,
  },
  // Moved to /assessments/* teacher workflow
  // {
  //   key: 'assessment-categories',
  //   labelKey: 'assessmentCategories',
  //   href: 'assessment-categories',
  //   roles: ADMIN_SETTINGS_ROLES,
  // },
  // {
  //   key: 'grading-weights',
  //   labelKey: 'gradingWeights',
  //   href: 'grading-weights',
  //   roles: ADMIN_SETTINGS_ROLES,
  // },
  // {
  //   key: 'rubric-templates',
  //   labelKey: 'rubricTemplates',
  //   href: 'rubric-templates',
  //   roles: ADMIN_SETTINGS_ROLES,
  // },
  // {
  //   key: 'curriculum-standards',
  //   labelKey: 'curriculumStandards',
  //   href: 'curriculum-standards',
  //   roles: ADMIN_SETTINGS_ROLES,
  // },
  {
    key: 'competency-scales',
    labelKey: 'competencyScales',
    href: 'competency-scales',
    roles: ADMIN_SETTINGS_ROLES,
  },
  {
    key: 'assessment-templates',
    labelKey: 'assessmentTemplates',
    href: 'assessment-templates',
    roles: ADMIN_SETTINGS_ROLES,
  },
  {
    key: 'report-card-templates',
    labelKey: 'reportCardTemplates',
    href: 'report-card-templates',
    roles: ADMIN_SETTINGS_ROLES,
  },
  {
    key: 'custom-fields',
    labelKey: 'customFields',
    href: 'custom-fields',
    roles: ADMIN_SETTINGS_ROLES,
  },
  {
    key: 'grade-thresholds',
    labelKey: 'gradeThresholds',
    href: 'grade-thresholds',
    roles: ADMIN_SETTINGS_ROLES,
  },
  { key: 'audit-log', labelKey: 'auditLog', href: 'audit-log', roles: ADMIN_SETTINGS_ROLES },
  { key: 'compliance', labelKey: 'compliance', href: 'compliance', roles: ADMIN_SETTINGS_ROLES },
  { key: 'imports', labelKey: 'imports', href: 'imports', roles: ADMIN_SETTINGS_ROLES },
  { key: 'sen', labelKey: 'sen', href: 'sen', roles: ADMIN_SETTINGS_ROLES },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('settings');
  const pathname = usePathname();
  const { user } = useAuth();

  // Extract locale from pathname (e.g., /en/settings/branding -> en)
  const segments = (pathname ?? '').split('/').filter(Boolean);
  const locale = segments[0] ?? 'en';

  function getActiveTab(): string {
    // segments: [locale, 'settings', tab]
    return segments[2] ?? 'branding';
  }

  const activeTab = getActiveTab();

  const userRoleKeys = React.useMemo(() => {
    if (!user?.memberships) return [];
    return user.memberships.flatMap(
      (m) => m.roles?.map((r: { role_key: string }) => r.role_key) ?? [],
    );
  }, [user]);

  const visibleTabs = React.useMemo(
    () => TABS.filter((tab) => !tab.roles || tab.roles.some((r) => userRoleKeys.includes(r))),
    [userRoleKeys],
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-text-primary">{t('title')}</h1>

      {/* Tab navigation */}
      <nav
        className="mt-6 flex gap-1 overflow-x-auto border-b border-border pb-px"
        aria-label={t('title')}
      >
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <Link
              key={tab.key}
              href={`/${locale}/settings/${tab.href}`}
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

      {/* Page content */}
      <div className="mt-6">{children}</div>
    </div>
  );
}
