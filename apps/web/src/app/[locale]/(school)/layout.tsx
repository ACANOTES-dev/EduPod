'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { toast } from '@school/ui';
import {
  AppShell,
  GroupedSubStrip,
  MobileNavOverlay,
  MorphBar,
  SubStrip,
  ToastProvider,
} from '@school/ui';

import { ErrorBoundary } from '@/components/error-boundary';
import { GlobalSearch } from '@/components/global-search';
import { PrivacyNoticeBanner } from '@/components/legal/privacy-notice-banner';
import { InboxBadge } from '@/components/morph-bar/inbox-badge';
import { NotificationPanel } from '@/components/notifications/notification-panel';
import { RequireRole } from '@/components/require-role';
import { UserMenu } from '@/components/user-menu';
import { useShortcuts } from '@/hooks/use-shortcuts';
import { apiClient, setApiErrorHandler } from '@/lib/api-client';
import { hubConfigs, hubGroupedSubStripConfigs, hubSubStripConfigs } from '@/lib/nav-config';
import { isAllowedForRoute } from '@/lib/route-roles';
import type { RoleKey } from '@/lib/route-roles';
import { RequireAuth, useAuth } from '@/providers/auth-provider';

import { RegistrationWizard } from './_components/registration-wizard/registration-wizard';
import { InboxPollingProvider } from './_providers/inbox-polling-provider';

function StripLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const { user } = useAuth();

  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [wizardOpen, setWizardOpen] = React.useState(false);
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null);
  const pathname = usePathname();

  // Listen for registration wizard open events from dashboard quick actions
  React.useEffect(() => {
    const handler = () => setWizardOpen(true);
    window.addEventListener('open-registration-wizard', handler);
    return () => window.removeEventListener('open-registration-wizard', handler);
  }, []);

  // Fetch branding logo for the morph bar (wait for auth so the token is available)
  React.useEffect(() => {
    if (!user) return;

    async function fetchLogo() {
      try {
        const result = await apiClient<{ data?: { logo_url?: string | null } }>(
          '/api/v1/branding',
          { silent: true },
        );
        const url = result.data?.logo_url ?? (result as unknown as { logo_url?: string }).logo_url;
        if (url) setLogoUrl(url);
      } catch (err) {
        // Branding may not exist yet — that's fine, show initial instead
        console.error('[fetchLogo]', err);
      }
    }
    void fetchLogo();
  }, [user]);

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

  // Determine active hub
  const locale = (pathname ?? '').split('/')[1] ?? 'en';
  const currentPathWithoutLocale = (pathname ?? '').replace(new RegExp(`^/${locale}`), '') || '/';

  const activeHub = React.useMemo(() => {
    for (const hub of hubConfigs) {
      if (
        hub.basePaths.some(
          (bp) => currentPathWithoutLocale === bp || currentPathWithoutLocale.startsWith(bp + '/'),
        )
      ) {
        return hub.key;
      }
    }
    // Fallbacks
    if (currentPathWithoutLocale.startsWith('/homework')) return 'learning';
    if (currentPathWithoutLocale.startsWith('/finance/')) return 'finance';
    return null; // Home or unknown
  }, [currentPathWithoutLocale]);

  const handleHubClick = React.useCallback(
    (hubKey: string) => {
      const hub = hubConfigs.find((h) => h.key === hubKey);
      if (!hub || hub.basePaths.length === 0) return;
      // Navigate to the first basePath the user is permitted to access, so
      // roles without access to the default landing tab (e.g. teachers and
      // the Learning hub's /classes default) land on a reachable page.
      const firstAllowed =
        hub.basePaths.find((bp) => isAllowedForRoute(bp, userRoleKeys as RoleKey[])) ??
        hub.basePaths[0];
      router.push(`/${locale}${firstAllowed}`);
    },
    [router, locale, userRoleKeys],
  );

  // ─── Grouped sub-strip (two-level nav for hubs like Learning) ──────────────
  const groupedConfigs = activeHub ? hubGroupedSubStripConfigs[activeHub] : null;
  const filteredGroupedTabs = React.useMemo(() => {
    if (!groupedConfigs) return [];
    return groupedConfigs
      .filter((g) => !g.roles || g.roles.some((r) => userRoleKeys.includes(r as RoleKey)))
      .map((g) => ({
        label: t(g.labelKey),
        ...(g.href ? { href: `/${locale}${g.href}` } : {}),
        ...(g.children
          ? {
              children: g.children
                .filter((c) => !c.roles || c.roles.some((r) => userRoleKeys.includes(r as RoleKey)))
                .map((c) => ({ label: t(c.labelKey), href: `/${locale}${c.href}` })),
            }
          : {}),
      }));
  }, [groupedConfigs, userRoleKeys, t, locale]);

  // ─── Flat sub-strip (single-level nav for other hubs) ─────────────────────
  const subStripConfigs = activeHub ? hubSubStripConfigs[activeHub] : null;
  const filteredSubStripTabs = React.useMemo(() => {
    if (!subStripConfigs || groupedConfigs) return [];
    return subStripConfigs
      .filter((tab) => !tab.roles || tab.roles.some((r) => userRoleKeys.includes(r as RoleKey)))
      .map((tab) => ({
        label: t(tab.labelKey),
        href: `/${locale}${tab.href}`,
        overflow: tab.overflow,
      }));
  }, [subStripConfigs, groupedConfigs, userRoleKeys, t, locale]);

  const derivedHubs = React.useMemo(() => {
    return hubConfigs
      .filter((hub) => !hub.roles || hub.roles.some((r) => userRoleKeys.includes(r as RoleKey)))
      .map((hub) => ({
        key: hub.key,
        label: t(hub.labelKey),
      }));
  }, [t, userRoleKeys]);

  const schoolName = user?.memberships?.[0]?.tenant?.name || t('common.appName');

  return (
    <RequireAuth>
      <InboxPollingProvider>
        <AppShell
          morphBar={
            <MorphBar
              schoolName={schoolName}
              logoUrl={logoUrl ?? undefined}
              activeHub={activeHub}
              hubs={derivedHubs}
              onHubClick={handleHubClick}
              onSearchClick={() => setCommandPaletteOpen(true)}
              notificationCount={0}
              onNotificationClick={() => {}}
              onHamburgerClick={() => setMobileNavOpen(true)}
              userName={user?.first_name || 'User'}
              onUserClick={() => {}}
              renderInboxBadge={() => <InboxBadge />}
              renderNotification={() => <NotificationPanel />}
              renderUser={() => <UserMenu />}
            />
          }
          subStrip={
            filteredGroupedTabs.length > 0 ? (
              <GroupedSubStrip
                groups={filteredGroupedTabs}
                activeTabHref={pathname || ''}
                LinkComponent={StripLink}
              />
            ) : filteredSubStripTabs.length > 0 ? (
              <SubStrip
                tabs={filteredSubStripTabs}
                activeTabHref={pathname || ''}
                LinkComponent={StripLink}
              />
            ) : null
          }
        >
          <PrivacyNoticeBanner />
          <ErrorBoundary resetKeys={[pathname]}>
            <div key={pathname} className="page-fade-in">
              <RequireRole>{children}</RequireRole>
            </div>
          </ErrorBoundary>
        </AppShell>

        <GlobalSearch open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
        <ToastProvider />
        <RegistrationWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
        <MobileNavOverlay
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          hubs={derivedHubs}
          activeHub={activeHub}
          onHubClick={handleHubClick}
          schoolName={schoolName}
          onSearchClick={() => {
            setMobileNavOpen(false);
            setCommandPaletteOpen(true);
          }}
        />
      </InboxPollingProvider>
    </RequireAuth>
  );
}
