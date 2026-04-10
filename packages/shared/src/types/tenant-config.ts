import type { ModuleKey } from '../constants/modules';
import type { NotificationType } from '../constants/notification-types';

export interface TenantModule {
  module_key: ModuleKey;
  is_enabled: boolean;
}

export interface TenantNotificationSetting {
  notification_type: NotificationType;
  is_enabled: boolean;
  channels: string[];
}

export interface TenantBranding {
  logo_url: string | null;
  favicon_url: string | null;
  primary_colour: string | null;
  secondary_colour: string | null;
  login_background_url: string | null;
  custom_css: string | null;
}

export interface TenantSettingsAttendance {
  allowTeacherAmendment: boolean;
  autoLockAfterDays: number | null;
  pendingAlertTimeHour: number;
}

export interface TenantSettingsGradebook {
  defaultMissingGradePolicy: 'exclude' | 'zero';
  requireGradeComment: boolean;
}

export interface TenantSettingsAdmissions {
  requireApprovalForAcceptance: boolean;
  upfront_percentage: number; // 0..100 — percent of net fees due before admission
  payment_window_days: number; // default 7 — days before conditional approval lapses
  max_application_horizon_years: number; // default 2 — how far ahead parents can apply
  allow_cash: boolean;
  allow_bank_transfer: boolean;
  bank_iban: string | null;
  require_override_approval_role: 'school_owner' | 'school_principal';
}

export const DEFAULT_ADMISSIONS_SETTINGS: TenantSettingsAdmissions = {
  requireApprovalForAcceptance: true,
  upfront_percentage: 100,
  payment_window_days: 7,
  max_application_horizon_years: 2,
  allow_cash: true,
  allow_bank_transfer: false,
  bank_iban: null,
  require_override_approval_role: 'school_principal',
};

export interface TenantSettingsFinance {
  requireApprovalForInvoiceIssue: boolean;
  defaultPaymentTermDays: number;
  allowPartialPayment: boolean;
  paymentReminderEnabled: boolean;
  dueSoonReminderDays: number;
  finalNoticeAfterDays: number;
  reminderChannel: 'email' | 'whatsapp' | 'both';
  autoIssueRecurringInvoices: boolean;
  lateFeeEnabled: boolean;
  defaultLateFeeConfigId: string | null;
}

export interface TenantSettingsCommunications {
  primaryOutboundChannel: 'email' | 'whatsapp';
  requireApprovalForAnnouncements: boolean;
}

export interface TenantSettingsPayroll {
  requireApprovalForNonPrincipal: boolean;
  defaultBonusMultiplier: number;
  autoPopulateClassCounts: boolean;
}

export interface TenantSettingsGeneral {
  parentPortalEnabled: boolean;
  attendanceVisibleToParents: boolean;
  gradesVisibleToParents: boolean;
  inquiryStaleHours: number;
}

export interface TenantSettingsPreferenceWeights {
  low: number;
  medium: number;
  high: number;
}

export interface TenantSettingsGlobalSoftWeights {
  evenSubjectSpread: number;
  minimiseTeacherGaps: number;
  roomConsistency: number;
  workloadBalance: number;
}

export interface TenantSettingsScheduling {
  teacherWeeklyMaxPeriods: number | null;
  autoSchedulerEnabled: boolean;
  requireApprovalForNonPrincipal: boolean;
  maxSolverDurationSeconds: number;
  preferenceWeights: TenantSettingsPreferenceWeights;
  globalSoftWeights: TenantSettingsGlobalSoftWeights;
}

export interface TenantSettingsApprovals {
  expiryDays: number;
  reminderAfterHours: number;
}

export interface TenantSettingsCompliance {
  auditLogRetentionMonths: number;
}

export interface TenantSettingsSen {
  module_enabled: boolean;
  default_review_cycle_weeks: number;
  auto_flag_on_referral: boolean;
  sna_schedule_format: 'weekly' | 'daily';
  enable_parent_portal_access: boolean;
  plan_number_prefix: string;
}

export interface TenantSettingsJson {
  attendance: TenantSettingsAttendance;
  gradebook: TenantSettingsGradebook;
  admissions: TenantSettingsAdmissions;
  finance: TenantSettingsFinance;
  communications: TenantSettingsCommunications;
  payroll: TenantSettingsPayroll;
  general: TenantSettingsGeneral;
  scheduling: TenantSettingsScheduling;
  approvals: TenantSettingsApprovals;
  compliance: TenantSettingsCompliance;
  sen: TenantSettingsSen;
  behaviour: import('../behaviour/schemas/settings.schema').BehaviourSettings;
  staff_wellbeing: import('../staff-wellbeing/schemas/tenant-settings.schema').StaffWellbeingSettings;
  parent_digest: import('../schemas/parent-digest.schema').ParentDigestSettingsDto;
}
