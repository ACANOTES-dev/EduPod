/**
 * Unit tests for SchoolLayout — sidebar navigation filtering.
 *
 * These tests import the real nav config and filtering function from
 * @/lib/nav-config so there are no mirrored copies that can drift.
 */

import { filterNavForRoles, navSectionConfigs } from '@/lib/nav-config';
import type { NavItemConfig, NavSectionConfig } from '@/lib/nav-config';
import { ADMIN_ROLES, STAFF_ROLES } from '@/lib/route-roles';

export {}; // Module boundary — prevents global scope collisions with other spec files

// ─── Helpers ────────────────────────────────────────────────────────────────

function getHrefs(sections: { items: NavItemConfig[] }[]): string[] {
  return sections.flatMap((s) => s.items.map((i) => i.href));
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SchoolLayout — filterNavForRoles', () => {
  afterEach(() => jest.clearAllMocks());

  describe('school_owner role', () => {
    it('should include the dashboard section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['school_owner']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.overview');
    });

    it('should include staff-only section (people)', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['school_owner']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.people');
    });

    it('should include payroll link', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['school_owner']);
      expect(getHrefs(sections)).toContain('/payroll');
    });

    it('should include admin-gated settings section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['school_owner']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.school');
    });

    it('should NOT include the parent portal section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['school_owner']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).not.toContain('nav.parentPortal');
    });

    it('should include SEN section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['school_owner']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.sen');
    });

    it('should include behaviour section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['school_owner']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.behaviour');
    });

    it('should include wellbeing section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['school_owner']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.wellbeing');
    });

    it('should include scheduling section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['school_owner']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.scheduling');
    });

    it('should include regulatory section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['school_owner']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.regulatory');
    });
  });

  describe('parent role', () => {
    it('should include the parent portal section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['parent']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.parentPortal');
    });

    it('should include parent portal items (announcements, inquiries)', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['parent']);
      const hrefs = getHrefs(sections);
      expect(hrefs).toContain('/announcements');
      expect(hrefs).toContain('/inquiries');
    });

    it('should include parent SEN link', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['parent']);
      const hrefs = getHrefs(sections);
      expect(hrefs).toContain('/parent/sen');
    });

    it('should NOT include staff sections (people, school)', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['parent']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).not.toContain('nav.people');
      expect(labels).not.toContain('nav.school');
    });

    it('should NOT include SEN staff section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['parent']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).not.toContain('nav.sen');
    });

    it('should NOT include behaviour staff section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['parent']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).not.toContain('nav.behaviour');
    });

    it('should NOT include regulatory section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['parent']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).not.toContain('nav.regulatory');
    });
  });

  describe('teacher role', () => {
    it('should include the people section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['teacher']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.people');
    });

    it('should NOT include staff-only items like /staff under people section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['teacher']);
      expect(getHrefs(sections)).not.toContain('/staff');
    });

    it('should include assessment records section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['teacher']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.assessmentRecords');
    });

    it('should NOT include payroll link', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['teacher']);
      expect(getHrefs(sections)).not.toContain('/payroll');
    });

    it('should NOT include report cards (admin only)', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['teacher']);
      expect(getHrefs(sections)).not.toContain('/report-cards');
    });

    it('should include SEN section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['teacher']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.sen');
    });

    it('should include behaviour section with pastoral', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['teacher']);
      const hrefs = getHrefs(sections);
      expect(hrefs).toContain('/behaviour');
      expect(hrefs).toContain('/pastoral');
    });

    it('should include wellbeing section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['teacher']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.wellbeing');
    });

    it('should NOT include scheduling admin items', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['teacher']);
      expect(getHrefs(sections)).not.toContain('/rooms');
      expect(getHrefs(sections)).not.toContain('/scheduling');
    });

    it('should NOT include regulatory section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['teacher']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).not.toContain('nav.regulatory');
    });
  });

  describe('accounting role', () => {
    it('should include the finance link', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['accounting']);
      expect(getHrefs(sections)).toContain('/finance');
    });

    it('should NOT include payroll link', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['accounting']);
      expect(getHrefs(sections)).not.toContain('/payroll');
    });

    it('should NOT include the admin settings section', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['accounting']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).not.toContain('nav.school');
    });

    it('should include SEN section (as staff)', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['accounting']);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.sen');
    });
  });

  describe('front_office role', () => {
    it('should include admissions link', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['front_office']);
      expect(getHrefs(sections)).toContain('/admissions');
    });

    it('should NOT include payroll link', () => {
      const sections = filterNavForRoles(navSectionConfigs, ['front_office']);
      expect(getHrefs(sections)).not.toContain('/payroll');
    });
  });

  describe('empty roles (unauthenticated or no membership)', () => {
    it('should still include sections with no role restriction (dashboard)', () => {
      const sections = filterNavForRoles(navSectionConfigs, []);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).toContain('nav.overview');
    });

    it('should exclude sections that require a specific role', () => {
      const sections = filterNavForRoles(navSectionConfigs, []);
      const labels = sections.map((s) => s.labelKey);
      expect(labels).not.toContain('nav.parentPortal');
      expect(labels).not.toContain('nav.people');
      expect(labels).not.toContain('nav.school');
      expect(labels).not.toContain('nav.sen');
      expect(labels).not.toContain('nav.behaviour');
      expect(labels).not.toContain('nav.wellbeing');
      expect(labels).not.toContain('nav.regulatory');
    });

    it('should return only sections with at least one visible item', () => {
      const sections = filterNavForRoles(navSectionConfigs, []);
      for (const section of sections) {
        expect(section.items.length).toBeGreaterThan(0);
      }
    });
  });

  // ─── Data integrity ─────────────────────────────────────────────────────

  describe('data integrity', () => {
    it('navSectionConfigs should have entries for all expected sections', () => {
      const labels = navSectionConfigs.map((s) => s.labelKey);
      expect(labels).toContain('nav.overview');
      expect(labels).toContain('nav.parentPortal');
      expect(labels).toContain('nav.people');
      expect(labels).toContain('nav.academics');
      expect(labels).toContain('nav.assessmentRecords');
      expect(labels).toContain('nav.behaviour');
      expect(labels).toContain('nav.wellbeing');
      expect(labels).toContain('nav.sen');
      expect(labels).toContain('nav.scheduling');
      expect(labels).toContain('nav.operations');
      expect(labels).toContain('nav.financials');
      expect(labels).toContain('nav.reports');
      expect(labels).toContain('nav.regulatory');
      expect(labels).toContain('nav.school');
    });

    it('every section should have at least one item', () => {
      for (const section of navSectionConfigs) {
        expect(section.items.length).toBeGreaterThan(0);
      }
    });
  });
});
