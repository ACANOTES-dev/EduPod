// Security incident severity levels
export const SECURITY_INCIDENT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type SecurityIncidentSeverity = (typeof SECURITY_INCIDENT_SEVERITIES)[number];

// Security incident types (what kind of anomaly was detected)
export const SECURITY_INCIDENT_TYPES = [
  'rls_violation',
  'unusual_access',
  'auth_spike',
  'cross_tenant_attempt',
  'data_exfiltration',
  'brute_force',
  'permission_probe',
  'off_hours_bulk_access',
  'data_export_spike',
  'manual',
] as const;
export type SecurityIncidentType = (typeof SECURITY_INCIDENT_TYPES)[number];

// Security incident lifecycle statuses
export const SECURITY_INCIDENT_STATUSES = [
  'detected',
  'investigating',
  'contained',
  'reported',
  'resolved',
  'closed',
] as const;
export type SecurityIncidentStatus = (typeof SECURITY_INCIDENT_STATUSES)[number];

// Valid status transitions (state machine)
export const SECURITY_INCIDENT_STATUS_TRANSITIONS: Record<SecurityIncidentStatus, readonly SecurityIncidentStatus[]> = {
  detected: ['investigating', 'contained'],
  investigating: ['contained', 'resolved'],
  contained: ['reported', 'resolved'],
  reported: ['resolved'],
  resolved: ['closed'],
  closed: [],
};

// Timeline event types
export const SECURITY_INCIDENT_EVENT_TYPES = [
  'note',
  'status_change',
  'escalation',
  'notification',
  'containment',
  'evidence',
] as const;
export type SecurityIncidentEventType = (typeof SECURITY_INCIDENT_EVENT_TYPES)[number];

// Data categories that can be affected in a breach
export const BREACH_DATA_CATEGORIES = [
  'personal_data',
  'special_category',
  'financial',
  'health',
  'educational',
  'behavioural',
  'safeguarding',
] as const;
export type BreachDataCategory = (typeof BREACH_DATA_CATEGORIES)[number];
