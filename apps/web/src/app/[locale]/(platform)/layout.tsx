'use client';

import {
  Activity,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Menu,
  ShieldAlert,
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
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const t = useTranslations();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [openIncidentCount, setOpenIncidentCount] = React.useState(0);
  const isLoginPath =
    pathname === `/${locale}/login` || (pathname ?? '').startsWith(`/${locale}/login/`);

  // Fetch open incident count for the alert badge
  React.useEffect(() => {
    if (isLoginPath) {
      return undefined;
    }

    async function fetchOpenIncidents() {
      try {
        const res = await apiClient<{ meta: { total: number } }>(
          '/api/v1/admin/security-incidents?pageSize=1&severity=high',
        );
        setOpenIncidentCount(res.meta.total);
      } catch (err) {
        console.error('[PlatformLayout.fetchOpenIncidents]', err);
      }
    }
    void fetchOpenIncidents();
    const interval = setInterval(() => void fetchOpenIncidents(), 60_000);
    return () => clearInterval(interval);
  }, [isLoginPath]);

  const navItems: NavItem[] = [
    { icon: LayoutDashboard, label: t('platform.admin.dashboard'), href: `/${locale}/admin` },
    { icon: Building2, label: t('platform.tenants'), href: `/${locale}/admin/tenants` },
    { icon: Activity, label: t('platform.admin.systemHealth'), href: `/${locale}/admin/health` },
    { icon: Workflow, label: 'Queues', href: `/${locale}/admin/queues` },
    { icon: ClipboardList, label: t('auditLog.title'), href: `/${locale}/admin/audit-log` },
    {
      icon: ShieldAlert,
      label: t('platform.admin.securityIncidents'),
      href: `/${locale}/admin/security-incidents`,
      badge: openIncidentCount,
    },
  ];

  const isActive = (href: string) => {
    if (href === `/${locale}/admin`) {
      return pathname === `/${locale}/admin`;
    }
    return (pathname ?? '').startsWith(href);
  };

  const sidebarNav = (
    <nav className="flex flex-col gap-1 p-3">
      {navItems.map((item) => {
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
          sidebarNav={sidebarNav}
          title={t('platform.admin.title')}
        >
          {children}
        </PlatformShell>
      </PlatformSocketProvider>
    </PlatformAccessGate>
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
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">
          <ErrorBoundary resetKeys={[pathname]}>
            <div className="mx-auto max-w-content">{children}</div>
          </ErrorBoundary>
        </main>
      </div>
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

  if (!isAuthenticated || activeMemberships.length > 0) {
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
