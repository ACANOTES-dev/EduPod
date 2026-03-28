'use client';

import { cn } from '@school/ui';
import {
  Activity,
  Building2,
  ClipboardList,
  LayoutDashboard,
  Menu,
  ShieldAlert,
  X,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';
import { RequireAuth } from '@/providers/auth-provider';

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
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [openIncidentCount, setOpenIncidentCount] = React.useState(0);

  // Fetch open incident count for the alert badge
  React.useEffect(() => {
    async function fetchOpenIncidents() {
      try {
        const res = await apiClient<{ meta: { total: number } }>(
          '/api/v1/admin/security-incidents?pageSize=1&severity=high',
        );
        setOpenIncidentCount(res.meta.total);
      } catch {
        // Silently ignore — badge just won't show
      }
    }
    void fetchOpenIncidents();
    const interval = setInterval(() => void fetchOpenIncidents(), 60_000);
    return () => clearInterval(interval);
  }, []);

  const navItems: NavItem[] = [
    { icon: LayoutDashboard, label: 'Dashboard', href: `/${locale}/admin` },
    { icon: Building2, label: 'Tenants', href: `/${locale}/admin/tenants` },
    { icon: Activity, label: 'Health', href: `/${locale}/admin/health` },
    { icon: ClipboardList, label: 'Audit Log', href: `/${locale}/admin/audit-log` },
    { icon: ShieldAlert, label: 'Security Incidents', href: `/${locale}/admin/security-incidents`, badge: openIncidentCount },
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

  return (
    <RequireAuth>
    <div className="flex h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[240px] flex-col border-e border-border bg-surface">
        <div className="flex h-14 items-center border-b border-border px-5">
          <span className="text-sm font-semibold text-text-primary">Platform Admin</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sidebarNav}
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 start-0 z-50 flex w-[260px] flex-col bg-surface shadow-lg">
            <div className="flex h-14 items-center justify-between border-b border-border px-5">
              <span className="text-sm font-semibold text-text-primary">Platform Admin</span>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1 text-text-secondary hover:text-text-primary"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {sidebarNav}
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-surface px-6">
          <button
            className="lg:hidden p-2 text-text-secondary hover:text-text-primary"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-text-primary lg:hidden">Platform Admin</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="mx-auto max-w-content">{children}</div>
        </main>
      </div>
    </div>
    </RequireAuth>
  );
}
