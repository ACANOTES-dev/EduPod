/**
 * Closed vocabulary for `notification.failure_reason`.
 *
 * Every value the column can take is enumerated here. Untyped freeform
 * strings are not allowed — the union type below enforces this at
 * compile time wherever `markFailed`/`updateNotificationStatus` are called.
 *
 * Owners (impl that defines each reason):
 *   Impl 05 — channel_not_configured, channel_disabled, template_not_found,
 *             recipient_no_email, recipient_no_phone, recipient_no_whatsapp,
 *             provider_error:<verbatim>
 *   Impl 06 — suppressed:hard_bounce | soft_bounce_threshold | complaint
 *           | manual | unsubscribe
 *   Impl 07 — sender_domain_unverified
 *   Impl 08 — outside_service_window_no_template, whatsapp_template_not_approved
 *   Pre-existing — consent_revoked, rate_limited
 */
export const NOTIFICATION_FAILURE_REASONS = {
  CHANNEL_NOT_CONFIGURED: 'channel_not_configured',
  CHANNEL_DISABLED: 'channel_disabled',
  TEMPLATE_NOT_FOUND: 'template_not_found',
  RECIPIENT_NO_EMAIL: 'recipient_no_email',
  RECIPIENT_NO_PHONE: 'recipient_no_phone',
  RECIPIENT_NO_WHATSAPP: 'recipient_no_whatsapp',
} as const;

export type NotificationFailureReasonLiteral =
  (typeof NOTIFICATION_FAILURE_REASONS)[keyof typeof NOTIFICATION_FAILURE_REASONS];

export type NotificationFailureReason =
  | NotificationFailureReasonLiteral
  | `suppressed:${string}`
  | `provider_error:${string}`
  | 'sender_domain_unverified'
  | 'invalid_from_email'
  | 'outside_service_window_no_template'
  | 'whatsapp_template_not_approved'
  | 'template_not_approved_inside_window'
  | 'whatsapp_payload_missing_body_and_template'
  | 'verification_template_not_approved'
  | 'consent_revoked'
  | 'rate_limited';

/**
 * Result shape returned by provider `send()` calls when the dispatch
 * is administratively skipped (no tenant config, channel disabled,
 * suppressed recipient, unverified sender domain, etc.).
 *
 * Distinguished from `{ messageId }` (success) and from a thrown
 * error (transient failure that should retry / backoff).
 */
export interface DispatchSkipResult {
  skipped: true;
  reason: NotificationFailureReason;
}

export type EmailDispatchResult = { messageId: string } | DispatchSkipResult;
export type SmsDispatchResult = { messageSid: string } | DispatchSkipResult;
export type WhatsAppDispatchResult = { messageSid: string } | DispatchSkipResult;

export function isDispatchSkip(
  result: { messageId?: string; messageSid?: string } | DispatchSkipResult,
): result is DispatchSkipResult {
  return 'skipped' in result && result.skipped === true;
}
