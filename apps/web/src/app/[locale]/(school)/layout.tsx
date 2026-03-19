'use client';

import {
  Ban,
  BarChart3,
  BookOpen,
  Calculator,
  CalendarDays,
  Clock,
  ClipboardCheck,
  ClipboardList,
  FileText,
  DollarSign,
  GraduationCap,
  Grid3X3,
  History,
  Home,
  LayoutDashboard,
  Mail,
  Menu,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Globe,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  AppShell,
  Sidebar,
  TopBar,
  SidebarItem,
  SidebarSection,
  MobileSidebar,
  ToastProvider,
} from '@school/ui';

import { usePathname } from 'next/navigation';
import { toast } from '@school/ui';
import { GlobalSearch } from '@/components/global-search';
import { NotificationPanel } from '@/components/notifications/notification-panel';
import { UserMenu } from '@/components/user-menu';
import { setApiErrorHandler } from '@/lib/api-client';

import { useShortcuts } from '@/hooks/use-shortcuts';
import { RequireAuth, useAuth } from '@/providers/auth-provider';

// ─── Role-based navigation ──────────────────────────────────────────────────

type RoleKey = 'school_owner' | 'school_admin' | 'teacher' | 'finance_staff' | 'admissions_staff' | 'parent';

/** Roles with full admin access */
const ADMIN_ROLES: RoleKey[] = ['school_owner', 'school_admin'];
/** Roles that are school staff (not parents) */
const STAFF_ROLES: RoleKey[] = ['school_owner', 'school_admin', 'teacher', 'finance_staff', 'admissions_staff'];

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
    items: [
      { icon: LayoutDashboard, labelKey: 'nav.dashboard', href: '/dashboard' },
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
      { icon: TrendingUp, labelKey: 'nav.promotion', href: '/promotion', roles: ADMIN_ROLES },
      { icon: ClipboardCheck, labelKey: 'nav.attendance', href: '/attendance' },
      { icon: ClipboardList, labelKey: 'nav.gradebook', href: '/gradebook' },
      { icon: FileText, labelKey: 'nav.reportCards', href: '/report-cards', roles: ADMIN_ROLES },
    ],
  },
  {
    labelKey: 'nav.scheduling',
    roles: STAFF_ROLES,
    items: [
      { icon: CalendarDays, labelKey: 'nav.rooms', href: '/rooms', roles: ADMIN_ROLES },
      { icon: Clock, labelKey: 'nav.schedules', href: '/schedules', roles: ADMIN_ROLES },
      { icon: Grid3X3, labelKey: 'nav.timetables', href: '/timetables' },
      { icon: Sparkles, labelKey: 'nav.autoScheduling', href: '/scheduling/auto', roles: ADMIN_ROLES },
      { icon: CalendarDays, labelKey: 'nav.periodGrid', href: '/scheduling/period-grid', roles: ADMIN_ROLES },
      { icon: BookOpen, labelKey: 'nav.curriculum', href: '/scheduling/curriculum', roles: ADMIN_ROLES },
      { icon: Users, labelKey: 'nav.competencies', href: '/scheduling/competencies', roles: ADMIN_ROLES },
      { icon: History, labelKey: 'nav.schedulingRuns', href: '/scheduling/runs', roles: ADMIN_ROLES },
    ],
  },
  {
    labelKey: 'nav.operations',
    items: [
      { icon: UserPlus, labelKey: 'nav.admissions', href: '/admissions', roles: [...ADMIN_ROLES, 'admissions_staff'] },
      { icon: Calculator, labelKey: 'nav.finance', href: '/finance', roles: [...ADMIN_ROLES, 'finance_staff'] },
      { icon: DollarSign, labelKey: 'nav.payroll', href: '/payroll', roles: ADMIN_ROLES },
      { icon: Mail, labelKey: 'nav.communications', href: '/communications', roles: ADMIN_ROLES },
      { icon: ShieldCheck, labelKey: 'nav.approvals', href: '/approvals', roles: ADMIN_ROLES },
    ],
  },
  {
    labelKey: 'nav.reports',
    roles: STAFF_ROLES,
    items: [
      { icon: BarChart3, labelKey: 'nav.reports', href: '/reports' },
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

/** Filter nav sections and items based on the user's role keys. */
function filterNavForRoles(userRoleKeys: string[]): { labelKey: string; items: NavItem[] }[] {
  return navSections
    .filter((section) => !section.roles || section.roles.some((r) => userRoleKeys.includes(r)))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.roles || item.roles.some((r) => userRoleKeys.includes(r))),
    }))
    .filter((section) => section.items.length > 0);
}

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const { user } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);

  // Wire global API error toast
  React.useEffect(() => {
    setApiErrorHandler((msg) => toast.error(msg));
  }, []);

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

  // Derive page title from current path by matching nav items
  const pathname = usePathname();
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
    return t('dashboard.title');
  }, [pathname, t]);

  // Update browser tab title
  React.useEffect(() => {
    document.title = `${pageTitle} — School OS`;
  }, [pageTitle]);

  const sidebarContent = (collapsed: boolean) => (
    <>
      {filteredSections.map((section) => (
        <SidebarSection key={section.labelKey} label={t(section.labelKey)} collapsed={collapsed}>
          {section.items.map((item) => (
            <SidebarItem
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={t(item.labelKey)}
              collapsed={collapsed}
            />
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
            header={
              !sidebarCollapsed ? (
                <span className="text-sm font-semibold text-text-primary">{t('common.appName')}</span>
              ) : null
            }
          >
            {sidebarContent(sidebarCollapsed)}
          </Sidebar>
        }
        topBar={
          <TopBar
            title={pageTitle}
            actions={
              <div className="flex items-center gap-2">
                <NotificationPanel />
                <UserMenu />
                <button
                  className="lg:hidden p-2 text-text-secondary hover:text-text-primary"
                  onClick={() => setMobileSidebarOpen(true)}
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
        {children}
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
    </RequireAuth>
  );
}
