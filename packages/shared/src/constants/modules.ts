export const MODULE_KEYS = [
  'admissions',
  'attendance',
  'gradebook',
  'homework',
  'sen',
  'finance',
  'payroll',
  'communications',
  'website',
  'analytics',
  'compliance',
  'early_warning',
  'parent_inquiries',
  'auto_scheduling',
  'ai_functions',
  'behaviour',
  'staff_wellbeing',
  'engagement',
  'pastoral',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
