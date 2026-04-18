export const QUEUE_NAMES = {
  ADMISSIONS: 'admissions',
  APPROVALS: 'approvals',
  ATTENDANCE: 'attendance',
  AUDIT_LOG: 'audit-log',
  BEHAVIOUR: 'behaviour',
  COMPLIANCE: 'compliance',
  EARLY_WARNING: 'early-warning',
  ENGAGEMENT: 'engagement',
  FINANCE: 'finance',
  GRADEBOOK: 'gradebook',
  HOMEWORK: 'homework',
  IMPORTS: 'imports',
  NOTIFICATIONS: 'notifications',
  PASTORAL: 'pastoral',
  PAYROLL: 'payroll',
  PDF_RENDERING: 'pdf-rendering',
  REGULATORY: 'regulatory',
  REPORTS: 'reports',
  SAFEGUARDING: 'safeguarding',
  SCHEDULING: 'scheduling',
  EXAM_SCHEDULING: 'exam-scheduling',
  SEARCH_SYNC: 'search-sync',
  SECURITY: 'security',
  WELLBEING: 'wellbeing',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Canary monitoring ──────────────────────────────────────────────────────

export const CANARY_PING_JOB = 'monitoring:canary-ping';
export const CANARY_ECHO_JOB = 'monitoring:canary-echo';
export const CANARY_CHECK_JOB = 'monitoring:canary-check';

/**
 * Critical queues monitored by canary jobs.
 * Key: queue name. Value: SLA in milliseconds — max acceptable time for
 * the echo job to complete after enqueue. Alert fires if exceeded.
 */
export const CANARY_CRITICAL_QUEUES: Record<string, number> = {
  [QUEUE_NAMES.NOTIFICATIONS]: 2 * 60_000,
  [QUEUE_NAMES.BEHAVIOUR]: 3 * 60_000,
  [QUEUE_NAMES.SECURITY]: 3 * 60_000,
  [QUEUE_NAMES.PASTORAL]: 3 * 60_000,
  [QUEUE_NAMES.PAYROLL]: 5 * 60_000,
  [QUEUE_NAMES.APPROVALS]: 5 * 60_000,
  [QUEUE_NAMES.FINANCE]: 5 * 60_000,
  [QUEUE_NAMES.COMPLIANCE]: 5 * 60_000,
  [QUEUE_NAMES.SCHEDULING]: 5 * 60_000,
  [QUEUE_NAMES.ATTENDANCE]: 5 * 60_000,
};
