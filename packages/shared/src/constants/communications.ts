/**
 * Redis pub/sub channel for cross-process invalidation of per-tenant
 * provider client caches. Both API and worker subscribe.
 *
 * Payload (JSON):
 *   { tenant_id: string, channel: 'email' | 'sms' | 'whatsapp', ts: number }
 */
export const COMMS_CACHE_BUS_CHANNEL = 'comms:config-changed';

/**
 * The three provider-backed channels covered by per-tenant credential
 * isolation. Used as the discriminator on cache bus events and inside
 * the per-tenant client cache.
 */
export const COMMS_PROVIDER_CHANNELS = ['email', 'sms', 'whatsapp'] as const;

export type CommsProviderChannel = (typeof COMMS_PROVIDER_CHANNELS)[number];

/**
 * Cache bus event payload. Keep the shape minimal — anything richer
 * goes through the regular DB read path on cache miss.
 */
export interface CommsCacheBusEvent {
  tenant_id: string;
  channel: CommsProviderChannel;
  ts: number; // Date.now() at publish time
}

/**
 * Bounded vocabulary for `notifications_provider_errors_total{error_code=...}`.
 * Adding new codes is fine; keep them stable so dashboards don't break.
 *
 * - Resend: HTTP statuses we map; everything else maps to `resend.unknown`.
 * - Twilio: official error codes (https://www.twilio.com/docs/api/errors).
 */
export const PROVIDER_ERROR_CODES = {
  RESEND_RATE_LIMITED: 'resend.rate_limited',
  RESEND_INVALID_KEY: 'resend.invalid_key',
  RESEND_BAD_REQUEST: 'resend.bad_request',
  RESEND_DOMAIN_UNVERIFIED: 'resend.domain_unverified',
  RESEND_UNKNOWN: 'resend.unknown',
  TWILIO_INVALID_NUMBER: 'twilio.21211',
  TWILIO_NUMBER_BLOCKED: 'twilio.21610',
  TWILIO_AUTH_FAILED: 'twilio.20003',
  TWILIO_BAD_PARAMETER: 'twilio.21201',
  TWILIO_RATE_LIMITED: 'twilio.20429',
  TWILIO_GEO_PERMISSION: 'twilio.21408',
  TWILIO_WHATSAPP_24H_WINDOW: 'twilio.63016',
  TWILIO_WHATSAPP_NOT_ON_NETWORK: 'twilio.63017',
  TWILIO_UNKNOWN: 'twilio.unknown',
} as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[keyof typeof PROVIDER_ERROR_CODES];
