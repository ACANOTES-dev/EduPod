/**
 * Pure route-role matching logic.
 *
 * Extracted from require-role.tsx so that both the component and its tests
 * import the same constants and algorithm — no mirrored copies that drift.
 *
 * This file must have NO React, Next.js, or browser dependencies.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type RoleKey =
  | 'school_owner'
  | 'school_principal'
  | 'admin'
  | 'teacher'
  | 'accounting'
  | 'front_office'
  | 'parent'
  | 'school_vice_principal'
  | 'student';

// ─── Role groups ─────────────────────────────────────────────────────────────

export const ADMIN_ROLES: RoleKey[] = [
  'school_owner',
  'school_principal',
  'admin',
  'school_vice_principal',
];
export const STAFF_ROLES: RoleKey[] = [...ADMIN_ROLES, 'teacher', 'accounting', 'front_office'];
export const LEGAL_ROLES: RoleKey[] = [...STAFF_ROLES, 'parent', 'student'];

// ─── Unrestricted paths ──────────────────────────────────────────────────────

/** Routes that any authenticated user can access (no role check needed). */
export const UNRESTRICTED_PATHS = [
  '/dashboard',
  '/profile',
  '/profile/communication',
  '/select-school',
];

// ─── Route-role map ──────────────────────────────────────────────────────────

/** Maps route prefixes to the roles allowed to access them. */
export const ROUTE_ROLE_MAP: { prefix: string; roles: RoleKey[] }[] = [
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
  { prefix: '/classes', roles: ADMIN_ROLES },
  { prefix: '/class-assignments', roles: ADMIN_ROLES },
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
  { prefix: '/report-cards', roles: [...ADMIN_ROLES, 'teacher'] },
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

// ─── Pure matching function ──────────────────────────────────────────────────

/**
 * Determines whether the given role set is allowed to access a path.
 * @param pathWithoutLocale - The path with locale prefix already stripped (e.g. '/students')
 * @param roleKeys - The user's role keys
 */
export function isAllowedForRoute(pathWithoutLocale: string, roleKeys: RoleKey[]): boolean {
  // Unrestricted paths — any authenticated user
  if (
    UNRESTRICTED_PATHS.some((p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(p + '/'))
  ) {
    return true;
  }

  // Check route-role map
  for (const route of ROUTE_ROLE_MAP) {
    if (pathWithoutLocale === route.prefix || pathWithoutLocale.startsWith(route.prefix + '/')) {
      return route.roles.some((r) => roleKeys.includes(r));
    }
  }

  // No matching rule — allow by default (unknown routes should still 404 naturally)
  return true;
}
