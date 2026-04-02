'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { isAllowedForRoute } from '@/lib/route-roles';
import type { RoleKey } from '@/lib/route-roles';
import { useAuth } from '@/providers/auth-provider';

/**
 * Client-side role guard. Wraps page content and redirects to /dashboard
 * if the user's role does not match the required roles for the current route.
 */
export function RequireRole({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const userRoleKeys = React.useMemo(() => {
    if (!user?.memberships) return [] as RoleKey[];
    return user.memberships.flatMap((m) => m.roles?.map((r) => r.role_key as RoleKey) ?? []);
  }, [user]);

  const isAllowed = React.useMemo(() => {
    if (isLoading || !user) return true; // Still loading, don't block

    // Strip locale prefix (e.g., /en/students -> /students)
    const segments = (pathname ?? '').split('/').filter(Boolean);
    const pathWithoutLocale = '/' + segments.slice(1).join('/');

    return isAllowedForRoute(pathWithoutLocale, userRoleKeys);
  }, [isLoading, user, pathname, userRoleKeys]);

  React.useEffect(() => {
    if (!isLoading && user && !isAllowed) {
      const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
      router.replace(`/${locale}/dashboard`);
    }
  }, [isLoading, user, isAllowed, router, pathname]);

  if (!isLoading && user && !isAllowed) {
    return null; // Don't flash restricted content while redirecting
  }

  return <>{children}</>;
}
