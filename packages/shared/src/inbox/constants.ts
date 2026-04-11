/**
 * Inbox / messaging constants — shared between frontend, API, worker.
 */

export const CONVERSATION_KINDS = ['direct', 'group', 'broadcast'] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export const MESSAGING_ROLES = [
  'owner',
  'principal',
  'vice_principal',
  'office',
  'finance',
  'nurse',
  'teacher',
  'parent',
  'student',
] as const;
export type MessagingRole = (typeof MESSAGING_ROLES)[number];

export const SAVED_AUDIENCE_KINDS = ['static', 'dynamic'] as const;
export type SavedAudienceKind = (typeof SAVED_AUDIENCE_KINDS)[number];

export const MESSAGE_FLAG_SEVERITIES = ['low', 'medium', 'high'] as const;
export type MessageFlagSeverity = (typeof MESSAGE_FLAG_SEVERITIES)[number];

export const MESSAGE_FLAG_REVIEW_STATES = ['pending', 'dismissed', 'escalated', 'frozen'] as const;
export type MessageFlagReviewState = (typeof MESSAGE_FLAG_REVIEW_STATES)[number];

export const OVERSIGHT_ACTIONS = [
  'read_thread',
  'search',
  'freeze',
  'unfreeze',
  'dismiss_flag',
  'escalate_flag',
  'export_thread',
] as const;
export type OversightAction = (typeof OVERSIGHT_ACTIONS)[number];

export const INBOX_CHANNELS = ['inbox', 'email', 'sms', 'whatsapp'] as const;
export type InboxChannel = (typeof INBOX_CHANNELS)[number];

export const SAFEGUARDING_CATEGORIES = [
  'bullying',
  'self_harm',
  'abuse',
  'inappropriate_contact',
  'weapons',
  'other',
] as const;
export type SafeguardingCategory = (typeof SAFEGUARDING_CATEGORIES)[number];

/** Max participants for a `group` conversation. */
export const GROUP_CONVERSATION_MAX_PARTICIPANTS = 50;

/** Default edit window for messages (minutes). Per-tenant overridable. */
export const DEFAULT_EDIT_WINDOW_MINUTES = 10;

/** Default fallback SLAs. */
export const DEFAULT_FALLBACK_ADMIN_AFTER_HOURS = 24;
export const DEFAULT_FALLBACK_TEACHER_AFTER_HOURS = 3;
