export const QUEUE_NAMES = {
  ADMISSIONS: 'admissions',
  BEHAVIOUR: 'behaviour',
  PAYROLL: 'payroll',
  NOTIFICATIONS: 'notifications',
  SEARCH_SYNC: 'search-sync',
  REPORTS: 'reports',
  ATTENDANCE: 'attendance',
  SCHEDULING: 'scheduling',
  GRADEBOOK: 'gradebook',
  FINANCE: 'finance',
  IMPORTS: 'imports',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
