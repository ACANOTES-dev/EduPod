'use client';

import {
  Activity,
  Bell,
  BellOff,
  Building2,
  CalendarClock,
  ClipboardList,
  FileSearch,
  LayoutDashboard,
  Menu,
  ScanText,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { cn } from '@school/ui';

import { ErrorBoundary } from '@/components/error-boundary';
import { usePlatformSocket } from '@/hooks/use-platform-socket';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { PlatformSocketProvider } from '@/providers/platform-socket-provider';

interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  badge?: number;
  permission: string;
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const t = useTranslations();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isLoginPath =
    pathname === `/${locale}/login` || (pathname ?? '').startsWith(`/${locale}/login/`);

  const isActive = (href: string) => {
    if (href === `/${locale}/admin`) {
      return pathname === `/${locale}/admin`;
    }
    if (href === `/${locale}/admin/audit-log`) {
      return pathname === href;
    }
    if (href === `/${locale}/admin/alerts`) {
      return pathname === href;
    }
    return (pathname ?? '').startsWith(href);
  };

  if (isLoginPath) {
    return <>{children}</>;
  }

  return (
    <PlatformAccessGate>
      <PlatformSocketProvider>
        <PlatformShell
          closeLabel={t('common.close')}
          mobileOpen={mobileOpen}
          openMenuLabel={t('sidebar.openMenu')}
          pathname={pathname}
          setMobileOpen={setMobileOpen}
          sidebarNav={
            <PlatformSidebarNav
              auditLogLabel={t('auditLog.title')}
              dashboardLabel={t('platform.admin.dashboard')}
              healthLabel={t('platform.admin.systemHealth')}
              isActive={isActive}
              locale={locale}
              securityIncidentsLabel={t('platform.admin.securityIncidents')}
              setMobileOpen={setMobileOpen}
              tenantsLabel={t('platform.tenants')}
            />
          }
          title={t('platform.admin.title')}
        >
          {children}
        </PlatformShell>
      </PlatformSocketProvider>
    </PlatformAccessGate>
  );
}

