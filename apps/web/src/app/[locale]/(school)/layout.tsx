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

import { ErrorBoundary } from '@/components/error-boundary';
import { GlobalSearch } from '@/components/global-search';
import { PrivacyNoticeBanner } from '@/components/legal/privacy-notice-banner';
import { NotificationPanel } from '@/components/notifications/notification-panel';
import { RequireRole } from '@/components/require-role';
import { UserMenu } from '@/components/user-menu';
import { useShortcuts } from '@/hooks/use-shortcuts';
import { apiClient, setApiErrorHandler } from '@/lib/api-client';
import { filterNavForRoles, navSectionConfigs } from '@/lib/nav-config';
import type { NavItemConfig } from '@/lib/nav-config';
import { ADMIN_ROLES, STAFF_ROLES } from '@/lib/route-roles';
import type { RoleKey } from '@/lib/route-roles';
import { RequireAuth, useAuth } from '@/providers/auth-provider';

import { RegistrationWizard } from './_components/registration-wizard/registration-wizard';

// ─── Icon map ───────────────────────────────────────────────────────────────

/** Maps nav item hrefs to their icons. Kept in the layout since icons are React/UI concerns. */
const ICON_MAP: Record<string, LucideIcon> = {
  '/dashboard': LayoutDashboard,
  '/announcements': Megaphone,
  '/inquiries': MessageCircle,
  '/privacy-consent': ShieldCheck,
  '/applications': ClipboardList,
  '/parent/sen': HeartHandshake,
  '/students': GraduationCap,
  '/staff': Users,
  '/households': Home,
  '/classes': BookOpen,
  '/subjects': LayoutGrid,
  '/curriculum-matrix': Grid3X3,
  '/class-assignments': UserPlus,
  '/promotion': TrendingUp,
  '/diary': CalendarDays,
  '/attendance': ClipboardCheck,
  '/gradebook': ClipboardList,
  '/homework': BookOpen,
  '/report-cards': FileText,
  '/behaviour': Shield,
  '/behaviour/incidents': Activity,
  '/behaviour/students': Users,
  '/behaviour/guardian-restrictions': Ban,
  '/pastoral': Heart,
  '/wellbeing/my-workload': Heart,
  '/wellbeing/resources': LifeBuoy,
  '/wellbeing/survey': MessageSquare,
  '/wellbeing/dashboard': BarChart3,
  '/wellbeing/surveys': ClipboardList,
  '/wellbeing/reports': FileText,
  '/sen': HeartHandshake,
  '/sen/students': GraduationCap,
  '/sen/resource-allocation': Clock,
  '/sen/sna-assignments': Users,
  '/sen/reports': BarChart3,
  '/rooms': CalendarDays,
  '/scheduling': Clock,
  '/admissions': UserPlus,
  '/engagement': PenSquare,
  '/communications': Mail,
  '/approvals': ShieldCheck,
  '/finance': Calculator,
  '/payroll': DollarSign,
  '/reports': BarChart3,
  '/regulatory': Shield,
  '/regulatory/calendar': CalendarDays,
  '/regulatory/tusla': FileCheck,
  '/regulatory/des-returns': FileText,
  '/regulatory/october-returns': ClipboardList,
  '/regulatory/ppod': ShieldCheck,
  '/regulatory/ppod/cba': ClipboardCheck,
  '/regulatory/ppod/transfers': Users,
  '/regulatory/anti-bullying': Shield,
  '/regulatory/submissions': FileText,
  '/regulatory/safeguarding': ShieldCheck,
  '/website': Globe,
  '/settings': Settings,
  '/settings/closures': Ban,
};

// ─── Derived nav with icons ─────────────────────────────────────────────────

interface NavItem extends NavItemConfig {
  icon: LucideIcon;
}

const navSections: { labelKey: string; items: NavItem[]; roles?: RoleKey[] }[] =
  navSectionConfigs.map((section) => ({
    ...section,
    items: section.items.map((item) => ({
      ...item,
      icon: ICON_MAP[item.href] ?? LayoutDashboard,
    })),
  }));

/** All top-level sidebar hrefs — pages at these exact paths don't get a back button. */
const TOP_LEVEL_HREFS = new Set(navSections.flatMap((s) => s.items.map((i) => i.href)));

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

  const filteredSections = React.useMemo(
    () => filterNavForRoles(navSectionConfigs, userRoleKeys),
    [userRoleKeys],
  );

  // Enrich filtered sections with icons for rendering
  const filteredSectionsWithIcons = React.useMemo(
    () =>
      filteredSections.map((section) => ({
        ...section,
        items: section.items.map((item) => ({
          ...item,
          icon: ICON_MAP[item.href] ?? LayoutDashboard,
        })),
      })),
    [filteredSections],
  );

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
      .catch((err) => { console.error('[Layout]', err); return setActiveSurveyBadge(null); });
  }, [isStaff]);

  // Derive page title from current path by matching nav items
  const pageTitle = React.useMemo(() => {
    // Strip locale prefix (e.g., /en/students -> /students)
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
      {filteredSectionsWithIcons.map((section) => (
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
        <ErrorBoundary resetKeys={[pathname]}>
          <RequireRole>{children}</RequireRole>
        </ErrorBoundary>
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
