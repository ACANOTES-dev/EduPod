/**
 * Unit tests for RequireRole — route-role access logic.
 *
 * These tests exercise the real data and pure function from @/lib/route-roles
 * so there are no mirrored constants that can drift from the component.
 */

import {
  ADMIN_ROLES,
  LEGAL_ROLES,
  ROUTE_ROLE_MAP,
  STAFF_ROLES,
  UNRESTRICTED_PATHS,
  isAllowedForRoute,
} from '@/lib/route-roles';
import type { RoleKey } from '@/lib/route-roles';

export {}; // Module boundary — prevents global scope collisions with other spec files

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Strips the locale segment (e.g., /en/students -> /students).
 * Mirrors the logic inside RequireRole's `isAllowed` memo.
 */
function stripLocale(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  return '/' + segments.slice(1).join('/');
}

/** Wrapper: strips locale then delegates to the real isAllowedForRoute. */
function isAllowed(pathname: string, roleKeys: RoleKey[]): boolean {
  return isAllowedForRoute(stripLocale(pathname), roleKeys);
}

// ─── Test fixtures ──────────────────────────────────────────────────────────

const ADMIN_USER: RoleKey[] = ['admin'];
const TEACHER_USER: RoleKey[] = ['teacher'];
const PARENT_USER: RoleKey[] = ['parent'];
const ACCOUNTING_USER: RoleKey[] = ['accounting'];
const FRONT_OFFICE_USER: RoleKey[] = ['front_office'];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('RequireRole — route access logic', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── Unrestricted paths ────────────────────────────────────────────────

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

    it('should contain all expected unrestricted paths', () => {
      expect(UNRESTRICTED_PATHS).toContain('/dashboard');
      expect(UNRESTRICTED_PATHS).toContain('/profile');
      expect(UNRESTRICTED_PATHS).toContain('/select-school');
    });
  });

  // ─── Admin-only routes ─────────────────────────────────────────────────

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

    it('should allow admin roles to access /households', () => {
      for (const role of ADMIN_ROLES) {
        expect(isAllowed('/en/households', [role])).toBe(true);
      }
    });

    it('should deny non-admin access to /households', () => {
      expect(isAllowed('/en/households', TEACHER_USER)).toBe(false);
      expect(isAllowed('/en/households', PARENT_USER)).toBe(false);
    });
  });

  // ─── Staff routes ──────────────────────────────────────────────────────

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

    it('should allow all staff to access /reports', () => {
      for (const role of STAFF_ROLES) {
        expect(isAllowed('/en/reports', [role])).toBe(true);
      }
    });

    it('should deny parent access to /reports', () => {
      expect(isAllowed('/en/reports', PARENT_USER)).toBe(false);
    });
  });

  // ─── Teacher routes ────────────────────────────────────────────────────

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

    it('should allow teachers to access /classes', () => {
      expect(isAllowed('/en/classes', TEACHER_USER)).toBe(true);
    });

    it('should allow teachers to access /timetables', () => {
      expect(isAllowed('/en/timetables', TEACHER_USER)).toBe(true);
    });

    it('should deny teachers from /subjects (admin only)', () => {
      expect(isAllowed('/en/subjects', TEACHER_USER)).toBe(false);
    });
  });

  // ─── Parent-specific routes ────────────────────────────────────────────

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

    it('should allow parents to access /announcements', () => {
      expect(isAllowed('/en/announcements', PARENT_USER)).toBe(true);
    });

    it('should allow parents to access /applications', () => {
      expect(isAllowed('/en/applications', PARENT_USER)).toBe(true);
    });
  });

  // ─── SEN routes ────────────────────────────────────────────────────────

  describe('SEN routes', () => {
    it('should allow parents to access /parent/sen', () => {
      expect(isAllowed('/en/parent/sen', PARENT_USER)).toBe(true);
    });

    it('should deny parents from /sen (staff route)', () => {
      expect(isAllowed('/en/sen', PARENT_USER)).toBe(false);
    });

    it('should allow all staff to access /sen', () => {
      for (const role of STAFF_ROLES) {
        expect(isAllowed('/en/sen', [role])).toBe(true);
      }
    });

    it('should allow staff to access /sen sub-routes', () => {
      expect(isAllowed('/en/sen/students', ADMIN_USER)).toBe(true);
      expect(isAllowed('/en/sen/reports', TEACHER_USER)).toBe(true);
    });
  });

  // ─── Behaviour routes ─────────────────────────────────────────────────

  describe('behaviour routes', () => {
    it('should allow admin and teacher to access /behaviour', () => {
      expect(isAllowed('/en/behaviour', ADMIN_USER)).toBe(true);
      expect(isAllowed('/en/behaviour', TEACHER_USER)).toBe(true);
    });

    it('should allow admin and teacher to access /pastoral', () => {
      expect(isAllowed('/en/pastoral', ADMIN_USER)).toBe(true);
      expect(isAllowed('/en/pastoral', TEACHER_USER)).toBe(true);
    });

    it('should allow admin and teacher to access /safeguarding', () => {
      expect(isAllowed('/en/safeguarding', ADMIN_USER)).toBe(true);
      expect(isAllowed('/en/safeguarding', TEACHER_USER)).toBe(true);
    });

    it('should deny accounting from /behaviour', () => {
      expect(isAllowed('/en/behaviour', ACCOUNTING_USER)).toBe(false);
    });

    it('should deny parent from /safeguarding', () => {
      expect(isAllowed('/en/safeguarding', PARENT_USER)).toBe(false);
    });
  });

  // ─── Wellbeing routes ─────────────────────────────────────────────────

  describe('wellbeing routes (unmatched by ROUTE_ROLE_MAP)', () => {
    it('should allow access to /wellbeing routes (no matching rule = allow by default)', () => {
      expect(isAllowed('/en/wellbeing/my-workload', TEACHER_USER)).toBe(true);
      expect(isAllowed('/en/wellbeing/dashboard', ADMIN_USER)).toBe(true);
    });
  });

  // ─── Academics routes ─────────────────────────────────────────────────

  describe('academics routes', () => {
    it('should allow admin to access /curriculum-matrix', () => {
      expect(isAllowed('/en/curriculum-matrix', ADMIN_USER)).toBe(true);
    });

    it('should deny teacher from /curriculum-matrix', () => {
      expect(isAllowed('/en/curriculum-matrix', TEACHER_USER)).toBe(false);
    });

    it('should allow admin to access /promotion', () => {
      expect(isAllowed('/en/promotion', ADMIN_USER)).toBe(true);
    });

    it('should allow teachers to access /diary', () => {
      expect(isAllowed('/en/diary', TEACHER_USER)).toBe(true);
    });
  });

  // ─── Scheduling routes ────────────────────────────────────────────────

  describe('scheduling routes', () => {
    it('should allow admin to access /rooms', () => {
      expect(isAllowed('/en/rooms', ADMIN_USER)).toBe(true);
    });

    it('should deny teacher from /rooms', () => {
      expect(isAllowed('/en/rooms', TEACHER_USER)).toBe(false);
    });

    it('should allow admin to access /scheduling', () => {
      expect(isAllowed('/en/scheduling', ADMIN_USER)).toBe(true);
    });

    it('should deny teacher from /scheduling', () => {
      expect(isAllowed('/en/scheduling', TEACHER_USER)).toBe(false);
    });
  });

  // ─── Operations routes ────────────────────────────────────────────────

  describe('operations routes', () => {
    it('should allow admin to access /admissions', () => {
      expect(isAllowed('/en/admissions', ADMIN_USER)).toBe(true);
    });

    it('should allow front_office to access /admissions', () => {
      expect(isAllowed('/en/admissions', FRONT_OFFICE_USER)).toBe(true);
    });

    it('should deny teacher from /admissions', () => {
      expect(isAllowed('/en/admissions', TEACHER_USER)).toBe(false);
    });

    it('should allow admin to access /communications', () => {
      expect(isAllowed('/en/communications', ADMIN_USER)).toBe(true);
    });

    it('should deny teacher from /communications', () => {
      expect(isAllowed('/en/communications', TEACHER_USER)).toBe(false);
    });
  });

  // ─── Reports routes ───────────────────────────────────────────────────

  describe('reports routes', () => {
    it('should allow all staff to access /reports', () => {
      for (const role of STAFF_ROLES) {
        expect(isAllowed('/en/reports', [role])).toBe(true);
      }
    });

    it('should deny parent from /reports', () => {
      expect(isAllowed('/en/reports', PARENT_USER)).toBe(false);
    });
  });

  // ─── Regulatory routes ────────────────────────────────────────────────

  describe('regulatory routes', () => {
    it('should allow admin roles to access /regulatory', () => {
      for (const role of ADMIN_ROLES) {
        expect(isAllowed('/en/regulatory', [role])).toBe(true);
      }
    });

    it('should deny teacher from /regulatory', () => {
      expect(isAllowed('/en/regulatory', TEACHER_USER)).toBe(false);
    });

    it('should deny parent from /regulatory', () => {
      expect(isAllowed('/en/regulatory', PARENT_USER)).toBe(false);
    });

    it('should allow admin to access /regulatory sub-routes', () => {
      expect(isAllowed('/en/regulatory/calendar', ADMIN_USER)).toBe(true);
      expect(isAllowed('/en/regulatory/tusla', ADMIN_USER)).toBe(true);
      expect(isAllowed('/en/regulatory/ppod', ADMIN_USER)).toBe(true);
    });
  });

  // ─── LEGAL_ROLES routes ───────────────────────────────────────────────

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

    it('should allow all LEGAL_ROLES to access /privacy-notice', () => {
      for (const role of LEGAL_ROLES) {
        expect(isAllowed('/en/privacy-notice', [role])).toBe(true);
      }
    });
  });

  // ─── Unknown routes ───────────────────────────────────────────────────

  describe('unknown routes', () => {
    it('should allow access to unrecognised routes by default', () => {
      expect(isAllowed('/en/some-unknown-route', PARENT_USER)).toBe(true);
    });

    it('should allow access to deeply nested unrecognised routes', () => {
      expect(isAllowed('/en/totally/new/feature', TEACHER_USER)).toBe(true);
    });
  });

  // ─── Locale stripping ─────────────────────────────────────────────────

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

  // ─── Data integrity ───────────────────────────────────────────────────

  describe('data integrity', () => {
    it('ROUTE_ROLE_MAP should have entries for all major route areas', () => {
      const prefixes = ROUTE_ROLE_MAP.map((r) => r.prefix);
      expect(prefixes).toContain('/students');
      expect(prefixes).toContain('/staff');
      expect(prefixes).toContain('/finance');
      expect(prefixes).toContain('/payroll');
      expect(prefixes).toContain('/sen');
      expect(prefixes).toContain('/behaviour');
      expect(prefixes).toContain('/regulatory');
      expect(prefixes).toContain('/reports');
      expect(prefixes).toContain('/scheduling');
      expect(prefixes).toContain('/admissions');
      expect(prefixes).toContain('/settings');
    });

    it('every ROUTE_ROLE_MAP entry should have at least one role', () => {
      for (const entry of ROUTE_ROLE_MAP) {
        expect(entry.roles.length).toBeGreaterThan(0);
      }
    });
  });
});
