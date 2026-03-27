'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { useAuth } from '@/providers/auth-provider';

type RoleKey = 'school_principal' | 'admin' | 'teacher' | 'accounting' | 'front_office' | 'parent' | 'school_vice_principal' | 'student';

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
  { prefix: '/inquiries', roles: ['parent', 'school_principal', 'admin', 'school_vice_principal'] },
  { prefix: '/announcements', roles: ['parent', 'school_principal', 'admin', 'school_vice_principal'] },
  { prefix: '/applications', roles: ['parent', 'school_principal', 'admin', 'school_vice_principal', 'front_office'] },

  // Behaviour — parent portal (must precede /behaviour so it matches first)
  { prefix: '/behaviour/parent-portal', roles: ['parent'] },
  // Behaviour & safeguarding — staff pages
  { prefix: '/behaviour', roles: ['school_principal', 'admin', 'school_vice_principal', 'teacher'] },
  { prefix: '/safeguarding', roles: ['school_principal', 'admin', 'school_vice_principal', 'teacher'] },

  // Staff/admin pages — parents excluded
  { prefix: '/students', roles: ['school_principal', 'admin', 'school_vice_principal', 'teacher', 'accounting', 'front_office'] },
  { prefix: '/staff', roles: ['school_principal', 'admin', 'school_vice_principal'] },
  { prefix: '/households', roles: ['school_principal', 'admin', 'school_vice_principal'] },
  { prefix: '/classes', roles: ['school_principal', 'admin', 'school_vice_principal', 'teacher'] },
  { prefix: '/subjects', roles: ['school_principal', 'admin', 'school_vice_principal'] },
  { prefix: '/curriculum-matrix', roles: ['school_principal', 'admin', 'school_vice_principal'] },
  { prefix: '/promotion', roles: ['school_principal', 'admin', 'school_vice_principal'] },
  { prefix: '/attendance', roles: ['school_principal', 'admin', 'school_vice_principal', 'teacher'] },
  { prefix: '/gradebook', roles: ['school_principal', 'admin', 'school_vice_principal', 'teacher'] },
  { prefix: '/report-cards', roles: ['school_principal', 'admin', 'school_vice_principal'] },
  { prefix: '/rooms', roles: ['school_principal', 'admin', 'school_vice_principal'] },
  { prefix: '/schedules', roles: ['school_principal', 'admin', 'school_vice_principal'] },
  { prefix: '/timetables', roles: ['school_principal', 'admin', 'school_vice_principal', 'teacher'] },
  { prefix: '/scheduling', roles: ['school_principal', 'admin', 'school_vice_principal'] },
  { prefix: '/admissions', roles: ['school_principal', 'admin', 'school_vice_principal', 'front_office'] },
  { prefix: '/finance', roles: ['school_principal', 'admin', 'accounting'] },
  { prefix: '/payroll', roles: ['school_principal'] },
  { prefix: '/communications', roles: ['school_principal', 'admin', 'school_vice_principal'] },
  { prefix: '/approvals', roles: ['school_principal', 'admin', 'school_vice_principal'] },
  { prefix: '/reports', roles: ['school_principal', 'admin', 'school_vice_principal', 'teacher', 'accounting', 'front_office'] },
  { prefix: '/website', roles: ['school_principal', 'admin', 'school_vice_principal'] },
  { prefix: '/settings', roles: ['school_principal', 'admin'] },
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
