/**
 * Canonical wellbeing-notification event-key list (backend mirror of the
 * shared enum at `@school/shared/wellbeing`).
 *
 * Wave 3 backend services use these keys when calling
 * `WellbeingNotificationsService.dispatch({ event, ... })`. The per-tenant
 * channel preference table keys overrides by exactly these strings.
 *
 * Adding a key is safe; removing a key requires a data migration to drop
 * any persisted overrides that reference it.
 */

export const WELLBEING_EVENT_KEYS = [
  // Behaviour
  'incident.logged',
  'incident.escalated',
  'incident.parent_meeting_scheduled',
  'sanction.scheduled',
  'sanction.served',
  'sanction.no_show',
  'recognition.awarded',
  'amendment.sent',
  'document.sent_to_parent',
  // Pastoral & SST
  'concern.raised',
  'concern.acknowledged',
  // Safeguarding
  'sla.breach',
  'critical.declared',
  'critical.acknowledged',
  'break_glass.granted',
  'break_glass.expired',
  // Behaviour appeal lifecycle
  'appeal.submitted',
  'appeal.decided',
] as const;

export type WellbeingEventKey = (typeof WELLBEING_EVENT_KEYS)[number];