function PlatformSidebarNav({
  auditLogLabel,
  dashboardLabel,
  healthLabel,
  isActive,
  locale,
  securityIncidentsLabel,
  setMobileOpen,
  tenantsLabel,
}: {
  auditLogLabel: string;
  dashboardLabel: string;
  healthLabel: string;
  isActive: (href: string) => boolean;
  locale: string;
  securityIncidentsLabel: string;
  setMobileOpen: (open: boolean) => void;
  tenantsLabel: string;
}) {
  const { subscribe } = usePlatformSocket();
  const { user } = useAuth();
  const [openIncidentCount, setOpenIncidentCount] = React.useState(0);
  const [unacknowledgedAlertCount, setUnacknowledgedAlertCount] = React.useState(0);
  const permissions = React.useMemo(
    () => new Set(user?.platform_permissions ?? []),
    [user?.platform_permissions],
  );
  const can = React.useCallback((permission: string) => permissions.has(permission), [permissions]);

  React.useEffect(() => {
    async function fetchCounts() {
      try {
        const [incidents, alerts] = await Promise.all([
          can('platform.audit_log.view')
            ? apiClient<{ meta: { total: number } }>(
                '/api/v1/admin/security-incidents?pageSize=1&severity=high',
              )
            : Promise.resolve({ meta: { total: 0 } }),
          can('platform.alerts.view')
            ? apiClient<{ meta: { total: number } }>(
                '/api/v1/admin/alerts/history?pageSize=1&status=fired',
              )
            : Promise.resolve({ meta: { total: 0 } }),
        ]);
        setOpenIncidentCount(incidents.meta.total);
        setUnacknowledgedAlertCount(alerts.meta.total);
      } catch (err) {
        console.error('[PlatformSidebarNav.fetchCounts]', err);
      }
    }

    void fetchCounts();
    const interval = setInterval(() => void fetchCounts(), 60_000);
    return () => clearInterval(interval);
  }, [can]);

  React.useEffect(() => {
    return subscribe('alert:new', (payload) => {
      if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
        const type = (payload as { type?: unknown }).type;
        if (type === 'alert_fired') {
          setUnacknowledgedAlertCount((count) => count + 1);
        }
        if (type === 'alert_resolved') {
          setUnacknowledgedAlertCount((count) => Math.max(0, count - 1));
        }
      }
    });
  }, [subscribe]);

  React.useEffect(() => {
    function handleAcknowledged() {
      setUnacknowledgedAlertCount((count) => Math.max(0, count - 1));
    }

    window.addEventListener('platform-alerts:acknowledged', handleAcknowledged);
    return () => window.removeEventListener('platform-alerts:acknowledged', handleAcknowledged);
  }, []);

  const navItems: NavItem[] = [
    {
      icon: LayoutDashboard,
      label: dashboardLabel,
      href: `/${locale}/admin`,
      permission: 'platform.tenants.view',
    },
    {
      icon: Building2,
      label: tenantsLabel,
      href: `/${locale}/admin/tenants`,
      permission: 'platform.tenants.view',
    },
    {
      icon: Activity,
      label: healthLabel,
      href: `/${locale}/admin/health`,
      permission: 'platform.alerts.view',
    },
    {
      icon: Bell,
      label: 'Alerts',
      href: `/${locale}/admin/alerts`,
      badge: unacknowledgedAlertCount,
      permission: 'platform.alerts.view',
    },
    {
      icon: BellOff,
      label: 'Alert Silences',
      href: `/${locale}/admin/alerts/silences`,
      permission: 'platform.alerts.view',
    },
    {
      icon: CalendarClock,
      label: 'Alert Maintenance',
      href: `/${locale}/admin/maintenance`,
      permission: 'platform.alerts.view',
    },
    {
      icon: Users,
      label: 'Platform Users',
      href: `/${locale}/admin/users`,
      permission: 'platform.platform_users.view',
    },
    {
      icon: ShieldCheck,
      label: 'Permissions',
      href: `/${locale}/admin/permissions`,
      permission: 'platform.platform_users.view',
    },
    {
      icon: Workflow,
      label: 'Queues',
      href: `/${locale}/admin/queues`,
      permission: 'platform.queues.view',
    },
    {
      icon: ClipboardList,
      label: 'Tenant Audit',
      href: `/${locale}/admin/audit-log`,
      permission: 'platform.audit_log.view',
    },
    {
      icon: FileSearch,
      label: auditLogLabel,
      href: `/${locale}/admin/audit-log/platform`,
      permission: 'platform.audit_log.view',
    },
    {
      icon: ScanText,
      label: 'Error Log',
      href: `/${locale}/admin/error-log`,
      permission: 'platform.audit_log.view',
    },
    {
      icon: SlidersHorizontal,
      label: 'Redaction Rules',
      href: `/${locale}/admin/settings/redaction-rules`,
      permission: 'platform.platform_users.view',
    },
    {
      icon: ShieldAlert,
      label: securityIncidentsLabel,
      href: `/${locale}/admin/security-incidents`,
      badge: openIncidentCount,
      permission: 'platform.audit_log.view',
    },
  ];

  return (
    <nav className="flex flex-col gap-1 p-3">
      {navItems
        .filter((item) => can(item.permission))
        .map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
    </nav>
  );
}

