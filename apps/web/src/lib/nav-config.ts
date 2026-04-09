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
      { labelKey: 'nav.reportCards', href: '/report-cards', roles: [...ADMIN_ROLES, 'teacher'] },
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

// ─── Hub configurations (Morph Bar) ──────────────────────────────────────────

export interface HubConfig {
  key: string;
  labelKey: string;
  basePaths: string[];
  roles?: RoleKey[];
}

export const hubConfigs: HubConfig[] = [
  {
    key: 'home',
    labelKey: 'nav.home',
    basePaths: ['/dashboard'],
  },
  {
    key: 'people',
    labelKey: 'nav.people',
    basePaths: ['/students', '/staff', '/households'],
    roles: STAFF_ROLES,
  },
  {
    key: 'learning',
    // Order matters: handleHubClick navigates to the first basePath the user
    // is permitted to access. Admin roles land on /classes; teacher roles
    // (who cannot access /classes) land on /assessments, which is the first
    // teacher-accessible entry after the admin-only prefix.
    labelKey: 'nav.learning',
    basePaths: [
      '/classes',
      '/subjects',
      '/curriculum-matrix',
      '/class-assignments',
      '/promotion',
      '/assessments',
      '/gradebook',
      '/analytics',
      '/attendance',
      '/homework',
      '/report-cards',
      '/diary',
    ],
    roles: [...STAFF_ROLES, 'parent'],
  },
  {
    key: 'wellbeing',
    labelKey: 'nav.wellbeing',
    basePaths: ['/behaviour', '/pastoral', '/wellbeing', '/sen', '/early-warnings'],
    roles: STAFF_ROLES,
  },
  {
    key: 'operations',
    labelKey: 'nav.operations',
    basePaths: [
      '/admissions',
      '/communications',
      '/approvals',
      '/scheduling',
      '/rooms',
      '/engagement',
    ],
    roles: STAFF_ROLES,
  },
  {
    key: 'finance',
    labelKey: 'nav.finance',
    basePaths: ['/finance', '/payroll'],
    roles: [...ADMIN_ROLES, 'parent'],
  },
  {
    key: 'reports',
    labelKey: 'nav.reports',
    basePaths: ['/reports'],
  },
  {
    key: 'regulatory',
    labelKey: 'nav.regulatory',
    basePaths: ['/regulatory', '/safeguarding'],
    roles: ADMIN_ROLES,
  },
  {
    key: 'settings',
    labelKey: 'nav.settings',
    basePaths: ['/settings', '/closures', '/website'],
    roles: ADMIN_ROLES,
  },
];

// ─── Sub-strip configurations (Contextual tabs) ──────────────────────────────

export interface SubStripTabConfig {
  labelKey: string;
  href: string;
  overflow?: boolean;
  roles?: RoleKey[];
}

// ─── Grouped sub-strip configurations (two-level nav) ────────────────────────

export interface SubStripGroupConfig {
  /** Translation key for the group header displayed in Level 2 */
  labelKey: string;
  /** If set, clicking navigates directly (no children / single-page group) */
  href?: string;
  /** Children shown in the Level 3 sub-sub-strip */
  children?: SubStripTabConfig[];
  /** Role-gate for the entire group */
  roles?: RoleKey[];
}

/**
 * Hubs that use grouped (two-level) sub-strip navigation.
 * If a hub key appears here, the layout renders GroupedSubStrip instead of SubStrip.
 */
export const hubGroupedSubStripConfigs: Record<string, SubStripGroupConfig[]> = {
  learning: [
    {
      labelKey: 'nav.classes',
      children: [
        { labelKey: 'nav.classes', href: '/classes' },
        { labelKey: 'nav.classAssignments', href: '/class-assignments' },
        { labelKey: 'nav.promotion', href: '/promotion', roles: ADMIN_ROLES },
      ],
      roles: ADMIN_ROLES,
    },
    {
      labelKey: 'nav.curriculum',
      children: [
        { labelKey: 'nav.subjects', href: '/subjects' },
        { labelKey: 'nav.curriculumMatrix', href: '/curriculum-matrix' },
      ],
      roles: ADMIN_ROLES,
    },
    {
      labelKey: 'nav.assessment',
      children: [
        { labelKey: 'nav.assessmentDashboard', href: '/assessments' },
        { labelKey: 'nav.gradebook', href: '/gradebook' },
        { labelKey: 'nav.reportCards', href: '/report-cards' },
        { labelKey: 'nav.gradeAnalytics', href: '/analytics' },
      ],
    },
    {
      labelKey: 'nav.homework',
      children: [
        { labelKey: 'nav.homework', href: '/homework' },
        { labelKey: 'nav.diary', href: '/diary' },
      ],
    },
    {
      labelKey: 'nav.attendance',
      href: '/attendance',
    },
  ],
};

