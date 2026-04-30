// Tier 2 locales (it, ro, pl as of this writing) only translate the parent
// and student surface. Other namespaces fall back to the tenant default
// locale at runtime via the route-level guard added in implementation 11.
//
// This list governs the translation-parity test for Tier 2 locales: the
// parity gate enforces 100% match against this subset, ignoring out-of-scope
// namespaces. Most entries are top-level namespaces. Dotted entries are used
// only for parent/student slices that live under a broader staff/admin
// namespace and must not pull the whole namespace into Tier 2.
//
// Each entry below must exist as either a top-level namespace or an exact
// dotted message path in apps/web/messages/en.json. The list was derived by
// scanning every useTranslations(...) call under parent-facing
// route directories: (auth)/, (public)/, (school)/parent/, (school)/dashboard/,
// (school)/homework/parent/, (school)/engagement/parent/,
// (school)/behaviour/parent-portal/, (school)/wellbeing/survey/, plus chrome
// components (notification panel, cookie consent, guardian restriction,
// attachment scan badge, global search) that every authenticated user sees.
//
// When adding a new parent/student-facing namespace to en.json, add it
// here in the same commit. The companion test (tier-scopes.spec.ts) will
// fail if a listed namespace is missing from en.json.

export const TIER_2_NAMESPACES: readonly string[] = [
  // Auth + MFA
  'auth',
  'mfaQrCode',

  // Common UI primitives
  'common',
  'errors',

  // Shell / chrome / per-user settings
  'nav',
  'sidebar',
  'userMenu',
  'theme',
  'profile',
  'shortcuts',
  'cookieConsent',
  'privacyConsent',
  'search',

  // Dashboards (parent + student)
  'dashboard',

  // Notifications, inbox, announcements
  'notifications',
  'inbox',
  'communication',
  'communications',
  'announcements',

  // Public / unauthenticated surfaces
  'contact',
  'paymentResult',
  'publicApplyForm',
  'admissions',
  'legal',
  'website',

  // Parent self-service (appeals, documents, recognition, self-referral)
  'parentAppeal',
  'parentDocuments',
  'parentRecognition',
  'parentSelfReferral',

  // Parent/student data lookups
  'parent',
  'parents',
  'students',
  'households',

  // Student-facing
  'studentCheckin',
  'homework',
  'attendance',
  'gradebook',
  'reportCards',
  'transcripts',
  'reportComments',
  'wellbeing',
  'scheduling.parentTimetable',

  // Parent-visible (ad hoc surfaces a parent can land on)
  'engagement',
  'finance',
  'sen',
  'early_warning',
  'guardianRestriction',
  'attachments',
] as const;

export type Tier2Namespace = (typeof TIER_2_NAMESPACES)[number];