function PlatformShell({
  children,
  closeLabel,
  mobileOpen,
  openMenuLabel,
  pathname,
  setMobileOpen,
  sidebarNav,
  title,
}: {
  children: React.ReactNode;
  closeLabel: string;
  mobileOpen: boolean;
  openMenuLabel: string;
  pathname: string | null;
  setMobileOpen: (open: boolean) => void;
  sidebarNav: React.ReactNode;
  title: string;
}) {
  const { connected } = usePlatformSocket();

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[240px] flex-col border-e border-border bg-surface">
        <div className="flex h-14 items-center border-b border-border px-5">
          <span className="text-sm font-semibold text-text-primary">{title}</span>
        </div>
        <div className="flex-1 overflow-y-auto">{sidebarNav}</div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 start-0 z-50 flex w-[260px] flex-col bg-surface shadow-lg">
            <div className="flex h-14 items-center justify-between border-b border-border px-5">
              <span className="text-sm font-semibold text-text-primary">{title}</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1 text-text-secondary hover:text-text-primary"
                aria-label={closeLabel}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{sidebarNav}</div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-surface px-6">
          <button
            className="lg:hidden p-2 text-text-secondary hover:text-text-primary"
            onClick={() => setMobileOpen(true)}
            aria-label={openMenuLabel}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                connected ? 'bg-success-text' : 'bg-danger-dot',
              )}
              aria-label={connected ? 'Real-time connected' : 'Real-time disconnected'}
              role="status"
            />
            <h1 className="truncate text-lg font-semibold text-text-primary lg:text-sm">{title}</h1>
          </div>
        </header>
        <ActiveSuppressionBanner />
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">
          <ErrorBoundary resetKeys={[pathname]}>
            <div className="mx-auto max-w-content">{children}</div>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

interface PlatformAlertSilenceSummary {
  id: string;
  scope: 'single_rule' | 'component' | 'global';
  component: string | null;
  ends_at: string;
  removed_at: string | null;
  alert_rule?: { name: string } | null;
}

interface PlatformMaintenanceWindowSummary {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  cancelled_at: string | null;
}

function ActiveSuppressionBanner() {
  const [activeSilences, setActiveSilences] = React.useState<PlatformAlertSilenceSummary[]>([]);
  const [activeWindows, setActiveWindows] = React.useState<PlatformMaintenanceWindowSummary[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [silences, windows] = await Promise.all([
          apiClient<PlatformAlertSilenceSummary[]>('/api/v1/admin/alert-silences', {
            silent: true,
          }),
          apiClient<PlatformMaintenanceWindowSummary[]>('/api/v1/admin/alert-maintenance-windows', {
            silent: true,
          }),
        ]);
        if (cancelled) return;
        const now = Date.now();
        setActiveSilences(
          silences.filter(
            (silence) => !silence.removed_at && new Date(silence.ends_at).getTime() > now,
          ),
        );
        setActiveWindows(
          windows.filter(
            (windowRow) =>
              !windowRow.cancelled_at &&
              new Date(windowRow.starts_at).getTime() <= now &&
              new Date(windowRow.ends_at).getTime() > now,
          ),
        );
      } catch (err: unknown) {
        console.error('[ActiveSuppressionBanner.load]', err);
      }
    }

    void load();
    const interval = setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (activeSilences.length === 0 && activeWindows.length === 0) {
    return null;
  }

  const firstWindow = activeWindows[0];
  const firstSilence = activeSilences[0];
  const label = firstWindow
    ? `Maintenance active: ${firstWindow.title}`
    : firstSilence
      ? `Alert silence active: ${
          firstSilence.scope === 'single_rule'
            ? (firstSilence.alert_rule?.name ?? 'single rule')
            : firstSilence.scope === 'component'
              ? firstSilence.component
              : 'global'
        }`
      : 'Alert suppression active';

  return (
    <div className="border-b border-warning-200 bg-warning-bg px-6 py-2 text-xs font-medium text-warning-text">
      {label}
    </div>
  );
}

function PlatformAccessGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  const activeMemberships = (user?.memberships ?? []).filter(
    (membership) => membership.membership_status === 'active',
  );
  const hasPlatformAccess = (user?.platform_permissions ?? []).length > 0;

  if (!isAuthenticated || activeMemberships.length > 0 || !hasPlatformAccess) {
    return <PlainNotFound />;
  }

  return <>{children}</>;
}

function PlainNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-text-primary">
      <div className="text-center">
        <h1 className="text-3xl font-semibold">404</h1>
        <p className="mt-2 text-sm text-text-secondary">Page not found</p>
      </div>
    </div>
  );
}
