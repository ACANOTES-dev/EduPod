/**
 * Pure navigation configuration.
 *
 * Extracted from the school layout so that both the layout and its tests
 * import the same nav structure and filtering logic — no mirrored copies
 * that drift.
 *
 * This file must have NO React, Next.js, lucide-react, or browser dependencies.
 */

import type { ModuleKey } from '@school/shared';

import type { RoleKey } from '@/lib/route-roles';
import { ADMIN_ROLES, STAFF_ROLES } from '@/lib/route-roles';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Nav item without icon — pure data that can be tested without React. */
export interface NavItemConfig {
  labelKey: string;
  href: string;
  moduleKey?: ModuleKey;
  /** If set, item is only visible to users with one of these role_keys. If omitted, visible to all. */
  roles?: RoleKey[];
}

export interface NavSectionConfig {
  labelKey: string;
  items: NavItemConfig[];
  moduleKey?: ModuleKey;
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
      {
        labelKey: 'nav.inquiries',
        href: '/inquiries',
        moduleKey: 'parent_inquiries',
        roles: ['parent'],
      },
      {
        labelKey: 'nav.privacyConsent',
        href: '/privacy-consent',
        roles: ['parent'],
      },
      {
        labelKey: 'nav.applications',
        href: '/applications',
        moduleKey: 'admissions',
        roles: ['parent'],
      },
      {
        labelKey: 'nav.senParent',
        href: '/parent/sen',
        moduleKey: 'sen',
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
      { labelKey: 'nav.gradebook', href: '/gradebook', moduleKey: 'gradebook' },
      { labelKey: 'nav.homework', href: '/homework', moduleKey: 'homework' },
      {
        labelKey: 'nav.reportCards',
        href: '/report-cards',
        moduleKey: 'gradebook',
        roles: [...ADMIN_ROLES, 'teacher'],
      },
      {
        labelKey: 'nav.reportComments',
        href: '/report-comments',
        moduleKey: 'gradebook',
        roles: [...ADMIN_ROLES, 'teacher'],
      },
    ],
  },
  {
    labelKey: 'nav.behaviour',
    roles: STAFF_ROLES,
    items: [
      { labelKey: 'nav.behaviourDashboard', href: '/behaviour', moduleKey: 'behaviour' },
      {
        labelKey: 'nav.behaviourIncidents',
        href: '/behaviour/incidents',
        moduleKey: 'behaviour',
      },
      {
        labelKey: 'nav.behaviourStudents',
        href: '/behaviour/students',
        moduleKey: 'behaviour',
      },
      {
        labelKey: 'nav.guardianRestrictions',
        href: '/behaviour/guardian-restrictions',
        moduleKey: 'behaviour',
        roles: ADMIN_ROLES,
      },
      {
        labelKey: 'nav.pastoral',
        href: '/pastoral',
        moduleKey: 'pastoral',
        roles: [...ADMIN_ROLES, 'teacher'],
      },
    ],
  },
  {
    labelKey: 'nav.wellbeing',
    roles: STAFF_ROLES,
    items: [
      {
        labelKey: 'nav.myWorkload',
        href: '/wellbeing/my-workload',
        moduleKey: 'staff_wellbeing',
      },
      {
        labelKey: 'nav.supportResources',
        href: '/wellbeing/resources',
        moduleKey: 'staff_wellbeing',
      },
      { labelKey: 'nav.survey', href: '/wellbeing/survey', moduleKey: 'staff_wellbeing' },
      {
        labelKey: 'nav.wellbeingDashboard',
        href: '/wellbeing/dashboard',
        moduleKey: 'staff_wellbeing',
        roles: ADMIN_ROLES,
      },
      {
        labelKey: 'nav.surveyManagement',
        href: '/wellbeing/surveys',
        moduleKey: 'staff_wellbeing',
        roles: ADMIN_ROLES,
      },
      {
        labelKey: 'nav.boardReport',
        href: '/wellbeing/reports',
        moduleKey: 'staff_wellbeing',
        roles: ADMIN_ROLES,
      },
    ],
  },
  {
    labelKey: 'nav.sen',
    moduleKey: 'sen',
    roles: STAFF_ROLES,
    items: [
      { labelKey: 'nav.senDashboard', href: '/sen', moduleKey: 'sen' },
      { labelKey: 'nav.senStudents', href: '/sen/students', moduleKey: 'sen' },
      {
        labelKey: 'nav.senResourceAllocation',
        href: '/sen/resource-allocation',
        moduleKey: 'sen',
      },
      { labelKey: 'nav.senSnaAssignments', href: '/sen/sna-assignments', moduleKey: 'sen' },
      { labelKey: 'nav.senReports', href: '/sen/reports', moduleKey: 'sen' },
    ],
  },
  {
    labelKey: 'nav.scheduling',
    roles: STAFF_ROLES,
    items: [
      { labelKey: 'nav.rooms', href: '/rooms', roles: ADMIN_ROLES },
      {
        labelKey: 'nav.scheduling',
        href: '/scheduling',
        moduleKey: 'auto_scheduling',
        roles: ADMIN_ROLES,
      },
    ],
  },
  {
    labelKey: 'nav.operations',
    items: [
      {
        labelKey: 'nav.admissions',
        href: '/admissions',
        moduleKey: 'admissions',
        roles: [...ADMIN_ROLES, 'front_office'],
      },
      {
        labelKey: 'nav.engagement',
        href: '/engagement',
        roles: STAFF_ROLES,
      },
      {
        labelKey: 'nav.communications',
        href: '/communications',
        moduleKey: 'communications_outbound',
        roles: ADMIN_ROLES,
      },
      { labelKey: 'nav.approvals', href: '/approvals', roles: ADMIN_ROLES },
    ],
  },
  {
    labelKey: 'nav.financials',
    items: [
      {
        labelKey: 'nav.finance',
        href: '/finance',
        moduleKey: 'finance',
        roles: [...ADMIN_ROLES, 'accounting'],
      },
      {
        labelKey: 'nav.payroll',
        href: '/payroll',
        moduleKey: 'payroll',
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
      {
        labelKey: 'nav.regulatoryTusla',
        href: '/regulatory/tusla',
        moduleKey: 'compliance_advanced',
      },
      {
        labelKey: 'nav.regulatoryDesReturns',
        href: '/regulatory/des-returns',
        moduleKey: 'compliance_advanced',
      },
      {
        labelKey: 'nav.regulatoryOctoberReturns',
        href: '/regulatory/october-returns',
        moduleKey: 'compliance_advanced',
      },
      {
        labelKey: 'nav.regulatoryPpod',
        href: '/regulatory/ppod',
        moduleKey: 'compliance_advanced',
      },
      {
        labelKey: 'nav.regulatoryCba',
        href: '/regulatory/cba',
        moduleKey: 'compliance_advanced',
      },
      { labelKey: 'nav.regulatoryTransfers', href: '/regulatory/transfers' },
      { labelKey: 'nav.regulatoryAntiBullying', href: '/regulatory/anti-bullying' },
      {
        labelKey: 'nav.regulatorySubmissions',
        href: '/regulatory/submissions',
        moduleKey: 'compliance_advanced',
      },
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
      { labelKey: 'nav.website', href: '/website', moduleKey: 'website' },
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

export function filterNavByModules(
  sections: NavSectionConfig[],
  enabledModules: readonly ModuleKey[],
): NavSectionConfig[] {
  return sections
    .filter((section) => !section.moduleKey || enabledModules.includes(section.moduleKey))
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.moduleKey || enabledModules.includes(item.moduleKey),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

// ─── Hub configurations (Morph Bar) ──────────────────────────────────────────

export interface HubConfig {
  key: string;
  labelKey: string;
  basePaths: string[];
  moduleKey?: ModuleKey;
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
    // /people is the hub landing page — students/staff/households are
    // sub-pages reached from the dashboard. Listed for active-hub detection.
    basePaths: ['/people', '/students', '/staff', '/households'],
    roles: STAFF_ROLES,
  },
  {
    key: 'learning',
    // /learning is the hub landing page — all sub-module paths are listed
    // so the morph bar highlights "Learning" when navigating within them.
    labelKey: 'nav.learning',
    basePaths: [
      '/learning',
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
      '/report-comments',
      '/diary',
    ],
    roles: [...STAFF_ROLES, 'parent'],
  },
  {
    // The wellbeing hub lands on its new /wellbeing super-hub dashboard
    // (impl 13 of the wellbeing rebuild). `/wellbeing` is listed first so
    // clicking the hub pill in the morph bar always resolves to the
    // super-hub, not the legacy `/behaviour` page. The remaining base
    // paths are still here for active-hub detection when the user is
    // deep inside behaviour / pastoral / sen / early-warnings /
    // safeguarding sub-modules.
    key: 'wellbeing',
    labelKey: 'nav.wellbeing',
    basePaths: [
      '/wellbeing',
      '/behaviour',
      '/pastoral',
      '/sen',
      '/early-warnings',
      '/safeguarding',
    ],
    roles: STAFF_ROLES,
  },
  {
    key: 'operations',
    // The Operations hub lands on its dashboard (/operations), which
    // presents six cards that route into the individual sub-pages. The
    // sub-pages remain part of this hub for active-hub detection, but
    // there is intentionally no sub-strip config for `operations` — the
    // dashboard itself is the navigation surface.
    labelKey: 'nav.operations',
    basePaths: [
      '/operations',
      '/admissions',
      '/approvals',
      '/scheduling',
      '/rooms',
      '/engagement',
      '/leave',
    ],
    roles: STAFF_ROLES,
  },
  {
    // Communications hub: inbox, audiences, oversight, announcements,
    // and the admin-tier comms settings (messaging policy, safeguarding
    // keywords, fallback). Listed BEFORE `settings` so the more-specific
    // `/settings/messaging-policy` and `/settings/communications/*`
    // basePaths match here first (first-match wins in the layout's
    // activeHub detection).
    key: 'communications',
    labelKey: 'nav.communicationsHub',
    // /communications is FIRST so clicking the hub pill in the morph bar
    // always lands on the dashboard, not on /inbox. The other entries are
    // still here for active-hub detection when the user is deep inside
    // inbox / audiences / oversight / the admin-tier comms settings.
    basePaths: [
      '/communications',
      '/inbox',
      '/settings/messaging-policy',
      '/settings/communications',
    ],
    roles: STAFF_ROLES,
  },
  {
    // FIN-014: parents do not get a top-level Finance hub — the finance
    // surface for parents is the Finances tab on /dashboard/parent. The hub
    // routes to admin-only pages that 403 parents.
    key: 'finance',
    labelKey: 'nav.finance',
    basePaths: ['/finance', '/payroll'],
    roles: ADMIN_ROLES,
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
  moduleKey?: ModuleKey;
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
  /** Module-gate for the entire group */
  moduleKey?: ModuleKey;
}

/**
 * Hubs that use grouped (two-level) sub-strip navigation.
 * If a hub key appears here, the layout renders GroupedSubStrip instead of SubStrip.
 */
export const hubGroupedSubStripConfigs: Record<string, SubStripGroupConfig[]> = {
  // Learning intentionally has no sub-strip — the /learning dashboard
  // is the navigation surface with hub cards for each sub-module.
  learning: [],
};

export const hubSubStripConfigs: Record<string, SubStripTabConfig[]> = {
  // Engagement intentionally has no sub-strip — the /engagement dashboard
  // is the navigation surface for this hub (four tiles for events, form
  // templates, analytics, and consent archive).
  engagement: [],
  // People intentionally has no sub-strip — the /people dashboard
  // is the navigation surface for this hub (KPI tiles, class enrollment
  // breakdown, and categorised module navigation).
  people: [],
  // The wellbeing hub's /wellbeing super-hub dashboard is the entire
  // navigation surface for this hub — no sub-strip cascade. Users reach
  // behaviour / pastoral / sen / early-warnings / safeguarding / staff
  // wellbeing / settings via the hub tiles on the dashboard itself.
  wellbeing: [],
  // Operations intentionally has no sub-strip — the /operations dashboard
  // page is the navigation surface for this hub (six cards → six sub-pages).
  operations: [],
  // Finance intentionally has no sub-strip — the /finance dashboard
  // is the navigation surface for this hub (KPI cards, quick actions,
  // and categorised module tiles all live on the dashboard itself).
  finance: [],
  reports: [],
  // The communications hub intentionally has no sub-strip tabs — the
  // `/communications` dashboard is the entire hub navigation. All inbox
  // sub-pages (audiences, oversight, announcements, safeguarding,
  // messaging policy, fallback) are reached via cards / tiles on the
  // dashboard itself.
  communications: [],
  // Regulatory intentionally has no sub-strip — the /regulatory dashboard
  // is the navigation surface (super-hub of sub-module tiles). Every
  // sub-module (Tusla, PPOD, DES Returns, October Returns, Calendar,
  // Submissions, CBA, Transfers, Anti-Bullying, Safeguarding, GDPR) has
  // its own dashboard accessed via the tiles on /regulatory.
  regulatory: [],
  settings: [],
};
