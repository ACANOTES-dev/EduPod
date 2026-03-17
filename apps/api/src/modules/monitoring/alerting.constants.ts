/**
 * Operational alerting rule definitions.
 *
 * These define the alert conditions that should be configured
 * in CloudWatch + Sentry for production monitoring.
 */
export const ALERTING_RULES = {
  STRIPE_WEBHOOK_DELAY: {
    name: 'Stripe webhook delay',
    condition: 'Webhook processing time > 5 minutes',
    severity: 'high',
  },
  DLQ_DEPTH: {
    name: 'Dead-letter queue depth',
    condition: 'DLQ depth > 0 for any queue',
    severity: 'high',
  },
  RLS_VIOLATION: {
    name: 'RLS policy violation',
    condition: 'Any RLS violation attempt detected',
    severity: 'critical',
  },
  PAYROLL_FINALISATION_FAILURE: {
    name: 'Payroll run finalisation failure',
    condition: 'Payroll finalisation job fails',
    severity: 'high',
  },
  SEQUENCE_LOCK_CONTENTION: {
    name: 'Sequence lock contention',
    condition: 'Lock wait > 5 seconds',
    severity: 'medium',
  },
  REDIS_CONNECTION_FAILURE: {
    name: 'Redis connection failure',
    condition: 'Redis connection fails or drops',
    severity: 'critical',
  },
  MEILISEARCH_SYNC_BACKLOG: {
    name: 'Meilisearch sync backlog',
    condition: 'Pending sync items > 1000',
    severity: 'medium',
  },
} as const;
