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
  | 'student'
  | 'attendance_officer';

// ─── Role groups ─────────────────────────────────────────────────────────────

export const ADMIN_ROLES: RoleKey[] = [
  'school_owner',
  'school_principal',
  'admin',
  'school_vice_principal',
];

/**
 * Strict admin-tier roles matching the backend's OWNER_ROLE_KEYS
 * (PermissionCacheService / AdminTierOnlyGuard). Does NOT include
 * the generic 'admin' role — use for oversight and other surfaces
 * where the backend enforces admin-tier only.
 */
export const ADMIN_TIER_ROLES: RoleKey[] = [
  'school_owner',
  'school_principal',
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
  '/inbox',
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

  // People hub — visible to any staff role
  { prefix: '/people', roles: STAFF_ROLES },
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
    prefix: '/assessments',
    roles: [...ADMIN_ROLES, 'teacher'],
  },
  {
    prefix: '/analytics',
    roles: [...ADMIN_ROLES, 'teacher'],
  },
  {
    prefix: '/attendance',
    roles: [...ADMIN_ROLES, 'teacher', 'attendance_officer'],
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
  { prefix: '/report-comments', roles: [...ADMIN_ROLES, 'teacher'] },
  { prefix: '/rooms', roles: ADMIN_ROLES },
  { prefix: '/schedules', roles: ADMIN_ROLES },
  {
    prefix: '/timetables',
    roles: [...ADMIN_ROLES, 'teacher'],
  },
  // Teachers can view their own timetable even though the rest of /scheduling
  // is admin-only. Must precede the broader `/scheduling` entry.
  { prefix: '/scheduling/my-timetable', roles: [...ADMIN_ROLES, 'teacher'] },
  { prefix: '/scheduling', roles: ADMIN_ROLES },
  // Operations hub landing dashboard — visible to any staff role. Individual
  // sub-pages (/admissions, /communications, etc.) still enforce their own
  // finer-grained role checks via their own prefix entries below.
  { prefix: '/operations', roles: STAFF_ROLES },
  {
    prefix: '/admissions',
    roles: [...ADMIN_ROLES, 'front_office'],
  },
  { prefix: '/finance', roles: [...ADMIN_ROLES, 'accounting'] },
  { prefix: '/payroll', roles: ['school_owner', 'school_principal'] },
  // Communications hub pages are admin-only. Non-admin users land
  // directly on /inbox when they click the morph bar hub (see
  // handleHubClick in the school layout — it skips basePaths the
  // user cannot access and falls through to /inbox).
  { prefix: '/communications', roles: ADMIN_ROLES },
  { prefix: '/inbox/audiences', roles: ADMIN_ROLES },
  { prefix: '/inbox/oversight', roles: ADMIN_TIER_ROLES },
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
  // Check route-role map FIRST so specific prefixes (e.g. /inbox/audiences)
  // take precedence over broader unrestricted matches (e.g. /inbox).
  for (const route of ROUTE_ROLE_MAP) {
    if (pathWithoutLocale === route.prefix || pathWithoutLocale.startsWith(route.prefix + '/')) {
      return route.roles.some((r) => roleKeys.includes(r));
    }
  }

  // Unrestricted paths — any authenticated user
  if (
    UNRESTRICTED_PATHS.some((p) => pathWithoutLocale === p || pathWithoutLocale.startsWith(p + '/'))
  ) {
    return true;
  }

  // No matching rule — allow by default (unknown routes should still 404 naturally)
  return true;
}
