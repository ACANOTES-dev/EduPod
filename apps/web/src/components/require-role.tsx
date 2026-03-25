'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { useAuth } from '@/providers/auth-provider';

type RoleKey = 'school_owner' | 'school_admin' | 'teacher' | 'finance_staff' | 'admissions_staff' | 'parent';

/** Routes that any authenticated user can access (no role check needed). */
const UNRESTRICTED_PATHS = [
  '/dashboard',
  '/profile',
  '/profile/communication',
  '/select-school',
];

/** Maps route prefixes to the roles allowed to access them. */
const ROUTE_ROLE_MAP: { prefix: string; roles: RoleKey[] }[] = [
  // Parent-only pages
  { prefix: '/inquiries', roles: ['parent', 'school_owner', 'school_admin'] },
  { prefix: '/announcements', roles: ['parent', 'school_owner', 'school_admin'] },
  { prefix: '/applications', roles: ['parent', 'school_owner', 'school_admin', 'admissions_staff'] },

  // Staff/admin pages — parents excluded
  { prefix: '/students', roles: ['school_owner', 'school_admin', 'teacher', 'finance_staff', 'admissions_staff'] },
  { prefix: '/staff', roles: ['school_owner', 'school_admin'] },
  { prefix: '/households', roles: ['school_owner', 'school_admin'] },
  { prefix: '/classes', roles: ['school_owner', 'school_admin', 'teacher'] },
  { prefix: '/subjects', roles: ['school_owner', 'school_admin'] },
  { prefix: '/curriculum-matrix', roles: ['school_owner', 'school_admin'] },
  { prefix: '/promotion', roles: ['school_owner', 'school_admin'] },
  { prefix: '/attendance', roles: ['school_owner', 'school_admin', 'teacher'] },
  { prefix: '/gradebook', roles: ['school_owner', 'school_admin', 'teacher'] },
  { prefix: '/report-cards', roles: ['school_owner', 'school_admin'] },
  { prefix: '/rooms', roles: ['school_owner', 'school_admin'] },
  { prefix: '/schedules', roles: ['school_owner', 'school_admin'] },
  { prefix: '/timetables', roles: ['school_owner', 'school_admin', 'teacher'] },
  { prefix: '/scheduling', roles: ['school_owner', 'school_admin'] },
  { prefix: '/admissions', roles: ['school_owner', 'school_admin', 'admissions_staff'] },
  { prefix: '/finance', roles: ['school_owner', 'school_admin', 'finance_staff'] },
  { prefix: '/payroll', roles: ['school_owner'] },
  { prefix: '/communications', roles: ['school_owner', 'school_admin'] },
  { prefix: '/approvals', roles: ['school_owner', 'school_admin'] },
  { prefix: '/reports', roles: ['school_owner', 'school_admin', 'teacher', 'finance_staff', 'admissions_staff'] },
  { prefix: '/website', roles: ['school_owner', 'school_admin'] },
  { prefix: '/settings', roles: ['school_owner', 'school_admin'] },
];

/**
 * Client-side role guard. Wraps page content and redirects to /dashboard
 * if the user's role does not match the required roles for the current route.
 */
export function RequireRole({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const userRoleKeys = React.useMemo(() => {
    if (!user?.memberships) return [];
    return user.memberships.flatMap((m) => m.roles?.map((r) => r.role_key) ?? []);
  }, [user]);

  const isAllowed = React.useMemo(() => {
    if (isLoading || !user) return true; // Still loading, don't block

    // Strip locale prefix (e.g., /en/students -> /students)
    const segments = (pathname ?? '').split('/').filter(Boolean);
    const pathWithoutLocale = '/' + segments.slice(1).join('/');

    // Unrestricted paths — any authenticated user
    if (UNRESTRICTED_PATHS.some((p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(p + '/'))) {
      return true;
    }

    // Check route-role map
    for (const route of ROUTE_ROLE_MAP) {
      if (pathWithoutLocale === route.prefix || pathWithoutLocale.startsWith(route.prefix + '/')) {
        return route.roles.some((r) => userRoleKeys.includes(r));
      }
    }

    // No matching rule — allow by default (unknown routes should still 404 naturally)
    return true;
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
