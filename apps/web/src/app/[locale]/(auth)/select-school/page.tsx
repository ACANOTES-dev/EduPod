'use client';

import { Building2 } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Badge } from '@school/ui';

import { useAuth } from '@/providers/auth-provider';

export default function SelectSchoolPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const { user, switchTenant, isLoading, logout } = useAuth();
  const pathname = usePathname();

  const locale = React.useMemo(() => {
    const segments = (pathname ?? '').split('/').filter(Boolean);
    return segments[0] ?? 'en';
  }, [pathname]);

  const [switchingId, setSwitchingId] = React.useState<string | null>(null);

  // Redirect to login if not authenticated
  React.useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/${locale}/login`);
    }
  }, [isLoading, user, router, locale]);

  const activeMemberships = React.useMemo(
    () => (user?.memberships ?? []).filter((m) => m.membership_status === 'active'),
    [user],
  );

  async function handleSelectSchool(tenantId: string) {
    setSwitchingId(tenantId);
    try {
      await switchTenant(tenantId);
      router.replace(`/${locale}/dashboard`);
    } catch (err) {
      console.error('[SelectSchoolPage]', err);
      setSwitchingId(null);
    }
  }

  async function handleLogout() {
    await logout();
    router.replace(`/${locale}/login`);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-text-primary">{t('selectSchool')}</h2>
        <p className="mt-1 text-sm text-text-secondary">{t('selectSchoolDescription')}</p>
      </div>

      {activeMemberships.length === 0 ? (
        <div className="py-8 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-text-tertiary" />
          <p className="text-sm text-text-secondary">{t('noSchools')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeMemberships.map((membership) => (
            <button
              key={membership.id}
              onClick={() => handleSelectSchool(membership.tenant_id)}
              disabled={switchingId !== null}
              className="flex w-full items-center gap-4 rounded-xl border border-border bg-surface-secondary p-4 text-start transition-colors hover:bg-primary-50 hover:border-primary-200 disabled:opacity-60"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                <Building2 className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">
                  {membership.tenant?.name ?? t('unknownSchool')}
                </p>
                {membership.roles && membership.roles.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {membership.roles.map((role) => (
                      <Badge key={role.id} variant="secondary" className="text-xs">
                        {role.display_name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="shrink-0 text-text-tertiary">
                {switchingId === membership.tenant_id ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="mt-6 text-center">
        <Button variant="ghost" onClick={handleLogout} className="text-sm">
          {t('logoutAndSwitch')}
        </Button>
      </div>
    </div>
  );
}
