// ─── State Machine Transitions ────────────────────────────────────────────────

export const EVENT_VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['published', 'cancelled'],
  published: ['open', 'cancelled'],
  open: ['closed', 'cancelled'],
  closed: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: [],
};

export const SUBMISSION_VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['submitted', 'expired'],
  submitted: ['acknowledged', 'revoked'],
  acknowledged: ['revoked'],
  expired: [],
  revoked: [],
};

export const SLOT_VALID_TRANSITIONS: Record<string, string[]> = {
  available: ['booked', 'blocked'],
  booked: ['completed', 'cancelled'],
  blocked: ['available'],
  completed: [],
  cancelled: ['available'],
};

export const BOOKING_VALID_TRANSITIONS: Record<string, string[]> = {
  confirmed: ['completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
};

// ─── Permission Keys ──────────────────────────────────────────────────────────

export const ENGAGEMENT_PERMISSIONS = {
  FORM_TEMPLATES_VIEW: 'engagement.form_templates.view',
  FORM_TEMPLATES_CREATE: 'engagement.form_templates.create',
  FORM_TEMPLATES_EDIT: 'engagement.form_templates.edit',
  FORM_TEMPLATES_DELETE: 'engagement.form_templates.delete',
  FORM_TEMPLATES_PUBLISH: 'engagement.form_templates.publish',
  EVENTS_VIEW: 'engagement.events.view',
  EVENTS_CREATE: 'engagement.events.create',
  EVENTS_EDIT: 'engagement.events.edit',
  EVENTS_PUBLISH: 'engagement.events.publish',
  EVENTS_CANCEL: 'engagement.events.cancel',
  EVENTS_VIEW_DASHBOARD: 'engagement.events.view_dashboard',
  RISK_ASSESSMENT_APPROVE: 'engagement.risk_assessment.approve',
  TRIP_PACK_GENERATE: 'engagement.trip_pack.generate',
  TRIP_PACK_DOWNLOAD: 'engagement.trip_pack.download',
  CONFERENCES_MANAGE: 'engagement.conferences.manage',
  CONFERENCES_VIEW_SCHEDULE: 'engagement.conferences.view_schedule',
  CONSENT_ARCHIVE_VIEW: 'engagement.consent_archive.view',
  INCIDENTS_CREATE: 'engagement.incidents.create',
  INCIDENTS_VIEW: 'engagement.incidents.view',
} as const;