export const hubSubStripConfigs: Record<string, SubStripTabConfig[]> = {
  people: [
    { labelKey: 'nav.students', href: '/students' },
    { labelKey: 'nav.staff', href: '/staff', roles: ADMIN_ROLES },
    { labelKey: 'nav.households', href: '/households', roles: ADMIN_ROLES },
  ],
  wellbeing: [
    { labelKey: 'nav.behaviour', href: '/behaviour' },
    { labelKey: 'nav.behaviourIncidents', href: '/behaviour/incidents' },
    { labelKey: 'nav.pastoral', href: '/pastoral' },
    { labelKey: 'nav.sen', href: '/sen' },
    { labelKey: 'nav.wellbeing', href: '/wellbeing', overflow: true },
    { labelKey: 'nav.earlyWarnings', href: '/early-warnings', overflow: true },
  ],
  operations: [
    { labelKey: 'nav.admissions', href: '/admissions' },
    { labelKey: 'nav.engagement', href: '/engagement' },
    { labelKey: 'nav.communications', href: '/communications' },
    { labelKey: 'nav.approvals', href: '/approvals' },
    { labelKey: 'nav.scheduling', href: '/scheduling', overflow: true },
    { labelKey: 'nav.rooms', href: '/rooms', overflow: true },
  ],
  finance: [
    { labelKey: 'nav.financeOverview', href: '/finance' },
    { labelKey: 'nav.feeStructures', href: '/finance/fee-structures' },
    { labelKey: 'nav.invoices', href: '/finance/invoices' },
    { labelKey: 'nav.payments', href: '/finance/payments' },
    { labelKey: 'nav.credits', href: '/finance/credit-notes' },
    { labelKey: 'nav.refunds', href: '/finance/refunds' },
    { labelKey: 'nav.paymentPlans', href: '/finance/payment-plans' },
    { labelKey: 'nav.statements', href: '/finance/statements' },
    { labelKey: 'nav.financeReports', href: '/finance/reports' },
    { labelKey: 'nav.audit', href: '/finance/audit', overflow: true },
    { labelKey: 'nav.scholarships', href: '/finance/scholarships', overflow: true },
    { labelKey: 'nav.discounts', href: '/finance/discounts', overflow: true },
    { labelKey: 'nav.feeAssignments', href: '/finance/fee-assignments', overflow: true },
  ],
  reports: [],
  regulatory: [
    { labelKey: 'nav.regulatoryDashboard', href: '/regulatory' },
    { labelKey: 'nav.regulatoryTusla', href: '/regulatory/tusla' },
    { labelKey: 'nav.regulatoryPpod', href: '/regulatory/ppod' },
    { labelKey: 'nav.regulatoryDesReturns', href: '/regulatory/des-returns' },
    { labelKey: 'nav.regulatorySafeguarding', href: '/regulatory/safeguarding' },
    { labelKey: 'nav.dpa', href: '/regulatory/dpa', overflow: true },
    { labelKey: 'nav.privacyNotices', href: '/regulatory/privacy-notices', overflow: true },
    { labelKey: 'nav.compliance', href: '/regulatory/compliance', overflow: true },
    { labelKey: 'nav.dataRetention', href: '/regulatory/data-retention', overflow: true },
  ],
  settings: [
    { labelKey: 'nav.generalSettings', href: '/settings' },
    { labelKey: 'nav.behaviourSettings', href: '/behaviour/settings', overflow: true },
    { labelKey: 'nav.roles', href: '/settings/roles' },
    { labelKey: 'nav.closures', href: '/closures', overflow: true },
    { labelKey: 'nav.website', href: '/website', overflow: true },
  ],
};
