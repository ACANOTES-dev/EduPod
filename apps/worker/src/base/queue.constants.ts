export const QUEUE_NAMES = {
  ADMISSIONS: 'admissions',
  BEHAVIOUR: 'behaviour',
  PAYROLL: 'payroll',
  NOTIFICATIONS: 'notifications',
  PASTORAL: 'pastoral',
  SEARCH_SYNC: 'search-sync',
  REPORTS: 'reports',
  ATTENDANCE: 'attendance',
  SCHEDULING: 'scheduling',
  GRADEBOOK: 'gradebook',
  FINANCE: 'finance',
  IMPORTS: 'imports',
  WELLBEING: 'wellbeing',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
