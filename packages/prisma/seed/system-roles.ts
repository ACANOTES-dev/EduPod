/**
 * System role definitions and their default permission assignments.
 * System roles are created per-tenant (with tenant_id) and are immutable.
 */

export interface SystemRoleSeed {
  role_key: string;
  display_name: string;
  role_tier: 'platform' | 'admin' | 'staff' | 'parent';
  default_permissions: string[];
}

export const SYSTEM_ROLES: SystemRoleSeed[] = [
  {
    role_key: 'platform_owner',
    display_name: 'Platform Owner',
    role_tier: 'platform',
    default_permissions: [
      'tenants.manage',
      'tenants.view',
      'platform.impersonate',
      'platform.reset_mfa',
    ],
  },
  {
    role_key: 'school_owner',
    display_name: 'School Owner',
    role_tier: 'admin',
    default_permissions: [
      // Users & Roles
      'users.manage', 'users.invite', 'users.view', 'roles.manage',
      // Settings & Config
      'settings.manage', 'branding.manage', 'stripe.manage',
      'notifications.manage', 'modules.manage', 'domains.manage',
      // Approvals
      'approvals.manage', 'approvals.view',
      // Payroll (full access)
      'payroll.view', 'payroll.manage_compensation', 'payroll.create_run',
      'payroll.finalise_run', 'payroll.generate_payslips',
      'payroll.view_bank_details', 'payroll.view_reports',
      // Schedule (full admin)
      'schedule.manage', 'schedule.override_conflict', 'schedule.manage_closures',
      'schedule.configure_period_grid', 'schedule.configure_requirements',
      'schedule.configure_availability', 'schedule.manage_preferences',
      'schedule.run_auto', 'schedule.apply_auto', 'schedule.pin_entries',
      'schedule.view_auto_reports',
      // Students, Attendance, Gradebook
      'students.manage', 'students.view',
      'attendance.manage', 'attendance.view', 'attendance.take',
      'gradebook.manage', 'gradebook.view', 'gradebook.enter_grades',
      'gradebook.override_final_grade', 'gradebook.publish_report_cards',
      'gradebook.apply_curve', 'gradebook.view_analytics',
      'gradebook.publish_grades_to_parents', 'gradebook.manage_ai_grading',
      'gradebook.approve_ai_grading',
      'report_cards.approve', 'report_cards.manage_templates', 'report_cards.bulk_operations',
      'transcripts.generate',
      // Admissions, Finance
      'admissions.manage', 'admissions.view',
      'finance.manage', 'finance.view', 'finance.process_payments', 'finance.issue_refunds',
      // Communications, Inquiries, Website, Analytics, Compliance
      'communications.manage', 'communications.view', 'communications.send',
      'inquiries.view', 'inquiries.respond',
      'website.manage', 'analytics.view',
      'compliance.manage', 'compliance.view',
    ],
  },
  {
    role_key: 'school_admin',
    display_name: 'School Admin',
    role_tier: 'admin',
    default_permissions: [
      'users.manage', 'users.invite', 'users.view', 'roles.manage',
      'settings.manage', 'branding.manage', 'notifications.manage',
      'approvals.view',
      // Schedule (admin without auto-run/apply)
      'schedule.manage', 'schedule.manage_closures',
      'schedule.configure_period_grid', 'schedule.configure_requirements',
      'schedule.configure_availability', 'schedule.manage_preferences',
      'schedule.pin_entries', 'schedule.view_auto_reports',
      // Students, Attendance, Gradebook
      'students.manage', 'students.view',
      'attendance.manage', 'attendance.view', 'attendance.take',
      'gradebook.manage', 'gradebook.view', 'gradebook.enter_grades',
      'gradebook.override_final_grade', 'gradebook.publish_report_cards',
      'gradebook.apply_curve', 'gradebook.view_analytics',
      'gradebook.publish_grades_to_parents', 'gradebook.manage_ai_grading',
      'gradebook.approve_ai_grading',
      'report_cards.approve', 'report_cards.manage_templates', 'report_cards.bulk_operations',
      'transcripts.generate',
      // Admissions
      'admissions.manage', 'admissions.view',
      // Finance (view only by default)
      'finance.view',
      // Communications, Inquiries
      'communications.manage', 'communications.view', 'communications.send',
      'inquiries.view', 'inquiries.respond',
      // Website, Analytics, Compliance
      'website.manage', 'analytics.view',
      'compliance.view',
    ],
  },
  {
    role_key: 'teacher',
    display_name: 'Teacher',
    role_tier: 'staff',
    default_permissions: [
      'students.view',
      'attendance.take', 'attendance.view',
      'gradebook.enter_grades', 'gradebook.view', 'gradebook.manage_ai_grading',
      'schedule.view_own',
      'schedule.manage_own_preferences',
      'schedule.view_own_satisfaction',
    ],
  },
  {
    role_key: 'finance_staff',
    display_name: 'Finance Staff',
    role_tier: 'admin',
    default_permissions: [
      'finance.manage', 'finance.view', 'finance.process_payments',
    ],
  },
  {
    role_key: 'admissions_staff',
    display_name: 'Admissions Staff',
    role_tier: 'admin',
    default_permissions: [
      'admissions.manage', 'admissions.view',
    ],
  },
  {
    role_key: 'parent',
    display_name: 'Parent',
    role_tier: 'parent',
    default_permissions: [
      'parent.view_own_students',
      'parent.view_attendance',
      'parent.view_grades',
      'parent.view_invoices',
      'parent.make_payments',
      'parent.submit_inquiry',
      'parent.view_announcements',
      'parent.view_transcripts',
    ],
  },
];
