'use client';

import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { useAuth } from '@/providers/auth-provider';

type RoleKey =
  | 'school_owner'
  | 'school_principal'
  | 'admin'
  | 'teacher'
  | 'accounting'
  | 'front_office'
  | 'parent'
  | 'school_vice_principal'
  | 'student';

/** Routes that any authenticated user can access (no role check needed). */
const UNRESTRICTED_PATHS = ['/dashboard', '/profile', '/profile/communication', '/select-school'];

const ADMIN_ROLES: RoleKey[] = [
  'school_owner',
  'school_principal',
  'admin',
  'school_vice_principal',
];
const STAFF_ROLES: RoleKey[] = [...ADMIN_ROLES, 'teacher', 'accounting', 'front_office'];
const LEGAL_ROLES: RoleKey[] = [...STAFF_ROLES, 'parent', 'student'];

/** Maps route prefixes to the roles allowed to access them. */
const ROUTE_ROLE_MAP: { prefix: string; roles: RoleKey[] }[] = [
  // Parent-only pages
  { prefix: '/inquiries', roles: ['parent', ...ADMIN_ROLES] },
  {
    prefix: '/announcements',
    roles: ['parent', ...ADMIN_ROLES],
  },
  {
    prefix: '/applications',
    roles: ['parent', ...ADMIN_ROLES, 'front_office'],
  },

  // SEN — parent portal (must precede /sen so it matches first)
  { prefix: '/parent/sen', roles: ['parent'] },
  // SEN — staff pages
  { prefix: '/sen', roles: STAFF_ROLES },

  // Behaviour — parent portal (must precede /behaviour so it matches first)
  { prefix: '/behaviour/parent-portal', roles: ['parent'] },
  // Behaviour & safeguarding — staff pages
  {
    prefix: '/behaviour',
    roles: [...ADMIN_ROLES, 'teacher'],
  },
  { prefix: '/pastoral', roles: [...ADMIN_ROLES, 'teacher'] },
  {
    prefix: '/safeguarding',
    roles: [...ADMIN_ROLES, 'teacher'],
  },
  { prefix: '/regulatory', roles: ADMIN_ROLES },

  // Staff/admin pages — parents excluded
  {
    prefix: '/students',
    roles: STAFF_ROLES,
  },
  { prefix: '/staff', roles: ADMIN_ROLES },
  { prefix: '/households', roles: ADMIN_ROLES },
  { prefix: '/classes', roles: [...ADMIN_ROLES, 'teacher'] },
  { prefix: '/subjects', roles: ADMIN_ROLES },
  { prefix: '/curriculum-matrix', roles: ADMIN_ROLES },
  { prefix: '/promotion', roles: ADMIN_ROLES },
  {
    prefix: '/attendance',
    roles: [...ADMIN_ROLES, 'teacher'],
  },
  {
    prefix: '/gradebook',
    roles: [...ADMIN_ROLES, 'teacher'],
  },
  // Homework — parent portal (must precede /homework so it matches first)
  { prefix: '/homework/parent', roles: ['parent'] },
  {
    prefix: '/homework',
    roles: [...ADMIN_ROLES, 'teacher'],
  },
  { prefix: '/report-cards', roles: ADMIN_ROLES },
  { prefix: '/rooms', roles: ADMIN_ROLES },
  { prefix: '/schedules', roles: ADMIN_ROLES },
  {
    prefix: '/timetables',
    roles: [...ADMIN_ROLES, 'teacher'],
  },
  { prefix: '/scheduling', roles: ADMIN_ROLES },
  {
    prefix: '/admissions',
    roles: [...ADMIN_ROLES, 'front_office'],
  },
  { prefix: '/finance', roles: [...ADMIN_ROLES, 'accounting'] },
  { prefix: '/payroll', roles: ['school_owner', 'school_principal'] },
  { prefix: '/communications', roles: ADMIN_ROLES },
  { prefix: '/approvals', roles: ADMIN_ROLES },
  {
    prefix: '/reports',
    roles: STAFF_ROLES,
  },
  { prefix: '/diary', roles: [...ADMIN_ROLES, 'teacher'] },
  { prefix: '/website', roles: ADMIN_ROLES },
  { prefix: '/settings/legal/privacy-notices', roles: ADMIN_ROLES },
  { prefix: '/settings/legal', roles: LEGAL_ROLES },
  { prefix: '/privacy-notice', roles: LEGAL_ROLES },
  { prefix: '/settings', roles: ADMIN_ROLES },
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
    if (
      UNRESTRICTED_PATHS.some(
        (p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(p + '/'),
      )
    ) {
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
