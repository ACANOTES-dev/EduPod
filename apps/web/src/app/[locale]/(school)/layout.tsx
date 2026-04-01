'use client';

import {
  Activity,
  ArrowLeft,
  Ban,
  BarChart3,
  BookOpen,
  Calculator,
  CalendarDays,
  Clock,
  ClipboardCheck,
  ClipboardList,
  FileCheck,
  FileText,
  DollarSign,
  GraduationCap,
  Grid3X3,
  Heart,
  HeartHandshake,
  Home,
  LayoutGrid,
  LayoutDashboard,
  LifeBuoy,
  Mail,
  Menu,
  MessageSquare,
  PenSquare,
  Plus,
  Settings,
  Shield,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  Globe,
  Megaphone,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { toast } from '@school/ui';
import {
  AppShell,
  Button,
  Sidebar,
  TopBar,
  SidebarItem,
  SidebarSection,
  MobileSidebar,
  ToastProvider,
} from '@school/ui';

import { GlobalSearch } from '@/components/global-search';
import { PrivacyNoticeBanner } from '@/components/legal/privacy-notice-banner';
import { NotificationPanel } from '@/components/notifications/notification-panel';
import { RequireRole } from '@/components/require-role';
import { UserMenu } from '@/components/user-menu';
import { useShortcuts } from '@/hooks/use-shortcuts';
import { apiClient, setApiErrorHandler } from '@/lib/api-client';
import { RequireAuth, useAuth } from '@/providers/auth-provider';

import { RegistrationWizard } from './_components/registration-wizard/registration-wizard';

// ─── Role-based navigation ──────────────────────────────────────────────────

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

/** Roles with full admin access */
const ADMIN_ROLES: RoleKey[] = [
  'school_owner',
  'school_principal',
  'admin',
  'school_vice_principal',
];
/** Roles that are school staff (not parents) */
const STAFF_ROLES: RoleKey[] = [...ADMIN_ROLES, 'teacher', 'accounting', 'front_office'];

interface NavItem {
  icon: LucideIcon;
  labelKey: string;
  href: string;
  /** If set, item is only visible to users with one of these role_keys. If omitted, visible to all. */
  roles?: RoleKey[];
}

const navSections: { labelKey: string; items: NavItem[]; roles?: RoleKey[] }[] = [
  {
    labelKey: 'nav.overview',
    items: [{ icon: LayoutDashboard, labelKey: 'nav.dashboard', href: '/dashboard' }],
  },
  {
    labelKey: 'nav.parentPortal',
    roles: ['parent'],
    items: [
      { icon: Megaphone, labelKey: 'nav.announcements', href: '/announcements', roles: ['parent'] },
      { icon: MessageCircle, labelKey: 'nav.inquiries', href: '/inquiries', roles: ['parent'] },
      {
        icon: ShieldCheck,
        labelKey: 'nav.privacyConsent',
        href: '/privacy-consent',
        roles: ['parent'],
      },
      {
        icon: ClipboardList,
        labelKey: 'nav.applications',
        href: '/applications',
        roles: ['parent'],
      },
      {
        icon: HeartHandshake,
        labelKey: 'nav.senParent',
        href: '/parent/sen',
        roles: ['parent'],
      },
    ],
  },
  {
    labelKey: 'nav.people',
    roles: STAFF_ROLES,
    items: [
      { icon: GraduationCap, labelKey: 'nav.students', href: '/students' },
      { icon: Users, labelKey: 'nav.staff', href: '/staff', roles: ADMIN_ROLES },
      { icon: Home, labelKey: 'nav.households', href: '/households', roles: ADMIN_ROLES },
    ],
  },
  {
    labelKey: 'nav.academics',
    roles: STAFF_ROLES,
    items: [
      { icon: BookOpen, labelKey: 'nav.classes', href: '/classes' },
      { icon: LayoutGrid, labelKey: 'nav.subjects', href: '/subjects', roles: ADMIN_ROLES },
      {
        icon: Grid3X3,
        labelKey: 'nav.curriculumMatrix',
        href: '/curriculum-matrix',
        roles: ADMIN_ROLES,
      },
      {
        icon: UserPlus,
        labelKey: 'nav.classAssignments',
        href: '/class-assignments',
        roles: ADMIN_ROLES,
      },
      { icon: TrendingUp, labelKey: 'nav.promotion', href: '/promotion', roles: ADMIN_ROLES },
      { icon: CalendarDays, labelKey: 'nav.diary', href: '/diary' },
    ],
  },
  {
    labelKey: 'nav.assessmentRecords',
    roles: STAFF_ROLES,
    items: [
      { icon: ClipboardCheck, labelKey: 'nav.attendance', href: '/attendance' },
      { icon: ClipboardList, labelKey: 'nav.gradebook', href: '/gradebook' },
      { icon: BookOpen, labelKey: 'nav.homework', href: '/homework' },
      { icon: FileText, labelKey: 'nav.reportCards', href: '/report-cards', roles: ADMIN_ROLES },
    ],
  },
  {
    labelKey: 'nav.behaviour',
    roles: STAFF_ROLES,
    items: [
      { icon: Shield, labelKey: 'nav.behaviourDashboard', href: '/behaviour' },
      { icon: Activity, labelKey: 'nav.behaviourIncidents', href: '/behaviour/incidents' },
      { icon: Users, labelKey: 'nav.behaviourStudents', href: '/behaviour/students' },
      {
        icon: Ban,
        labelKey: 'nav.guardianRestrictions',
        href: '/behaviour/guardian-restrictions',
        roles: ADMIN_ROLES,
      },
      {
        icon: Heart,
        labelKey: 'nav.pastoral',
        href: '/pastoral',
        roles: [...ADMIN_ROLES, 'teacher'],
      },
    ],
  },
  {
    labelKey: 'nav.wellbeing',
    roles: STAFF_ROLES,
    items: [
      { icon: Heart, labelKey: 'nav.myWorkload', href: '/wellbeing/my-workload' },
      { icon: LifeBuoy, labelKey: 'nav.supportResources', href: '/wellbeing/resources' },
      { icon: MessageSquare, labelKey: 'nav.survey', href: '/wellbeing/survey' },
      {
        icon: BarChart3,
        labelKey: 'nav.wellbeingDashboard',
        href: '/wellbeing/dashboard',
        roles: ADMIN_ROLES,
      },
      {
        icon: ClipboardList,
        labelKey: 'nav.surveyManagement',
        href: '/wellbeing/surveys',
        roles: ADMIN_ROLES,
      },
      {
        icon: FileText,
        labelKey: 'nav.boardReport',
        href: '/wellbeing/reports',
        roles: ADMIN_ROLES,
      },
    ],
  },
  {
    labelKey: 'nav.sen',
    roles: STAFF_ROLES,
    items: [
      { icon: HeartHandshake, labelKey: 'nav.senDashboard', href: '/sen' },
      { icon: GraduationCap, labelKey: 'nav.senStudents', href: '/sen/students' },
      { icon: Clock, labelKey: 'nav.senResourceAllocation', href: '/sen/resource-allocation' },
      { icon: Users, labelKey: 'nav.senSnaAssignments', href: '/sen/sna-assignments' },
      { icon: BarChart3, labelKey: 'nav.senReports', href: '/sen/reports' },
    ],
  },
  {
    labelKey: 'nav.scheduling',
    roles: STAFF_ROLES,
    items: [
      { icon: CalendarDays, labelKey: 'nav.rooms', href: '/rooms', roles: ADMIN_ROLES },
      { icon: Clock, labelKey: 'nav.scheduling', href: '/scheduling', roles: ADMIN_ROLES },
    ],
  },
  {
    labelKey: 'nav.operations',
    items: [
      {
        icon: UserPlus,
        labelKey: 'nav.admissions',
        href: '/admissions',
        roles: [...ADMIN_ROLES, 'front_office'],
      },
      {
        icon: PenSquare,
        labelKey: 'nav.engagement',
        href: '/engagement',
        roles: STAFF_ROLES,
      },
      { icon: Mail, labelKey: 'nav.communications', href: '/communications', roles: ADMIN_ROLES },
      { icon: ShieldCheck, labelKey: 'nav.approvals', href: '/approvals', roles: ADMIN_ROLES },
    ],
  },
  {
    labelKey: 'nav.financials',
    items: [
      {
        icon: Calculator,
        labelKey: 'nav.finance',
        href: '/finance',
        roles: [...ADMIN_ROLES, 'accounting'],
      },
      {
        icon: DollarSign,
        labelKey: 'nav.payroll',
        href: '/payroll',
        roles: ['school_owner', 'school_principal'],
      },
    ],
  },
  {
    labelKey: 'nav.reports',
    roles: STAFF_ROLES,
    items: [{ icon: BarChart3, labelKey: 'nav.reports', href: '/reports' }],
  },
  {
    labelKey: 'nav.regulatory',
    roles: ADMIN_ROLES,
    items: [
      { icon: Shield, labelKey: 'nav.regulatoryDashboard', href: '/regulatory' },
      { icon: CalendarDays, labelKey: 'nav.regulatoryCalendar', href: '/regulatory/calendar' },
      { icon: FileCheck, labelKey: 'nav.regulatoryTusla', href: '/regulatory/tusla' },
      { icon: FileText, labelKey: 'nav.regulatoryDesReturns', href: '/regulatory/des-returns' },
      {
        icon: ClipboardList,
        labelKey: 'nav.regulatoryOctoberReturns',
        href: '/regulatory/october-returns',
      },
      { icon: ShieldCheck, labelKey: 'nav.regulatoryPpod', href: '/regulatory/ppod' },
      { icon: ClipboardCheck, labelKey: 'nav.regulatoryCba', href: '/regulatory/ppod/cba' },
      { icon: Users, labelKey: 'nav.regulatoryTransfers', href: '/regulatory/ppod/transfers' },
      { icon: Shield, labelKey: 'nav.regulatoryAntiBullying', href: '/regulatory/anti-bullying' },
      { icon: FileText, labelKey: 'nav.regulatorySubmissions', href: '/regulatory/submissions' },
      {
        icon: ShieldCheck,
        labelKey: 'nav.regulatorySafeguarding',
        href: '/regulatory/safeguarding',
      },
    ],
  },
  {
    labelKey: 'nav.school',
    roles: ADMIN_ROLES,
    items: [
      { icon: Globe, labelKey: 'nav.website', href: '/website' },
      { icon: Settings, labelKey: 'nav.settings', href: '/settings' },
      { icon: Ban, labelKey: 'nav.closures', href: '/settings/closures' },
    ],
  },
];

/** All top-level sidebar hrefs — pages at these exact paths don't get a back button. */
const TOP_LEVEL_HREFS = new Set(navSections.flatMap((s) => s.items.map((i) => i.href)));

/** Filter nav sections and items based on the user's role keys. */
function filterNavForRoles(userRoleKeys: string[]): { labelKey: string; items: NavItem[] }[] {
  return navSections
    .filter((section) => !section.roles || section.roles.some((r) => userRoleKeys.includes(r)))
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.roles || item.roles.some((r) => userRoleKeys.includes(r)),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [activeSurveyBadge, setActiveSurveyBadge] = React.useState<'open' | 'submitted' | null>(
    null,
  );
  const pathname = usePathname();

  // Wire global API error toast
  React.useEffect(() => {
    const segments = (pathname ?? '').split('/').filter(Boolean);
    const locale = segments[0] ?? 'en';
    const pathWithoutLocale = '/' + segments.slice(1).join('/');

    setApiErrorHandler((error) => {
      if (error.code === 'DPA_NOT_ACCEPTED' && error.redirect) {
        if (!pathWithoutLocale.startsWith('/settings/legal/dpa')) {
          router.replace(`/${locale}${error.redirect}`);
        }
        return;
      }

      toast.error(error.message);
    });

    return () => {
      setApiErrorHandler(null);
    };
  }, [pathname, router]);

  useShortcuts([
    {
      key: 'k',
      meta: true,
      handler: () => setCommandPaletteOpen(true),
    },
  ]);

  const userRoleKeys = React.useMemo(() => {
    if (!user?.memberships) return [];
    return user.memberships.flatMap((m) => m.roles?.map((r) => r.role_key) ?? []);
  }, [user]);

  const filteredSections = React.useMemo(() => filterNavForRoles(userRoleKeys), [userRoleKeys]);

  // Fetch active survey status for sidebar badge (staff only)
  const isStaff = userRoleKeys.some((r) => STAFF_ROLES.includes(r as RoleKey));
  React.useEffect(() => {
    if (!isStaff) return;
    apiClient<{ hasResponded: boolean }>('/api/v1/staff-wellbeing/respond/active', { silent: true })
      .then((res) => {
        if (res && typeof res === 'object' && 'hasResponded' in res) {
          setActiveSurveyBadge(res.hasResponded ? 'submitted' : 'open');
        } else {
          setActiveSurveyBadge(null);
        }
      })
      .catch(() => setActiveSurveyBadge(null));
  }, [isStaff]);

  // Derive page title from current path by matching nav items
  const pageTitle = React.useMemo(() => {
    // Strip locale prefix (e.g., /en/students → /students)
    const path = (pathname ?? '').replace(/^\/[a-z]{2}(?=\/)/, '');
    for (const section of navSections) {
      for (const item of section.items) {
        if (path === item.href || path.startsWith(item.href + '/')) {
          return t(item.labelKey);
        }
      }
    }
    // Fallback for sub-routes not in nav
    if (path.startsWith('/homework')) return t('nav.homework');
    if (path.startsWith('/scheduling')) return t('nav.autoScheduling');
    if (path.startsWith('/profile')) return t('userMenu.profile');
    if (path.startsWith('/inquiries')) return t('nav.communications');
    if (path.startsWith('/applications')) return t('nav.admissions');
    if (path.startsWith('/students/allergy-report')) return t('nav.students');
    if (path.startsWith('/admissions/analytics')) return t('nav.admissions');
    if (path.startsWith('/finance/')) return t('nav.finance');
    if (path.startsWith('/payroll/')) return t('nav.payroll');
    if (path.startsWith('/sen')) return t('nav.sen');
    if (path.startsWith('/wellbeing/')) return t('nav.wellbeing');
    if (path.startsWith('/settings/legal')) return t('nav.legal');
    if (path.startsWith('/privacy-notice')) return t('nav.legal');
    if (path.startsWith('/regulatory')) return t('nav.regulatory');
    return t('dashboard.title');
  }, [pathname, t]);

  // Show a back button on any page that isn't a top-level sidebar destination
  const isSubPage = React.useMemo(() => {
    const path = (pathname ?? '').replace(/^\/[a-z]{2}(?=\/)/, '');
    return !TOP_LEVEL_HREFS.has(path);
  }, [pathname]);

  // Update browser tab title
  React.useEffect(() => {
    document.title = `${pageTitle} — School OS`;
  }, [pageTitle]);

  const sidebarContent = (collapsed: boolean) => (
    <>
      {!collapsed && userRoleKeys.some((r) => ADMIN_ROLES.includes(r as RoleKey)) && (
        <div className="px-3 mb-4">
          <Button
            onClick={() => setWizardOpen(true)}
            className="w-full justify-start gap-2"
            size="sm"
          >
            <Plus className="h-4 w-4" />
            {t('registration.registerFamily')}
          </Button>
        </div>
      )}
      {filteredSections.map((section) => (
        <SidebarSection key={section.labelKey} label={t(section.labelKey)} collapsed={collapsed}>
          {section.items.map((item) => (
            <div key={item.href} className="relative">
              <SidebarItem
                href={item.href}
                icon={item.icon}
                label={t(item.labelKey)}
                collapsed={collapsed}
              />
              {item.href === '/wellbeing/survey' && activeSurveyBadge === 'open' && !collapsed && (
                <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary-600" />
              )}
            </div>
          ))}
        </SidebarSection>
      ))}
    </>
  );

  return (
    <RequireAuth>
      <AppShell
        sidebar={
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            collapseLabel={t('sidebar.collapse')}
            expandLabel={t('sidebar.expand')}
            header={
              !sidebarCollapsed ? (
                <span className="text-sm font-semibold text-text-primary">
                  {t('common.appName')}
                </span>
              ) : null
            }
          >
            {sidebarContent(sidebarCollapsed)}
          </Sidebar>
        }
        topBar={
          <TopBar
            leading={
              isSubPage ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.back()}
                  aria-label={t('common.back')}
                  className="p-1.5 -ms-1"
                >
                  <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
                </Button>
              ) : undefined
            }
            title={pageTitle}
            actions={
              <div className="flex items-center gap-2">
                <NotificationPanel />
                <UserMenu />
                <button
                  className="lg:hidden p-2 text-text-secondary hover:text-text-primary"
                  onClick={() => setMobileSidebarOpen(true)}
                  aria-label={t('sidebar.openMenu')}
                >
                  <Menu className="h-5 w-5" />
                </button>
              </div>
            }
          >
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="hidden sm:flex items-center gap-2 rounded-full border border-border bg-surface-secondary px-4 py-1.5 text-sm text-text-tertiary hover:text-text-secondary transition-colors max-w-[320px]"
            >
              <span>{t('common.search')}</span>
              <kbd className="hidden md:inline-flex items-center gap-0.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-mono text-text-tertiary border border-border">
                ⌘K
              </kbd>
            </button>
          </TopBar>
        }
      >
        <PrivacyNoticeBanner />
        <RequireRole>{children}</RequireRole>
      </AppShell>

      <MobileSidebar open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <div className="shrink-0 p-4 pe-10 border-b border-border">
          <span className="text-sm font-semibold text-text-primary">{t('common.appName')}</span>
        </div>
        <nav className="flex-1 overflow-y-auto overscroll-contain p-2 touch-pan-y">
          {sidebarContent(false)}
        </nav>
        <div className="shrink-0 border-t border-border p-3">
          <UserMenu />
        </div>
      </MobileSidebar>

      <GlobalSearch open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />

      <ToastProvider />

      <RegistrationWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </RequireAuth>
  );
}
