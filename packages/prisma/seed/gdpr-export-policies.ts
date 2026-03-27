/**
 * GDPR export policy definitions for the School Operating System.
 * Seeded once — defines which outbound data flows are tokenised.
 */

export interface GdprExportPolicySeed {
  export_type: string;
  tokenisation: 'always' | 'never' | 'configurable';
  lawful_basis: string;
  description: string;
}

export const GDPR_EXPORT_POLICY_SEEDS: GdprExportPolicySeed[] = [
  // ─── Always tokenise — AI services ─────────────────────────────────────────
  {
    export_type: 'ai_comments',
    tokenisation: 'always',
    lawful_basis: 'legitimate_interest',
    description: 'AI-generated student report card comments',
  },
  {
    export_type: 'ai_grading',
    tokenisation: 'always',
    lawful_basis: 'legitimate_interest',
    description: 'AI-assisted inline grading from scanned work',
  },
  {
    export_type: 'ai_grading_batch',
    tokenisation: 'always',
    lawful_basis: 'legitimate_interest',
    description: 'AI-assisted batch grading with teacher instructions',
  },
  {
    export_type: 'ai_progress_summary',
    tokenisation: 'always',
    lawful_basis: 'legitimate_interest',
    description: 'AI-generated student progress summaries',
  },
  {
    export_type: 'ai_nl_query',
    tokenisation: 'always',
    lawful_basis: 'legitimate_interest',
    description: 'Natural language gradebook queries via AI',
  },
  {
    export_type: 'ai_report_narrator',
    tokenisation: 'always',
    lawful_basis: 'legitimate_interest',
    description: 'AI-generated report data narratives',
  },
  {
    export_type: 'ai_predictions',
    tokenisation: 'always',
    lawful_basis: 'legitimate_interest',
    description: 'AI trend predictions from historical data',
  },
  {
    export_type: 'ai_substitution',
    tokenisation: 'always',
    lawful_basis: 'legitimate_interest',
    description: 'AI-ranked substitute teacher recommendations',
  },
  {
    export_type: 'ai_attendance_scan',
    tokenisation: 'always',
    lawful_basis: 'legitimate_interest',
    description: 'AI OCR processing of attendance sheets',
  },
  {
    export_type: 'ai_behaviour_query',
    tokenisation: 'always',
    lawful_basis: 'legitimate_interest',
    description: 'AI-powered behaviour data natural language queries',
  },
  {
    export_type: 'ai_template_conversion',
    tokenisation: 'always',
    lawful_basis: 'legitimate_interest',
    description: 'AI conversion of report card template images',
  },

  // ─── Never tokenise — DSAR + regulatory ────────────────────────────────────
  {
    export_type: 'dsar_access_export',
    tokenisation: 'never',
    lawful_basis: 'data_subject_rights',
    description: 'Data Subject Access Request — full data export',
  },
  {
    export_type: 'dsar_portability',
    tokenisation: 'never',
    lawful_basis: 'data_subject_rights',
    description: 'Data portability request — machine-readable export',
  },
  {
    export_type: 'compliance_rectification',
    tokenisation: 'never',
    lawful_basis: 'data_subject_rights',
    description: 'Data rectification — correction of personal data',
  },
  {
    export_type: 'regulatory_tusla',
    tokenisation: 'never',
    lawful_basis: 'legal_obligation',
    description: 'Tusla (Irish child protection) mandatory reporting',
  },
  {
    export_type: 'regulatory_dept_ed',
    tokenisation: 'never',
    lawful_basis: 'legal_obligation',
    description: 'Department of Education statutory returns',
  },
  {
    export_type: 'regulatory_revenue',
    tokenisation: 'never',
    lawful_basis: 'legal_obligation',
    description: 'Revenue Commissioners payroll reporting',
  },

  // ─── Configurable — exports ─────────────────────────────────────────────────
  {
    export_type: 'custom_report_export',
    tokenisation: 'configurable',
    lawful_basis: 'legitimate_interest',
    description: 'Custom report exports with student/staff data',
  },
  {
    export_type: 'board_report_export',
    tokenisation: 'configurable',
    lawful_basis: 'legitimate_interest',
    description: 'Board of management report generation',
  },
  {
    export_type: 'student_export_pack',
    tokenisation: 'configurable',
    lawful_basis: 'consent',
    description: 'Student data export pack for parents or transfers',
  },
  {
    export_type: 'staff_export',
    tokenisation: 'configurable',
    lawful_basis: 'legitimate_interest',
    description: 'Staff data exports for HR or compliance',
  },
  {
    export_type: 'parent_data_pack',
    tokenisation: 'configurable',
    lawful_basis: 'consent',
    description: 'Parent/guardian data pack export',
  },
];
