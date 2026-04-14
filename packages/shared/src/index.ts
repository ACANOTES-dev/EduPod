// ─── FROZEN ──────────────────────────────────────────────────────────────────
// This root barrel is frozen. New domain-specific exports go into domain
// subpath modules (e.g., @school/shared/behaviour, @school/shared/pastoral).
// Only true shared-kernel primitives (auth, pagination, tenant, API response
// types) should be added here. All others must use subpath imports.
// ────────────────────────────────────────────────────────────────────────────

// Constants
export * from './constants/ports';
export * from './constants/pagination';
export * from './constants/auth';
export * from './constants/modules';
export * from './constants/permissions';
export * from './constants/notification-types';
export * from './constants/sequence-types';
export * from './constants/student-status';
export * from './constants/class-enrolment-status';
export * from './constants/invoice-status';
export * from './constants/application-status';
export * from './constants/system';
export * from './constants/feature-flags';

// Types
export * from './types/api-response';
export * from './types/auth';
export * from './types/tenant';
export * from './types/tenant-config';
export * from './types/user';
export * from './types/rbac';
export * from './types/approval';
export * from './types/staff-profile';
export * from './types/preview';
export * from './types/household';
export * from './types/parent';
export * from './types/student';
export * from './types/academic';
export * from './types/class';
export * from './types/search';
export * from './types/dashboard';

// Schemas
export * from './schemas/pagination.schema';
export * from './schemas/auth.schema';
export * from './schemas/tenant.schema';
export * from './schemas/user.schema';
export * from './schemas/rbac.schema';
export * from './schemas/approval.schema';
export * from './schemas/stripe-config.schema';
export * from './schemas/ui-preferences.schema';
export * from './schemas/academic.schema';
export * from './schemas/staff-profile.schema';
export * from './schemas/household.schema';
export * from './schemas/parent.schema';
export * from './schemas/student.schema';
export * from './schemas/class.schema';
export * from './schemas/search.schema';
export * from './schemas/promotion.schema';
export * from './schemas/admission-form.schema';
export * from './schemas/application.schema';
export * from './schemas/registration.schema';
export * from './schemas/job-payload.schema';

// P4A Types
export * from './types/room';
export * from './types/schedule';
export * from './types/school-closure';
export * from './types/attendance';

// P4A Schemas
export * from './schemas/room.schema';
export * from './schemas/schedule.schema';
export * from './schemas/school-closure.schema';
export * from './schemas/attendance.schema';

// P4B Types
export * from './types/schedule-period-template';
export * from './types/class-scheduling-requirement';
export * from './types/staff-availability';
export * from './types/staff-scheduling-preference';
export * from './types/scheduling-run';

// P4B Schemas
export * from './schemas/schedule-period-template.schema';
export * from './schemas/class-scheduling-requirement.schema';
export * from './schemas/staff-availability.schema';
export * from './schemas/staff-scheduling-preference.schema';
export * from './schemas/scheduling-run.schema';

// P5 Types
export * from './types/gradebook';

// P5 Schemas
export * from './schemas/gradebook.schema';

// P6 Types
export * from './types/finance';

// P6 Schemas
export * from './schemas/finance.schema';

// P6 Finance State Machine
export * from './finance/state-machine-payment';

// P6B Types
export * from './types/payroll';

// P6B Schemas
export * from './schemas/payroll.schema';

// P6B Payroll State Machine
export * from './payroll/state-machine';

// P7 Types
export * from './types/announcement';
export * from './types/notification';
export * from './types/notification-template';
export * from './types/parent-inquiry';
export * from './types/website-page';
export * from './types/contact-form';

// P7 Schemas
export * from './schemas/announcement.schema';
export * from './schemas/notification.schema';
export * from './schemas/notification-template.schema';
export * from './schemas/parent-inquiry.schema';
export * from './schemas/website-page.schema';
export * from './schemas/contact-form.schema';

// P8 Types
export * from './types/audit-log';
export * from './types/compliance';
export * from './types/import';
export * from './types/report';

// P8 Schemas
export * from './schemas/audit-log.schema';
export * from './schemas/compliance.schema';
export * from './schemas/import.schema';
export * from './schemas/report.schema';

// P8 Compliance State Machine
export * from './compliance/state-machine';

// Scheduling v2 Schemas
export * from './schemas/scheduling.schema';

// Scheduling World-Class Enhancement Schemas
export * from './schemas/scheduling-enhanced.schema';

// Leave & Cover
export * from './schemas/leave.schema';

// Reports World-Class Enhancement Schemas
export * from './schemas/reports-enhanced.schema';

// Report Cards Redesign (Implementation 01)
export * from './report-cards';

// ─── Domain modules ───────────────────────────────────────────────────────
// These are available via subpath imports:
//   @school/shared/behaviour
//   @school/shared/pastoral
//   @school/shared/sen
//   @school/shared/staff-wellbeing
//   @school/shared/gdpr
//   @school/shared/security
//   @school/shared/regulatory
//   @school/shared/early-warning
//   @school/shared/engagement
//   @school/shared/scheduler
//   @school/shared/ai
// See package.json "exports" and "typesVersions" for resolution.

// Parent Daily Digest
export * from './schemas/parent-digest.schema';

// Homework & Diary
export * from './schemas/homework.schema';
export * from './constants/homework-status';
export * from './constants/homework-type';
export * from './constants/completion-status';
export * from './types/homework';

// Household number primitives
export * from './households/household-number';

// Helpers
export * from './helpers/notification';
