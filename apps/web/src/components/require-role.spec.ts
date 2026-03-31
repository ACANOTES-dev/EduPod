/**
 * Unit tests for RequireRole — route-role access logic.
 *
 * These tests exercise the pure routing and role-matching logic that the
 * RequireRole component uses to decide whether to allow or redirect a user.
 * We replicate the same constants and algorithm here so we can test every
 * branch without mounting React components.
 */

export {}; // Module boundary — prevents global scope collisions with other spec files

// ─── Types ───────────────────────────────────────────────────────────────────

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

// ─── Constants (mirrored from require-role.tsx) ───────────────────────────────

const UNRESTRICTED_PATHS = ['/dashboard', '/profile', '/profile/communication', '/select-school'];

const ADMIN_ROLES: RoleKey[] = [
  'school_owner',
  'school_principal',
  'admin',
  'school_vice_principal',
];
const STAFF_ROLES: RoleKey[] = [...ADMIN_ROLES, 'teacher', 'accounting', 'front_office'];
const LEGAL_ROLES: RoleKey[] = [...STAFF_ROLES, 'parent', 'student'];

const ROUTE_ROLE_MAP: { prefix: string; roles: RoleKey[] }[] = [
  { prefix: '/inquiries', roles: ['parent', ...ADMIN_ROLES] },
  { prefix: '/announcements', roles: ['parent', ...ADMIN_ROLES] },
  { prefix: '/applications', roles: ['parent', ...ADMIN_ROLES, 'front_office'] },
  { prefix: '/behaviour/parent-portal', roles: ['parent'] },
  { prefix: '/behaviour', roles: [...ADMIN_ROLES, 'teacher'] },
  { prefix: '/pastoral', roles: [...ADMIN_ROLES, 'teacher'] },
  { prefix: '/safeguarding', roles: [...ADMIN_ROLES, 'teacher'] },
  { prefix: '/regulatory', roles: ADMIN_ROLES },
  { prefix: '/students', roles: STAFF_ROLES },
  { prefix: '/staff', roles: ADMIN_ROLES },
  { prefix: '/households', roles: ADMIN_ROLES },
  { prefix: '/classes', roles: [...ADMIN_ROLES, 'teacher'] },
  { prefix: '/subjects', roles: ADMIN_ROLES },
  { prefix: '/curriculum-matrix', roles: ADMIN_ROLES },
  { prefix: '/promotion', roles: ADMIN_ROLES },
  { prefix: '/attendance', roles: [...ADMIN_ROLES, 'teacher'] },
  { prefix: '/gradebook', roles: [...ADMIN_ROLES, 'teacher'] },
  { prefix: '/homework/parent', roles: ['parent'] },
  { prefix: '/homework', roles: [...ADMIN_ROLES, 'teacher'] },
  { prefix: '/report-cards', roles: ADMIN_ROLES },
  { prefix: '/rooms', roles: ADMIN_ROLES },
  { prefix: '/schedules', roles: ADMIN_ROLES },
  { prefix: '/timetables', roles: [...ADMIN_ROLES, 'teacher'] },
  { prefix: '/scheduling', roles: ADMIN_ROLES },
  { prefix: '/admissions', roles: [...ADMIN_ROLES, 'front_office'] },
  { prefix: '/finance', roles: [...ADMIN_ROLES, 'accounting'] },
  { prefix: '/payroll', roles: ['school_owner', 'school_principal'] },
  { prefix: '/communications', roles: ADMIN_ROLES },
  { prefix: '/approvals', roles: ADMIN_ROLES },
  { prefix: '/reports', roles: STAFF_ROLES },
  { prefix: '/diary', roles: [...ADMIN_ROLES, 'teacher'] },
  { prefix: '/website', roles: ADMIN_ROLES },
  { prefix: '/settings/legal/privacy-notices', roles: ADMIN_ROLES },
  { prefix: '/settings/legal', roles: LEGAL_ROLES },
  { prefix: '/privacy-notice', roles: LEGAL_ROLES },
  { prefix: '/settings', roles: ADMIN_ROLES },
];

// ─── Pure logic extracted from the component ─────────────────────────────────

/**
 * Strips the locale segment (e.g., /en/students → /students).
 * Mirrors the logic inside RequireRole's `isAllowed` memo.
 */
function stripLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  return '/' + segments.slice(1).join('/');
}

/**
 * Determines whether the given role set is allowed to access `pathname`.
 * Mirrors the algorithm in RequireRole's `isAllowed` memo exactly.
 */
