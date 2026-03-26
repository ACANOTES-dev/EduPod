/**
 * Global permission definitions for the School Operating System.
 * Seeded once — all tenants share the same global permission records.
 */

export interface PermissionSeed {
  permission_key: string;
  description: string;
  permission_tier: 'platform' | 'admin' | 'staff' | 'parent';
}

export const PERMISSION_SEEDS: PermissionSeed[] = [
  // ─── Platform tier ─────────────────────────────────────────────────────────
  { permission_key: 'tenants.manage', description: 'Create, update, suspend, and archive tenants', permission_tier: 'platform' },
  { permission_key: 'tenants.view', description: 'View tenant list and details', permission_tier: 'platform' },
  { permission_key: 'platform.impersonate', description: 'Impersonate users in any tenant (read-only)', permission_tier: 'platform' },
  { permission_key: 'platform.reset_mfa', description: 'Reset MFA for any user', permission_tier: 'platform' },

  // ─── Admin tier — User & Role management ───────────────────────────────────
  { permission_key: 'users.manage', description: 'Manage users within tenant (suspend, reactivate)', permission_tier: 'admin' },
  { permission_key: 'users.invite', description: 'Send invitations to new users', permission_tier: 'admin' },
  { permission_key: 'users.view', description: 'View user list within tenant', permission_tier: 'admin' },
  { permission_key: 'roles.manage', description: 'Create, edit, and delete custom roles', permission_tier: 'admin' },

  // ─── Admin tier — Settings & Configuration ─────────────────────────────────
  { permission_key: 'settings.manage', description: 'Manage tenant settings', permission_tier: 'admin' },
  { permission_key: 'branding.manage', description: 'Manage school branding and logos', permission_tier: 'admin' },
  { permission_key: 'stripe.manage', description: 'Configure Stripe payment keys', permission_tier: 'admin' },
  { permission_key: 'notifications.manage', description: 'Manage notification settings', permission_tier: 'admin' },
  { permission_key: 'modules.manage', description: 'Enable or disable tenant modules', permission_tier: 'admin' },
  { permission_key: 'domains.manage', description: 'Manage custom domains', permission_tier: 'admin' },

  // ─── Admin tier — Approvals ────────────────────────────────────────────────
  { permission_key: 'approvals.manage', description: 'Configure approval workflows', permission_tier: 'admin' },
  { permission_key: 'approvals.view', description: 'View approval requests', permission_tier: 'admin' },

  // ─── Admin tier — Payroll ──────────────────────────────────────────────────
  { permission_key: 'payroll.view', description: 'View payroll runs, entries, payslips, and reports', permission_tier: 'admin' },
  { permission_key: 'payroll.manage_compensation', description: 'Create and edit staff compensation records', permission_tier: 'admin' },
  { permission_key: 'payroll.create_run', description: 'Create and edit draft payroll runs', permission_tier: 'admin' },
  { permission_key: 'payroll.finalise_run', description: 'Finalise payroll runs', permission_tier: 'admin' },
  { permission_key: 'payroll.generate_payslips', description: 'Generate and export payslip PDFs', permission_tier: 'admin' },
  { permission_key: 'payroll.view_bank_details', description: 'View decrypted staff bank account details (audit-logged)', permission_tier: 'admin' },
  { permission_key: 'payroll.view_reports', description: 'View payroll analytics and summary reports', permission_tier: 'admin' },
  { permission_key: 'payroll.manage_attendance', description: 'Mark and manage daily staff attendance records', permission_tier: 'admin' },
  { permission_key: 'payroll.manage_class_delivery', description: 'Confirm and manage class delivery records', permission_tier: 'admin' },
  { permission_key: 'payroll.manage_exports', description: 'Create export templates and export payroll data', permission_tier: 'admin' },
  { permission_key: 'payroll.manage_allowances', description: 'Configure allowance types and staff allowance assignments', permission_tier: 'admin' },
  { permission_key: 'payroll.manage_deductions', description: 'Create and manage staff recurring deductions', permission_tier: 'admin' },

  // ─── Admin tier — Schedule ─────────────────────────────────────────────────
  { permission_key: 'schedule.manage', description: 'Manage schedule entries (create, edit, delete)', permission_tier: 'admin' },
  { permission_key: 'schedule.override_conflict', description: 'Override hard scheduling conflicts with reason', permission_tier: 'admin' },
  { permission_key: 'schedule.manage_closures', description: 'Manage school closures and non-teaching days', permission_tier: 'admin' },
  { permission_key: 'schedule.configure_period_grid', description: 'Configure period grid (time slots, breaks)', permission_tier: 'admin' },
  { permission_key: 'schedule.configure_requirements', description: 'Configure scheduling requirements per class', permission_tier: 'admin' },
  { permission_key: 'schedule.configure_availability', description: 'Configure teacher and room availability', permission_tier: 'admin' },
  { permission_key: 'schedule.manage_preferences', description: 'Manage teacher scheduling preferences', permission_tier: 'admin' },
  { permission_key: 'schedule.run_auto', description: 'Run auto-scheduler solver', permission_tier: 'admin' },
  { permission_key: 'schedule.apply_auto', description: 'Apply auto-scheduler results to live schedule', permission_tier: 'admin' },
  { permission_key: 'schedule.pin_entries', description: 'Pin schedule entries (prevent auto-scheduler changes)', permission_tier: 'admin' },
  { permission_key: 'schedule.view_auto_reports', description: 'View auto-scheduler reports and diagnostics', permission_tier: 'admin' },
  { permission_key: 'schedule.manage_substitutions', description: 'Report teacher absences, find and assign substitutes', permission_tier: 'admin' },
  { permission_key: 'schedule.view_reports', description: 'View scheduling reports: cover analytics, workload heatmap, room utilization', permission_tier: 'admin' },
  { permission_key: 'schedule.manage_exams', description: 'Create and manage exam timetable sessions and slots', permission_tier: 'admin' },
  { permission_key: 'schedule.manage_scenarios', description: 'Create and manage what-if scheduling scenarios', permission_tier: 'admin' },

  // ─── Admin tier — Students ─────────────────────────────────────────────────
  { permission_key: 'students.manage', description: 'Manage student records', permission_tier: 'admin' },
  { permission_key: 'students.view', description: 'View student records', permission_tier: 'admin' },

  // ─── Admin tier — Attendance ───────────────────────────────────────────────
  { permission_key: 'attendance.manage', description: 'Manage attendance configuration and overrides', permission_tier: 'admin' },
  { permission_key: 'attendance.view', description: 'View attendance records', permission_tier: 'admin' },
  { permission_key: 'attendance.amend_historical', description: 'Amend past attendance records', permission_tier: 'admin' },
  { permission_key: 'attendance.override_closure', description: 'Create attendance session on a closure date', permission_tier: 'admin' },

  // ─── Admin tier — Gradebook ────────────────────────────────────────────────
  { permission_key: 'gradebook.manage', description: 'Manage gradebook configuration', permission_tier: 'admin' },
  { permission_key: 'gradebook.view', description: 'View gradebook data', permission_tier: 'admin' },
  { permission_key: 'gradebook.override_final_grade', description: 'Override computed period grade display value', permission_tier: 'admin' },
  { permission_key: 'gradebook.publish_report_cards', description: 'Publish report cards to parents', permission_tier: 'admin' },
  { permission_key: 'gradebook.apply_curve', description: 'Apply grade curves and adjustments to assessment scores', permission_tier: 'admin' },
  { permission_key: 'gradebook.view_analytics', description: 'View gradebook analytics and performance reports', permission_tier: 'admin' },
  { permission_key: 'gradebook.publish_grades_to_parents', description: 'Publish individual grades to parent portal', permission_tier: 'admin' },
  { permission_key: 'gradebook.approve_ai_grading', description: 'Review and approve AI-generated grading suggestions', permission_tier: 'admin' },
  { permission_key: 'transcripts.generate', description: 'Generate academic transcripts', permission_tier: 'admin' },

  // ─── Admin tier — Report Cards ─────────────────────────────────────────────
  { permission_key: 'report_cards.approve', description: 'Approve report cards before publishing', permission_tier: 'admin' },
  { permission_key: 'report_cards.manage_templates', description: 'Create and manage report card templates', permission_tier: 'admin' },
  { permission_key: 'report_cards.bulk_operations', description: 'Perform bulk operations on report cards (generate, publish, export)', permission_tier: 'admin' },

  // ─── Admin tier — Admissions ───────────────────────────────────────────────
  { permission_key: 'admissions.manage', description: 'Manage admissions applications and workflows', permission_tier: 'admin' },
  { permission_key: 'admissions.view', description: 'View admissions applications', permission_tier: 'admin' },

  // ─── Admin tier — Finance ──────────────────────────────────────────────────
  { permission_key: 'finance.manage', description: 'Manage finance configuration and fee structures', permission_tier: 'admin' },
  { permission_key: 'finance.view', description: 'View financial data', permission_tier: 'admin' },
  { permission_key: 'finance.process_payments', description: 'Process and record payments', permission_tier: 'admin' },
  { permission_key: 'finance.issue_refunds', description: 'Issue refunds', permission_tier: 'admin' },

  // ─── Admin tier — Communications ───────────────────────────────────────────
  { permission_key: 'communications.manage', description: 'Manage communications and announcements', permission_tier: 'admin' },
  { permission_key: 'communications.view', description: 'View communication history', permission_tier: 'admin' },
  { permission_key: 'communications.send', description: 'Send communications and announcements', permission_tier: 'admin' },

  // ─── Admin tier — Parent Inquiries ─────────────────────────────────────────
  { permission_key: 'inquiries.view', description: 'View parent inquiries and messages', permission_tier: 'admin' },
  { permission_key: 'inquiries.respond', description: 'Respond to parent inquiries', permission_tier: 'admin' },

  // ─── Admin tier — Website ──────────────────────────────────────────────────
  { permission_key: 'website.manage', description: 'Manage public school website content', permission_tier: 'admin' },

  // ─── Admin tier — Analytics ────────────────────────────────────────────────
  { permission_key: 'analytics.view', description: 'View analytics dashboards and reports', permission_tier: 'admin' },
  { permission_key: 'analytics.manage_reports', description: 'Create custom reports, schedule delivery, and set threshold alerts', permission_tier: 'admin' },
  { permission_key: 'analytics.view_board_reports', description: 'View and generate board governance reports', permission_tier: 'admin' },
  { permission_key: 'analytics.manage_compliance', description: 'Configure compliance report templates for regulatory submissions', permission_tier: 'admin' },

  // ─── Admin tier — Compliance ───────────────────────────────────────────────
  { permission_key: 'curriculum_matrix.manage', description: 'Unlock and modify the curriculum matrix (class-subject assignments)', permission_tier: 'admin' },
  { permission_key: 'compliance.manage', description: 'Manage compliance and GDPR settings', permission_tier: 'admin' },
  { permission_key: 'compliance.view', description: 'View audit logs and compliance reports', permission_tier: 'admin' },

  // ─── Staff tier ────────────────────────────────────────────────────────────
  { permission_key: 'attendance.take', description: 'Take attendance for assigned classes', permission_tier: 'staff' },
  { permission_key: 'gradebook.enter_grades', description: 'Enter grades for assigned classes', permission_tier: 'staff' },
  { permission_key: 'gradebook.manage_ai_grading', description: 'Configure and use AI grading for assigned classes', permission_tier: 'staff' },
  { permission_key: 'schedule.view_own', description: 'View own schedule', permission_tier: 'staff' },
  { permission_key: 'schedule.manage_own_preferences', description: 'Manage own scheduling preferences', permission_tier: 'staff' },
  { permission_key: 'schedule.view_own_satisfaction', description: 'View own preference satisfaction score', permission_tier: 'staff' },
  { permission_key: 'schedule.view_personal_timetable', description: 'View personal timetable and generate calendar subscription links', permission_tier: 'staff' },

  // ─── Parent tier ───────────────────────────────────────────────────────────
  { permission_key: 'parent.view_own_students', description: 'View own linked students', permission_tier: 'parent' },
  { permission_key: 'parent.view_attendance', description: 'View attendance for linked students', permission_tier: 'parent' },
  { permission_key: 'parent.view_grades', description: 'View grades for linked students', permission_tier: 'parent' },
  { permission_key: 'parent.view_invoices', description: 'View invoices for household', permission_tier: 'parent' },
  { permission_key: 'parent.make_payments', description: 'Make payments for household invoices', permission_tier: 'parent' },
  { permission_key: 'parent.submit_inquiry', description: 'Submit parent inquiries', permission_tier: 'parent' },
  { permission_key: 'parent.view_announcements', description: 'View school announcements', permission_tier: 'parent' },
  { permission_key: 'parent.view_transcripts', description: 'View and download own children\'s transcripts', permission_tier: 'parent' },

  // ─── Behaviour Management ──────────────────────────────────────────────────
  { permission_key: 'behaviour.log', description: 'Create incidents, access quick-log', permission_tier: 'staff' },
  { permission_key: 'behaviour.view', description: 'View incidents within scope', permission_tier: 'staff' },
  { permission_key: 'behaviour.manage', description: 'Manage sanctions, interventions, tasks, appeals', permission_tier: 'staff' },
  { permission_key: 'behaviour.admin', description: 'Configure behaviour module, admin operations', permission_tier: 'admin' },
  { permission_key: 'behaviour.view_sensitive', description: 'View context notes and SEND notes', permission_tier: 'staff' },
  { permission_key: 'behaviour.view_staff_analytics', description: 'View staff logging activity', permission_tier: 'admin' },
  { permission_key: 'behaviour.ai_query', description: 'AI narrative and natural language query', permission_tier: 'staff' },
  { permission_key: 'behaviour.appeal', description: 'Submit appeal as parent', permission_tier: 'parent' },

  // ─── Safeguarding ────────────────────────────────────────────────────────
  { permission_key: 'safeguarding.report', description: 'Report safeguarding concerns', permission_tier: 'staff' },
  { permission_key: 'safeguarding.view', description: 'View safeguarding concerns', permission_tier: 'admin' },
  { permission_key: 'safeguarding.manage', description: 'Manage safeguarding concerns', permission_tier: 'admin' },
  { permission_key: 'safeguarding.seal', description: 'Seal safeguarding concerns (irreversible)', permission_tier: 'admin' },
];
