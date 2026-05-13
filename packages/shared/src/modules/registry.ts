/**
 * Canonical module registry for per-tenant module gating.
 *
 * Single source of truth. Add new gateable modules here first; the rest
 * of the system (seed, fixture, API guard, frontend hook, tests) will
 * fail compile/test until they're updated to match.
 *
 * Modules NOT in this registry are CORE: always-on, never gateable,
 * never appear in the admin console. The full core list is documented in
 * Module Gating/STRATEGY.md section 5.2 (this file is the gateable list only).
 *
 * See Module Gating/STRATEGY.md for the full rationale per module.
 */

export type ModuleKey =
  | 'admissions'
  | 'gradebook'
  | 'homework'
  | 'sen'
  | 'finance'
  | 'payroll'
  | 'budgeting'
  | 'behaviour'
  | 'pastoral'
  | 'staff_wellbeing'
  | 'early_warning'
  | 'communications_outbound'
  | 'parent_inquiries'
  | 'engagement'
  | 'website'
  | 'auto_scheduling'
  | 'leave'
  | 'school_closures'
  | 'ai_functions'
  | 'compliance_advanced';

export type ModuleCategory =
  | 'academic'
  | 'finance_ops'
  | 'people_care'
  | 'communications'
  | 'operations'
  | 'compliance';

export interface ModuleDefinition {
  key: ModuleKey;
  display_name: string;
  description: string;
  default_enabled: boolean;
  category: ModuleCategory;
  /**
   * Informational only. We do not auto-disable dependents. The admin console
   * may surface a UI hint, but the admin has the final say.
   */
  depends_on?: ModuleKey[];
}

export const MODULE_REGISTRY: ReadonlyArray<ModuleDefinition> = [
  {
    key: 'admissions',
    display_name: 'Admissions & Applications',
    description: 'Student application intake, processing, and capacity management.',
    default_enabled: true,
    category: 'academic',
    depends_on: ['finance'],
  },
  {
    key: 'gradebook',
    display_name: 'Gradebook & Report Cards',
    description: 'Grade entry, assessment management, report card generation, transcripts.',
    default_enabled: true,
    category: 'academic',
  },
  {
    key: 'homework',
    display_name: 'Homework & Assignments',
    description: 'Set, submit, and track homework; analytics and completion monitoring.',
    default_enabled: true,
    category: 'academic',
  },
  {
    key: 'sen',
    display_name: 'Special Educational Needs',
    description: 'SEN profiles, support plans, professional involvement, resource allocation.',
    default_enabled: false,
    category: 'academic',
  },
  {
    key: 'finance',
    display_name: 'Finance Management',
    description: 'Invoices, payments, discounts, refunds, fee structures, household statements.',
    default_enabled: true,
    category: 'finance_ops',
  },
  {
    key: 'payroll',
    display_name: 'Payroll Management',
    description: 'Salary runs, payslips, compensation, deductions, allowances, payroll reports.',
    default_enabled: true,
    category: 'finance_ops',
  },
  {
    key: 'budgeting',
    display_name: 'Budgeting & Financial Modeling',
    description: 'Financial models, scenarios, line-item variance analysis, board-pack exports.',
    default_enabled: true,
    category: 'finance_ops',
    depends_on: ['finance'],
  },
  {
    key: 'behaviour',
    display_name: 'Behaviour & Conduct',
    description: 'Log incidents, manage sanctions/exclusions, track awards, appeals.',
    default_enabled: true,
    category: 'people_care',
  },
  {
    key: 'pastoral',
    display_name: 'Pastoral Care & Cases',
    description: 'Track concerns, safeguarding cases, interventions, family contacts.',
    default_enabled: true,
    category: 'people_care',
  },
  {
    key: 'staff_wellbeing',
    display_name: 'Staff Wellbeing',
    description: 'Staff workload, surveys, aggregate analytics, support resources.',
    default_enabled: true,
    category: 'people_care',
  },
  {
    key: 'early_warning',
    display_name: 'Early Warning System',
    description: 'Predictive risk scoring across academic, behavioural, and pastoral domains.',
    default_enabled: true,
    category: 'people_care',
    depends_on: ['behaviour', 'pastoral', 'gradebook'],
  },
  {
    key: 'communications_outbound',
    display_name: 'Communications (Outbound)',
    description:
      'SMS, email, WhatsApp dispatch and announcement broadcasts. Inbox conversations remain core.',
    default_enabled: true,
    category: 'communications',
  },
  {
    key: 'parent_inquiries',
    display_name: 'Parent Inquiries',
    description: 'Parent-initiated inquiries about student support and concerns.',
    default_enabled: true,
    category: 'communications',
  },
  {
    key: 'engagement',
    display_name: 'Events & Conferences',
    description: 'School events, parent conferences, engagement forms, consent tracking.',
    default_enabled: true,
    category: 'communications',
  },
  {
    key: 'website',
    display_name: 'Public Website',
    description: 'Public-facing school website pages and contact form management.',
    default_enabled: true,
    category: 'communications',
  },
  {
    key: 'auto_scheduling',
    display_name: 'Automated Timetable Scheduling',
    description: 'Auto-scheduler, exam solver, substitution handling, scheduling analytics.',
    default_enabled: true,
    category: 'operations',
  },
  {
    key: 'leave',
    display_name: 'Staff Leave Management',
    description: 'Leave request workflows, leave types, cover coordination with scheduling.',
    default_enabled: true,
    category: 'operations',
    depends_on: ['payroll', 'auto_scheduling'],
  },
  {
    key: 'school_closures',
    display_name: 'School Closures Management',
    description: 'Manage holiday periods, emergency closures, and non-instructional days.',
    default_enabled: true,
    category: 'operations',
  },
  {
    key: 'ai_functions',
    display_name: 'AI-Powered Features',
    description:
      'AI across reports, behaviour/pastoral analysis, gradebook AI, scheduling AI substitution. Per-surface fine-tuning remains in the AI Settings page.',
    default_enabled: true,
    category: 'operations',
  },
  {
    key: 'compliance_advanced',
    display_name: 'Advanced Compliance & Regulatory Reporting',
    description:
      'DES, TUSLA, PPOD, CBA submissions, advanced retention policies, regulatory calendar. Core GDPR / DSAR / consent remain always-on.',
    default_enabled: false,
    category: 'compliance',
  },
];

export const MODULE_KEYS: ReadonlySet<ModuleKey> = new Set(MODULE_REGISTRY.map((m) => m.key));

export const MODULE_KEYS_ARRAY: ReadonlyArray<ModuleKey> = MODULE_REGISTRY.map((m) => m.key);

/**
 * Lookup a module definition by key. Returns undefined for unknown keys,
 * meaning the key is either core or invalid, and therefore not gateable.
 */
export function getModuleDefinition(key: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.key === key);
}

export function isModuleKey(value: string): value is ModuleKey {
  return MODULE_KEYS.has(value as ModuleKey);
}