function isAllowed(pathname: string, roleKeys: RoleKey[]): boolean {
  const pathWithoutLocale = stripLocale(pathname);

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

  // No matching rule — allow by default
  return true;
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const ADMIN_USER: RoleKey[] = ['admin'];
const TEACHER_USER: RoleKey[] = ['teacher'];
const PARENT_USER: RoleKey[] = ['parent'];
const ACCOUNTING_USER: RoleKey[] = ['accounting'];

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RequireRole — route access logic', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── Unrestricted paths ──────────────────────────────────────────────────

  describe('unrestricted paths', () => {
    it('should allow any role to access /dashboard', () => {
      expect(isAllowed('/en/dashboard', PARENT_USER)).toBe(true);
      expect(isAllowed('/en/dashboard', TEACHER_USER)).toBe(true);
      expect(isAllowed('/en/dashboard', ADMIN_USER)).toBe(true);
    });

    it('should allow any role to access /profile and sub-paths', () => {
      expect(isAllowed('/en/profile', PARENT_USER)).toBe(true);
      expect(isAllowed('/en/profile/communication', PARENT_USER)).toBe(true);
    });

    it('should allow any role to access /select-school', () => {
      expect(isAllowed('/en/select-school', PARENT_USER)).toBe(true);
    });
  });

  // ─── Admin-only routes ───────────────────────────────────────────────────

  describe('admin-only routes', () => {
    it('should allow admin roles to access /staff', () => {
      for (const role of ADMIN_ROLES) {
        expect(isAllowed('/en/staff', [role])).toBe(true);
      }
    });

    it('should deny teacher access to /staff', () => {
      expect(isAllowed('/en/staff', TEACHER_USER)).toBe(false);
    });

    it('should deny parent access to /staff', () => {
      expect(isAllowed('/en/staff', PARENT_USER)).toBe(false);
    });

    it('should allow admin to access /settings', () => {
      expect(isAllowed('/en/settings', ADMIN_USER)).toBe(true);
    });

    it('should deny teacher access to /settings', () => {
      expect(isAllowed('/en/settings', TEACHER_USER)).toBe(false);
    });

    it('should allow admin to access /payroll', () => {
      expect(isAllowed('/en/payroll', ['school_owner'])).toBe(true);
      expect(isAllowed('/en/payroll', ['school_principal'])).toBe(true);
    });

    it('should deny admin (non-owner) access to /payroll', () => {
      expect(isAllowed('/en/payroll', ['admin'])).toBe(false);
    });
  });

  // ─── Staff routes ────────────────────────────────────────────────────────

  describe('staff routes', () => {
    it('should allow all staff roles to access /students', () => {
      for (const role of STAFF_ROLES) {
        expect(isAllowed('/en/students', [role])).toBe(true);
      }
    });

    it('should deny parent access to /students', () => {
      expect(isAllowed('/en/students', PARENT_USER)).toBe(false);
    });

    it('should allow accounting access to /finance', () => {
      expect(isAllowed('/en/finance', ACCOUNTING_USER)).toBe(true);
    });

    it('should deny teacher access to /finance', () => {
      expect(isAllowed('/en/finance', TEACHER_USER)).toBe(false);
    });
  });

  // ─── Teacher routes ──────────────────────────────────────────────────────

  describe('teacher routes', () => {
    it('should allow teachers to access /attendance', () => {
      expect(isAllowed('/en/attendance', TEACHER_USER)).toBe(true);
    });

    it('should allow teachers to access /gradebook', () => {
      expect(isAllowed('/en/gradebook', TEACHER_USER)).toBe(true);
    });

    it('should deny parents from /attendance', () => {
      expect(isAllowed('/en/attendance', PARENT_USER)).toBe(false);
    });
  });

  // ─── Parent-specific routes ──────────────────────────────────────────────

  describe('parent-specific routes', () => {
    it('should allow parents to access /inquiries', () => {
      expect(isAllowed('/en/inquiries', PARENT_USER)).toBe(true);
    });

    it('should deny teachers from /inquiries', () => {
      expect(isAllowed('/en/inquiries', TEACHER_USER)).toBe(false);
    });

    it('should allow parents to access /behaviour/parent-portal', () => {
      expect(isAllowed('/en/behaviour/parent-portal', PARENT_USER)).toBe(true);
    });

    it('should deny parents from /behaviour (staff route)', () => {
      expect(isAllowed('/en/behaviour', PARENT_USER)).toBe(false);
    });

    it('should allow parents to access /homework/parent', () => {
      expect(isAllowed('/en/homework/parent', PARENT_USER)).toBe(true);
    });

    it('should deny parents from /homework (staff route)', () => {
      expect(isAllowed('/en/homework', PARENT_USER)).toBe(false);
    });
  });

  // ─── LEGAL_ROLES routes ──────────────────────────────────────────────────

  describe('legal roles routes', () => {
    it('should allow all LEGAL_ROLES to access /settings/legal', () => {
      for (const role of LEGAL_ROLES) {
        expect(isAllowed('/en/settings/legal', [role])).toBe(true);
      }
    });

    it('should restrict /settings/legal/privacy-notices to admins only', () => {
      expect(isAllowed('/en/settings/legal/privacy-notices', ADMIN_USER)).toBe(true);
      expect(isAllowed('/en/settings/legal/privacy-notices', PARENT_USER)).toBe(false);
    });
  });

  // ─── Unknown routes ──────────────────────────────────────────────────────

  describe('unknown routes', () => {
    it('should allow access to unrecognised routes by default', () => {
      expect(isAllowed('/en/some-unknown-route', PARENT_USER)).toBe(true);
    });

    it('should allow access to deeply nested unrecognised routes', () => {
      expect(isAllowed('/en/totally/new/feature', TEACHER_USER)).toBe(true);
    });
  });

  // ─── Locale stripping ────────────────────────────────────────────────────

  describe('stripLocale', () => {
    it('should strip the leading locale segment', () => {
      expect(stripLocale('/en/students')).toBe('/students');
      expect(stripLocale('/ar/dashboard')).toBe('/dashboard');
    });

    it('should return / for a bare locale path', () => {
      expect(stripLocale('/en')).toBe('/');
    });

    it('should handle deeply nested paths correctly', () => {
      expect(stripLocale('/en/settings/legal/privacy-notices')).toBe(
        '/settings/legal/privacy-notices',
      );
    });
  });
});
