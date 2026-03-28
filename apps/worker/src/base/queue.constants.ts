export const QUEUE_NAMES = {
  ADMISSIONS: 'admissions',
  ATTENDANCE: 'attendance',
  BEHAVIOUR: 'behaviour',
  COMPLIANCE: 'compliance',
  FINANCE: 'finance',
  GRADEBOOK: 'gradebook',
  IMPORTS: 'imports',
  NOTIFICATIONS: 'notifications',
  PASTORAL: 'pastoral',
  PAYROLL: 'payroll',
  REGULATORY: 'regulatory',
  REPORTS: 'reports',
  SCHEDULING: 'scheduling',
  SEARCH_SYNC: 'search-sync',
  SECURITY: 'security',
  WELLBEING: 'wellbeing',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
