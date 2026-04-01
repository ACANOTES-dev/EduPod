'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { cn } from '@school/ui';

import { useRoleCheck } from '@/hooks/use-role-check';

const ADMIN_ROLES = ['school_owner', 'school_principal', 'admin', 'school_vice_principal'];

export default function LegalSettingsLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('legal');
  const pathname = usePathname();
  const { roleKeys } = useRoleCheck();

  const canManagePrivacy = React.useMemo(
    () => roleKeys.some((role) => ADMIN_ROLES.includes(role)),
    [roleKeys],
  );

  const tabs = React.useMemo(
    () =>
      [
        { key: 'dpa', href: '/settings/legal/dpa', label: t('dpaTab') },
        canManagePrivacy
          ? { key: 'privacy', href: '/settings/legal/privacy-notices', label: t('privacyTab') }
          : null,
      ].filter((tab): tab is { key: string; href: string; label: string } => tab !== null),
    [canManagePrivacy, t],
  );

  return (
    <div className="space-y-6">
      <nav className="flex gap-2 overflow-x-auto border-b border-border pb-3">
        {tabs.map((tab) => {
          const isActive = pathname?.includes(tab.href) ?? false;

          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-100 text-primary-800'
                  : 'bg-surface-secondary text-text-secondary hover:text-text-primary',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
