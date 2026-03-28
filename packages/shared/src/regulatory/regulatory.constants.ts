// ─── Tusla Thresholds ───────────────────────────────────────────────────────

export const TUSLA_DEFAULT_THRESHOLD_DAYS = 20;

export const TUSLA_SAR_PERIODS = [
  { period: 1, label: 'Period 1 (Sep–Dec)', start_month: 9, end_month: 12 },
  { period: 2, label: 'Period 2 (Jan–Jun)', start_month: 1, end_month: 6 },
] as const;

// ─── Regulatory Domains ─────────────────────────────────────────────────────

export const REGULATORY_DOMAINS = {
  tusla_attendance: { label: 'Tusla Attendance', description: 'Educational Welfare — student absence monitoring' },
  des_september_returns: { label: 'DES September Returns', description: 'Annual school data returns to Department of Education' },
  des_october_census: { label: 'DES October Census', description: 'October student headcount for teacher allocation' },
  ppod_sync: { label: 'P-POD Sync', description: 'Post-Primary Online Database synchronisation' },
  pod_sync: { label: 'POD Sync', description: 'Primary Online Database synchronisation' },
  child_safeguarding: { label: 'Child Safeguarding', description: 'Child safeguarding statement and risk assessment' },
  anti_bullying: { label: 'Anti-Bullying', description: 'B\u00ed Cine\u00e1lta anti-bullying compliance' },
  fssu_financial: { label: 'FSSU Financial', description: 'Financial Support Services Unit compliance' },
  inspectorate_wse: { label: 'Inspectorate WSE', description: 'Whole-School Evaluation readiness' },
  sen_provision: { label: 'SEN Provision', description: 'Special education needs provision tracking' },
  gdpr_compliance: { label: 'GDPR Compliance', description: 'Data protection regulation compliance' },
  seai_energy: { label: 'SEAI Energy', description: 'Energy reporting for public bodies' },
  admissions_compliance: { label: 'Admissions Compliance', description: 'Admissions Act 2018 compliance' },
  board_governance: { label: 'Board Governance', description: 'Board of Management governance requirements' },
} as const;

// ─── Default Calendar Events ────────────────────────────────────────────────

export const DEFAULT_CALENDAR_EVENTS = [
  { domain: 'des_september_returns', title: 'DES September Returns Deadline', month: 10, day: 1, event_type: 'hard_deadline', reminder_days: [30, 14, 7, 1] },
  { domain: 'des_october_census', title: 'October Returns / Census', month: 10, day: 31, event_type: 'hard_deadline', reminder_days: [30, 14, 7] },
  { domain: 'tusla_attendance', title: 'Tusla SAR Period 1 Deadline', month: 2, day: 1, event_type: 'hard_deadline', reminder_days: [30, 14, 7, 1] },
  { domain: 'tusla_attendance', title: 'Tusla SAR Period 2 Deadline', month: 9, day: 1, event_type: 'hard_deadline', reminder_days: [30, 14, 7, 1] },
  { domain: 'tusla_attendance', title: 'Tusla AAR Deadline', month: 10, day: 31, event_type: 'hard_deadline', reminder_days: [30, 14, 7, 1] },
  { domain: 'ppod_sync', title: 'PPOD Enrolment Data Sync Window', month: 9, day: 15, event_type: 'preparation', reminder_days: [14, 7] },
  { domain: 'anti_bullying', title: 'Anti-Bullying Annual Review', month: 3, day: 1, event_type: 'soft_deadline', reminder_days: [30, 14] },
  { domain: 'child_safeguarding', title: 'Child Safeguarding Statement Review', month: 9, day: 1, event_type: 'soft_deadline', reminder_days: [30, 14] },
  { domain: 'board_governance', title: 'Board Annual Report Deadline', month: 12, day: 1, event_type: 'soft_deadline', reminder_days: [30, 14, 7] },
] as const;

// ─── DES Subject Codes ──────────────────────────────────────────────────────

export const DES_SUBJECT_CODES = [
  { code: '001', name: 'Irish', level: 'Leaving Certificate' },
  { code: '002', name: 'English', level: 'Leaving Certificate' },
  { code: '003', name: 'Mathematics', level: 'Leaving Certificate' },
  { code: '009', name: 'French', level: 'Leaving Certificate' },
  { code: '010', name: 'German', level: 'Leaving Certificate' },
  { code: '035', name: 'Biology', level: 'Leaving Certificate' },
  { code: '036', name: 'Chemistry', level: 'Leaving Certificate' },
  { code: '037', name: 'Physics', level: 'Leaving Certificate' },
  { code: '041', name: 'Geography', level: 'Leaving Certificate' },
  { code: '042', name: 'History', level: 'Leaving Certificate' },
  { code: '049', name: 'Accounting', level: 'Leaving Certificate' },
  { code: '050', name: 'Business', level: 'Leaving Certificate' },
  { code: '069', name: 'Home Economics', level: 'Leaving Certificate' },
  { code: '218', name: 'Applied Mathematics', level: 'Leaving Certificate' },
] as const;

// ─── PPOD Early Leaving Reasons ─────────────────────────────────────────────

export const PPOD_EARLY_LEAVING_REASONS = [
  { code: '01', description: 'Another 2nd Level School in the State' },
  { code: '02', description: 'Further Education' },
  { code: '03', description: 'Employment' },
  { code: '04', description: 'Left the State' },
  { code: '05', description: 'Unknown' },
  { code: '06', description: 'PLC Course' },
  { code: '07', description: 'Apprenticeship' },
  { code: '08', description: 'Youthreach/CTC' },
  { code: '09', description: 'Home Education' },
  { code: '10', description: 'Deceased' },
  { code: '99', description: 'Other' },
] as const;

// ─── CBA Grade Descriptors ─────────────────────────────────────────────────

export const CBA_GRADE_DESCRIPTORS = [
  { grade: 'Exceptional', code: 'E', order: 1 },
  { grade: 'Above Expectations', code: 'AE', order: 2 },
  { grade: 'In Line with Expectations', code: 'ILE', order: 3 },
  { grade: 'Yet to Meet Expectations', code: 'YME', order: 4 },
] as const;

// ─── Anti-Bullying Categories ───────────────────────────────────────────────

export const ANTI_BULLYING_CATEGORIES = [
  'cyberbullying',
  'identity_based',
  'racist',
  'sexist',
  'sexual_harassment',
  'homophobic',
  'transphobic',
  'disability_based',
  'religious_based',
  'physical',
  'verbal',
  'relational',
  'other',
] as const;

// ─── October Returns Fields ─────────────────────────────────────────────────

export const OCTOBER_RETURNS_FIELDS = [
  { field: 'student_count', label: 'Total Student Count', required: true },
  { field: 'gender_breakdown', label: 'Gender Breakdown', required: true },
  { field: 'nationality_breakdown', label: 'Nationality Breakdown', required: true },
  { field: 'year_group_enrolment', label: 'Year Group Enrolment', required: true },
  { field: 'sen_students', label: 'SEN Students', required: false },
  { field: 'traveller_students', label: 'Traveller Students', required: false },
  { field: 'eal_students', label: 'EAL Students', required: false },
  { field: 'new_entrants', label: 'New Entrants', required: true },
  { field: 'repeat_students', label: 'Repeat Students', required: false },
] as const;

// ─── DES File Types ─────────────────────────────────────────────────────────

export const DES_FILE_TYPES = ['file_a', 'file_b', 'file_c', 'file_d', 'file_e', 'form_tl'] as const;
export type DesFileType = (typeof DES_FILE_TYPES)[number];
