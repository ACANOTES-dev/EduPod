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

import { GlobalSearch } from '@/components/global-search';
import { NotificationPanel } from '@/components/notifications/notification-panel';
import { UserMenu } from '@/components/user-menu';

import { useShortcuts } from '@/hooks/use-shortcuts';
import { RequireAuth } from '@/providers/auth-provider';

interface NavItem {
  icon: LucideIcon;
  labelKey: string;
  href: string;
}

const navSections: { labelKey: string; items: NavItem[] }[] = [
  {
    labelKey: 'nav.overview',
    items: [
      { icon: LayoutDashboard, labelKey: 'nav.dashboard', href: '/dashboard' },
    ],
  },
  {
    labelKey: 'nav.people',
    items: [
      { icon: GraduationCap, labelKey: 'nav.students', href: '/students' },
      { icon: Users, labelKey: 'nav.staff', href: '/staff' },
      { icon: Home, labelKey: 'nav.households', href: '/households' },
    ],
  },
  {
    labelKey: 'nav.academics',
    items: [
      { icon: BookOpen, labelKey: 'nav.classes', href: '/classes' },
      { icon: TrendingUp, labelKey: 'nav.promotion', href: '/promotion' },
      { icon: ClipboardCheck, labelKey: 'nav.attendance', href: '/attendance' },
      { icon: ClipboardList, labelKey: 'nav.gradebook', href: '/gradebook' },
      { icon: FileText, labelKey: 'nav.reportCards', href: '/report-cards' },
    ],
  },
  {
    labelKey: 'nav.scheduling',
    items: [
      { icon: CalendarDays, labelKey: 'nav.rooms', href: '/rooms' },
      { icon: Clock, labelKey: 'nav.schedules', href: '/schedules' },
      { icon: Grid3X3, labelKey: 'nav.timetables', href: '/timetables' },
      { icon: Sparkles, labelKey: 'nav.autoScheduling', href: '/scheduling/auto' },
      { icon: CalendarDays, labelKey: 'nav.periodGrid', href: '/scheduling/period-grid' },
      { icon: BookOpen, labelKey: 'nav.curriculum', href: '/scheduling/curriculum' },
      { icon: Users, labelKey: 'nav.competencies', href: '/scheduling/competencies' },
      { icon: History, labelKey: 'nav.schedulingRuns', href: '/scheduling/runs' },
    ],
  },
  {
    labelKey: 'nav.operations',
    items: [
      { icon: UserPlus, labelKey: 'nav.admissions', href: '/admissions' },
      { icon: Calculator, labelKey: 'nav.finance', href: '/finance' },
      { icon: DollarSign, labelKey: 'nav.payroll', href: '/payroll' },
      { icon: Mail, labelKey: 'nav.communications', href: '/communications' },
      { icon: ShieldCheck, labelKey: 'nav.approvals', href: '/approvals' },
    ],
  },
  {
    labelKey: 'nav.reports',
    items: [
      { icon: BarChart3, labelKey: 'nav.reports', href: '/reports' },
    ],
  },
  {
    labelKey: 'nav.school',
    items: [
      { icon: Globe, labelKey: 'nav.website', href: '/website' },
      { icon: Settings, labelKey: 'nav.settings', href: '/settings' },
      { icon: Ban, labelKey: 'nav.closures', href: '/settings/closures' },
    ],
  },
];

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = React.useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);

  useShortcuts([
    {
      key: 'k',
      meta: true,
      handler: () => setCommandPaletteOpen(true),
    },
  ]);

  const sidebarContent = (collapsed: boolean) => (
    <>
      {navSections.map((section) => (
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
            title={t('dashboard.title')}
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
