import type { ReadinessDimension } from '@prisma/client';

export const READINESS_DIMENSIONS = [
  'synthetic_journeys',
  'alert_route_health',
  'evidence_freshness',
  'backup_readiness',
  'sentry_intake',
  'queue_canary',
  'deploy_event_freshness',
  'unresolved_critical_incidents',
  'certificate_expiry',
  'external_dependency_status',
] as const satisfies ReadinessDimension[];

export const DEFAULT_READINESS_WEIGHTS: Record<ReadinessDimension, number> = {
  alert_route_health: 20,
  backup_readiness: 15,
  certificate_expiry: 5,
  deploy_event_freshness: 4,
  evidence_freshness: 15,
  external_dependency_status: 4,
  queue_canary: 7,
  sentry_intake: 8,
  synthetic_journeys: 12,
  unresolved_critical_incidents: 10,
};

export const READINESS_DIMENSION_LABELS: Record<ReadinessDimension, string> = {
  alert_route_health: 'Alert route health',
  backup_readiness: 'Backup readiness',
  certificate_expiry: 'Certificate expiry',
  deploy_event_freshness: 'Deploy event freshness',
  evidence_freshness: 'Evidence freshness',
  external_dependency_status: 'External dependency status',
  queue_canary: 'Queue canary',
  sentry_intake: 'Sentry intake',
  synthetic_journeys: 'Synthetic journeys',
  unresolved_critical_incidents: 'Unresolved critical incidents',
};
