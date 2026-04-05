'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { toast } from '@school/ui';
import {
  AppShell,
  MorphBar,
  SubStrip,
  MobileNavOverlay,
  ToastProvider,
} from '@school/ui';

import { ErrorBoundary } from '@/components/error-boundary';
import { GlobalSearch } from '@/components/global-search';
import { PrivacyNoticeBanner } from '@/components/legal/privacy-notice-banner';
import { RequireRole } from '@/components/require-role';
import { useShortcuts } from '@/hooks/use-shortcuts';
import { setApiErrorHandler } from '@/lib/api-client';
import { hubConfigs, hubSubStripConfigs } from '@/lib/nav-config';
import type { RoleKey } from '@/lib/route-roles';
import { RequireAuth, useAuth } from '@/providers/auth-provider';

import { RegistrationWizard } from './_components/registration-wizard/registration-wizard';

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations();
  const router = useRouter();
  const { user } = useAuth();
  
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [wizardOpen, setWizardOpen] = React.useState(false);
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

  // Determine active hub
  const locale = (pathname ?? '').split('/')[1] ?? 'en';
  const currentPathWithoutLocale = (pathname ?? '').replace(new RegExp(`^/${locale}`), '') || '/';
  
  const activeHub = React.useMemo(() => {
    for (const hub of hubConfigs) {
      if (hub.basePaths.some(bp => currentPathWithoutLocale === bp || currentPathWithoutLocale.startsWith(bp + '/'))) {
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
      const hub = hubConfigs.find(h => h.key === hubKey);
      if (hub && hub.basePaths.length > 0) {
        router.push(`/${locale}${hub.basePaths[0]}`);
      }
    },
    [router, locale]
  );

  const subStripConfigs = activeHub ? hubSubStripConfigs[activeHub] : null;
  const filteredSubStripTabs = React.useMemo(() => {
    if (!subStripConfigs) return [];
    return subStripConfigs
      .filter(tab => !tab.roles || tab.roles.some(r => userRoleKeys.includes(r as RoleKey)))
      .map(tab => ({
        label: t(tab.labelKey),
        href: `/${locale}${tab.href}`,
        overflow: tab.overflow,
      }));
  }, [subStripConfigs, userRoleKeys, t, locale]);

  const derivedHubs = React.useMemo(() => {
    return hubConfigs
      .filter(hub => !hub.roles || hub.roles.some(r => userRoleKeys.includes(r as RoleKey)))
      .map(hub => ({
        key: hub.key,
        label: t(hub.labelKey),
      }));
  }, [t, userRoleKeys]);

  return (
    <RequireAuth>
      <AppShell
        morphBar={
          <MorphBar
            schoolName={t('common.appName')}
            activeHub={activeHub}
            hubs={derivedHubs}
            onHubClick={handleHubClick}
            onSearchClick={() => setCommandPaletteOpen(true)}
            notificationCount={0}
            onNotificationClick={() => {}}
            onHamburgerClick={() => setMobileNavOpen(true)}
            userName={user?.first_name || 'User'}
            onUserClick={() => {}}
          />
        }
        subStrip={
          filteredSubStripTabs.length > 0 ? (
            <SubStrip
              tabs={filteredSubStripTabs}
              activeTabHref={pathname || ''}
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
        schoolName={t('common.appName')}
        onSearchClick={() => {
          setMobileNavOpen(false);
          setCommandPaletteOpen(true);
        }}
      />
    </RequireAuth>
  );
}
