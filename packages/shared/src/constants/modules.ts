export const MODULE_KEYS = [
  'admissions',
  'attendance',
  'gradebook',
  'finance',
  'payroll',
  'communications',
  'website',
  'analytics',
  'compliance',
  'parent_inquiries',
  'auto_scheduling',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
