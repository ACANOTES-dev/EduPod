'use client';

import { User, MessageSquare, LogOut, Sun, Moon, Monitor, ChevronDown } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import * as React from 'react';

import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@school/ui';

import { useAuth } from '@/providers/auth-provider';

import { LOCALE_REGISTRY } from '../../i18n/registry';

import { LocalePicker } from './locale-picker';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.trim()[0] ?? '';
  const l = lastName.trim()[0] ?? '';
  return (f + l).toUpperCase() || '?';
}

function extractLocale(pathname: string): string {
  const segments = (pathname ?? '').split('/').filter(Boolean);
  return segments[0] ?? 'en';
}

/* -------------------------------------------------------------------------- */
/* User Menu                                                                   */
/* -------------------------------------------------------------------------- */

export function UserMenu() {
  const t = useTranslations();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();

  const locale = extractLocale(pathname ?? '');

  if (!user) return null;

  const initials = getInitials(user.first_name, user.last_name);
  const displayName = `${user.first_name} ${user.last_name}`.trim();

  /* ---- Primary role label (localised) ---- */
  const primaryRoleRecord = user.memberships?.[0]?.roles?.[0] ?? null;
  const primaryRoleKey = primaryRoleRecord?.role_key ?? null;
  const isTier2Locale = LOCALE_REGISTRY.some((entry) => entry.code === locale && entry.tier === 2);
  let primaryRole: string | null = null;
  if (primaryRoleKey === 'parent') {
    primaryRole = t('userMenu.roleLabels.parent');
  } else if (primaryRoleKey === 'student') {
    primaryRole = t('userMenu.roleLabels.student');
  } else if (primaryRoleKey && !isTier2Locale) {
    const roleTranslationMap: Record<string, string> = {
      school_owner: t('roles.schoolOwner'),
      school_principal: t('roles.schoolPrincipal'),
      admin: t('roles.adminRole'),
      teacher: t('roles.teacher'),
      accounting: t('roles.accounting'),
      front_office: t('roles.frontOffice'),
      school_vice_principal: t('roles.schoolVicePrincipal'),
    };
    primaryRole = roleTranslationMap[primaryRoleKey] ?? primaryRoleRecord?.display_name ?? null;
  } else if (primaryRoleKey) {
    primaryRole = primaryRoleRecord?.display_name ?? null;
  }

  /* ---- Handlers ---- */
  function handleNavigate(path: string) {
    router.push(`/${locale}${path}`);
  }

  async function handleLogout() {
    await logout();
    router.replace(`/${locale}/login`);
  }

  function handleTheme(value: 'light' | 'dark' | 'system') {
    setTheme(value);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-xl p-1.5 text-start transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          aria-label={displayName}
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
          </Avatar>
          <div className="hidden sm:block min-w-0">
            <p className="truncate text-sm font-medium text-text-primary leading-tight">
              {displayName}
            </p>
            {primaryRole && (
              <p className="truncate text-xs text-text-tertiary leading-tight">{primaryRole}</p>
            )}
          </div>
          <ChevronDown className="hidden sm:block h-3.5 w-3.5 text-text-tertiary shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* User info header */}
        <div className="px-2 py-2">
          <p className="truncate text-sm font-medium text-text-primary">{displayName}</p>
          <p className="truncate text-xs text-text-tertiary" dir="ltr">
            {user.email}
          </p>
        </div>

        <DropdownMenuSeparator />

        {/* Profile */}
        <DropdownMenuItem
          className="cursor-pointer gap-2"
          onClick={() => handleNavigate('/profile')}
        >
          <User className="h-4 w-4 text-text-secondary" />
          <span>{t('userMenu.profile')}</span>
        </DropdownMenuItem>

        {/* Communication preferences */}
        <DropdownMenuItem
          className="cursor-pointer gap-2"
          onClick={() => handleNavigate('/profile/communication')}
        >
          <MessageSquare className="h-4 w-4 text-text-secondary" />
          <span>{t('userMenu.communicationPreferences')}</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <div className="px-2 py-1.5">
          <LocalePicker className="h-9 w-full" />
        </div>

        {/* Theme submenu — three inline buttons */}
        <div className="px-2 py-1.5">
          <p className="mb-1.5 text-xs text-text-tertiary">{t('userMenu.theme')}</p>
          <div className="flex gap-1">
            {(
              [
                { value: 'light', Icon: Sun, labelKey: 'userMenu.themeLight' },
                { value: 'dark', Icon: Moon, labelKey: 'userMenu.themeDark' },
                { value: 'system', Icon: Monitor, labelKey: 'userMenu.themeSystem' },
              ] as const
            ).map(({ value, Icon, labelKey }) => (
              <button
                key={value}
                type="button"
                onClick={() => handleTheme(value)}
                className={[
                  'flex flex-1 flex-col items-center gap-1 rounded-lg py-1.5 px-1 text-[10px] transition-colors',
                  theme === value
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-text-secondary hover:bg-surface-secondary',
                ].join(' ')}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(labelKey)}
              </button>
            ))}
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* Logout */}
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-danger-text focus:text-danger-text focus:bg-danger-fill"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          <span>{t('userMenu.logout')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
