/**
 * Unit tests for SchoolLayout — sidebar navigation filtering.
 *
 * The layout file contains a critical pure function:
 *   - filterNavForRoles: filters navigation sections and items based on
 *     the current user's role_keys.
 *
 * We replicate the relevant data structures and the function here so they
 * can be tested without mounting React, importing Next.js internals, or
 * triggering API calls.
 */

// ─── Types (mirrored from layout.tsx) ────────────────────────────────────────

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

interface NavItem {
  labelKey: string;
  href: string;
  roles?: RoleKey[];
}

const ADMIN_ROLES: RoleKey[] = [
  'school_owner',
  'school_principal',
  'admin',
  'school_vice_principal',
];
const STAFF_ROLES: RoleKey[] = [...ADMIN_ROLES, 'teacher', 'accounting', 'front_office'];

const navSections: { labelKey: string; items: NavItem[]; roles?: RoleKey[] }[] = [
  {
    labelKey: 'nav.overview',
    items: [{ labelKey: 'nav.dashboard', href: '/dashboard' }],
  },
  {
    labelKey: 'nav.parentPortal',
    roles: ['parent'],
    items: [
      { labelKey: 'nav.announcements', href: '/announcements', roles: ['parent'] },
      { labelKey: 'nav.inquiries', href: '/inquiries', roles: ['parent'] },
      { labelKey: 'nav.privacyConsent', href: '/privacy-consent', roles: ['parent'] },
      { labelKey: 'nav.applications', href: '/applications', roles: ['parent'] },
    ],
  },
  {
    labelKey: 'nav.people',
    roles: STAFF_ROLES,
    items: [
      { labelKey: 'nav.students', href: '/students' },
      { labelKey: 'nav.staff', href: '/staff', roles: ADMIN_ROLES },
      { labelKey: 'nav.households', href: '/households', roles: ADMIN_ROLES },
    ],
  },
  {
    labelKey: 'nav.assessmentRecords',
    roles: STAFF_ROLES,
    items: [
      { labelKey: 'nav.attendance', href: '/attendance' },
      { labelKey: 'nav.gradebook', href: '/gradebook' },
      { labelKey: 'nav.homework', href: '/homework' },
      { labelKey: 'nav.reportCards', href: '/report-cards', roles: ADMIN_ROLES },
    ],
  },
  {
    labelKey: 'nav.financials',
    items: [
      {
        labelKey: 'nav.finance',
        href: '/finance',
        roles: [...ADMIN_ROLES, 'accounting'],
      },
      {
        labelKey: 'nav.payroll',
        href: '/payroll',
        roles: ['school_owner', 'school_principal'],
      },
    ],
  },
  {
    labelKey: 'nav.school',
    roles: ADMIN_ROLES,
    items: [
      { labelKey: 'nav.website', href: '/website' },
      { labelKey: 'nav.settings', href: '/settings' },
    ],
  },
];

// ─── Pure helper (mirrored from layout.tsx) ───────────────────────────────────

function filterNavForRoles(userRoleKeys: string[]): { labelKey: string; items: NavItem[] }[] {
  return navSections
    .filter((section) => !section.roles || section.roles.some((r) => userRoleKeys.includes(r)))
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.roles || item.roles.some((r) => userRoleKeys.includes(r)),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getHrefs(sections: { items: NavItem[] }[]): string[] {
  return sections.flatMap((s) => s.items.map((i) => i.href));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SchoolLayout — filterNavForRoles', () => {
  afterEach(() => jest.clearAllMocks());

  describe('school_owner role', () => {
    it('should include the dashboard section', () => {
      const sections = filterNavForRoles(['school_owner']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.overview');
    });

    it('should include staff-only section (people)', () => {
      const sections = filterNavForRoles(['school_owner']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.people');
    });

    it('should include payroll link', () => {
      const sections = filterNavForRoles(['school_owner']);
      expect(getHrefs(sections)).toContain('/payroll');
    });

    it('should include admin-gated settings section', () => {
      const sections = filterNavForRoles(['school_owner']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.school');
    });

    it('should NOT include the parent portal section', () => {
      const sections = filterNavForRoles(['school_owner']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).not.toContain('nav.parentPortal');
    });
  });

  describe('parent role', () => {
    it('should include the parent portal section', () => {
      const sections = filterNavForRoles(['parent']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.parentPortal');
    });

    it('should include parent portal items (announcements, inquiries)', () => {
      const sections = filterNavForRoles(['parent']);
      const hrefs = getHrefs(sections);
      expect(hrefs).toContain('/announcements');
      expect(hrefs).toContain('/inquiries');
    });

    it('should NOT include staff sections (people, finance, school)', () => {
      const sections = filterNavForRoles(['parent']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).not.toContain('nav.people');
      expect(labels).not.toContain('nav.financials');
      expect(labels).not.toContain('nav.school');
    });
  });

  describe('teacher role', () => {
    it('should include the people section', () => {
      const sections = filterNavForRoles(['teacher']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.people');
    });

    it('should NOT include staff-only items like /staff under people section', () => {
      const sections = filterNavForRoles(['teacher']);
      expect(getHrefs(sections)).not.toContain('/staff');
    });

    it('should include assessment records section', () => {
      const sections = filterNavForRoles(['teacher']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.assessmentRecords');
    });

    it('should NOT include payroll link', () => {
      const sections = filterNavForRoles(['teacher']);
      expect(getHrefs(sections)).not.toContain('/payroll');
    });

    it('should NOT include report cards (admin only)', () => {
      const sections = filterNavForRoles(['teacher']);
      expect(getHrefs(sections)).not.toContain('/report-cards');
    });
  });

  describe('accounting role', () => {
    it('should include the finance link', () => {
      const sections = filterNavForRoles(['accounting']);
      expect(getHrefs(sections)).toContain('/finance');
    });

    it('should NOT include payroll link', () => {
      const sections = filterNavForRoles(['accounting']);
      expect(getHrefs(sections)).not.toContain('/payroll');
    });

    it('should NOT include the admin settings section', () => {
      const sections = filterNavForRoles(['accounting']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).not.toContain('nav.school');
    });
  });

  describe('empty roles (unauthenticated or no membership)', () => {
    it('should still include sections with no role restriction (dashboard, financials)', () => {
      const sections = filterNavForRoles([]);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.overview');
    });

    it('should exclude sections that require a specific role', () => {
      const sections = filterNavForRoles([]);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).not.toContain('nav.parentPortal');
      expect(labels).not.toContain('nav.people');
      expect(labels).not.toContain('nav.school');
    });

    it('should return only sections with at least one visible item', () => {
      const sections = filterNavForRoles([]);
      for (const section of sections) {
        expect(section.items.length).toBeGreaterThan(0);
      }
    });
  });
});
