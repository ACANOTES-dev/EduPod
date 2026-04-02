/**
 * Pure navigation configuration.
 *
 * Extracted from the school layout so that both the layout and its tests
 * import the same nav structure and filtering logic — no mirrored copies
 * that drift.
 *
 * This file must have NO React, Next.js, lucide-react, or browser dependencies.
 */

import type { RoleKey } from '@/lib/route-roles';
import { ADMIN_ROLES, STAFF_ROLES } from '@/lib/route-roles';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Nav item without icon — pure data that can be tested without React. */
export interface NavItemConfig {
  labelKey: string;
  href: string;
  /** If set, item is only visible to users with one of these role_keys. If omitted, visible to all. */
  roles?: RoleKey[];
}

export interface NavSectionConfig {
  labelKey: string;
  items: NavItemConfig[];
  /** If set, entire section is only visible to users with one of these role_keys. */
  roles?: RoleKey[];
}

// ─── Nav section configs ─────────────────────────────────────────────────────

export const navSectionConfigs: NavSectionConfig[] = [
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
      {
        labelKey: 'nav.privacyConsent',
        href: '/privacy-consent',
        roles: ['parent'],
      },
      {
        labelKey: 'nav.applications',
        href: '/applications',
        roles: ['parent'],
      },
      {
        labelKey: 'nav.senParent',
        href: '/parent/sen',
        roles: ['parent'],
      },
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
    labelKey: 'nav.academics',
    roles: STAFF_ROLES,
    items: [
      { labelKey: 'nav.classes', href: '/classes' },
      { labelKey: 'nav.subjects', href: '/subjects', roles: ADMIN_ROLES },
      {
        labelKey: 'nav.curriculumMatrix',
        href: '/curriculum-matrix',
        roles: ADMIN_ROLES,
      },
      {
        labelKey: 'nav.classAssignments',
        href: '/class-assignments',
        roles: ADMIN_ROLES,
      },
      { labelKey: 'nav.promotion', href: '/promotion', roles: ADMIN_ROLES },
      { labelKey: 'nav.diary', href: '/diary' },
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
    labelKey: 'nav.behaviour',
    roles: STAFF_ROLES,
    items: [
      { labelKey: 'nav.behaviourDashboard', href: '/behaviour' },
      { labelKey: 'nav.behaviourIncidents', href: '/behaviour/incidents' },
      { labelKey: 'nav.behaviourStudents', href: '/behaviour/students' },
      {
        labelKey: 'nav.guardianRestrictions',
        href: '/behaviour/guardian-restrictions',
        roles: ADMIN_ROLES,
      },
      {
        labelKey: 'nav.pastoral',
        href: '/pastoral',
        roles: [...ADMIN_ROLES, 'teacher'],
      },
    ],
  },
  {
    labelKey: 'nav.wellbeing',
    roles: STAFF_ROLES,
    items: [
      { labelKey: 'nav.myWorkload', href: '/wellbeing/my-workload' },
      { labelKey: 'nav.supportResources', href: '/wellbeing/resources' },
      { labelKey: 'nav.survey', href: '/wellbeing/survey' },
      {
        labelKey: 'nav.wellbeingDashboard',
        href: '/wellbeing/dashboard',
        roles: ADMIN_ROLES,
      },
      {
        labelKey: 'nav.surveyManagement',
        href: '/wellbeing/surveys',
        roles: ADMIN_ROLES,
      },
      {
        labelKey: 'nav.boardReport',
        href: '/wellbeing/reports',
        roles: ADMIN_ROLES,
      },
    ],
  },
  {
    labelKey: 'nav.sen',
    roles: STAFF_ROLES,
    items: [
      { labelKey: 'nav.senDashboard', href: '/sen' },
      { labelKey: 'nav.senStudents', href: '/sen/students' },
      { labelKey: 'nav.senResourceAllocation', href: '/sen/resource-allocation' },
      { labelKey: 'nav.senSnaAssignments', href: '/sen/sna-assignments' },
      { labelKey: 'nav.senReports', href: '/sen/reports' },
    ],
  },
  {
    labelKey: 'nav.scheduling',
    roles: STAFF_ROLES,
    items: [
      { labelKey: 'nav.rooms', href: '/rooms', roles: ADMIN_ROLES },
      { labelKey: 'nav.scheduling', href: '/scheduling', roles: ADMIN_ROLES },
    ],
  },
  {
    labelKey: 'nav.operations',
    items: [
      {
        labelKey: 'nav.admissions',
        href: '/admissions',
        roles: [...ADMIN_ROLES, 'front_office'],
      },
      {
        labelKey: 'nav.engagement',
        href: '/engagement',
        roles: STAFF_ROLES,
      },
      { labelKey: 'nav.communications', href: '/communications', roles: ADMIN_ROLES },
      { labelKey: 'nav.approvals', href: '/approvals', roles: ADMIN_ROLES },
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
    labelKey: 'nav.reports',
    roles: STAFF_ROLES,
    items: [{ labelKey: 'nav.reports', href: '/reports' }],
  },
  {
    labelKey: 'nav.regulatory',
    roles: ADMIN_ROLES,
    items: [
      { labelKey: 'nav.regulatoryDashboard', href: '/regulatory' },
      { labelKey: 'nav.regulatoryCalendar', href: '/regulatory/calendar' },
      { labelKey: 'nav.regulatoryTusla', href: '/regulatory/tusla' },
      { labelKey: 'nav.regulatoryDesReturns', href: '/regulatory/des-returns' },
      {
        labelKey: 'nav.regulatoryOctoberReturns',
        href: '/regulatory/october-returns',
      },
      { labelKey: 'nav.regulatoryPpod', href: '/regulatory/ppod' },
      { labelKey: 'nav.regulatoryCba', href: '/regulatory/ppod/cba' },
      { labelKey: 'nav.regulatoryTransfers', href: '/regulatory/ppod/transfers' },
      { labelKey: 'nav.regulatoryAntiBullying', href: '/regulatory/anti-bullying' },
      { labelKey: 'nav.regulatorySubmissions', href: '/regulatory/submissions' },
      {
        labelKey: 'nav.regulatorySafeguarding',
        href: '/regulatory/safeguarding',
      },
    ],
  },
  {
    labelKey: 'nav.school',
    roles: ADMIN_ROLES,
    items: [
      { labelKey: 'nav.website', href: '/website' },
      { labelKey: 'nav.settings', href: '/settings' },
      { labelKey: 'nav.closures', href: '/settings/closures' },
    ],
  },
];

// ─── Filtering function ──────────────────────────────────────────────────────

/** Filter nav sections and items based on the user's role keys. */
export function filterNavForRoles(
  sections: NavSectionConfig[],
  userRoleKeys: string[],
): { labelKey: string; items: NavItemConfig[] }[] {
  return sections
    .filter((section) => !section.roles || section.roles.some((r) => userRoleKeys.includes(r)))
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.roles || item.roles.some((r) => userRoleKeys.includes(r)),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
