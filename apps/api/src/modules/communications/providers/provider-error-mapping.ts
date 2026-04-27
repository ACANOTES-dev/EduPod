import { PROVIDER_ERROR_CODES, type ProviderErrorCode } from '@school/shared';

/**
 * Map a Resend HTTP status (and optional message) to a stable, bounded
 * error code suitable for Prometheus labels. Keeps cardinality bounded.
 */
export function mapResendError(
  statusCode: number | null | undefined,
  message?: string,
): ProviderErrorCode {
  const code = typeof statusCode === 'number' ? statusCode : 0;
  if (code === 401 || code === 403) {
    if (message && /domain.*not.*verified|sender.*unverified/i.test(message)) {
      return PROVIDER_ERROR_CODES.RESEND_DOMAIN_UNVERIFIED;
    }
    return PROVIDER_ERROR_CODES.RESEND_INVALID_KEY;
  }
  if (code === 422 && message && /domain/i.test(message)) {
    return PROVIDER_ERROR_CODES.RESEND_DOMAIN_UNVERIFIED;
  }
  if (code === 429) return PROVIDER_ERROR_CODES.RESEND_RATE_LIMITED;
  if (code === 400) return PROVIDER_ERROR_CODES.RESEND_BAD_REQUEST;
  return PROVIDER_ERROR_CODES.RESEND_UNKNOWN;
}

/**
 * Map a Twilio numeric error code to a stable label. Twilio's code surface
 * is large but the codes we typically see are bounded.
 */
export function mapTwilioError(code: number | string | null | undefined): ProviderErrorCode {
  const numeric = typeof code === 'string' ? Number.parseInt(code, 10) : (code ?? 0);
  switch (numeric) {
    case 20003:
      return PROVIDER_ERROR_CODES.TWILIO_AUTH_FAILED;
    case 20429:
      return PROVIDER_ERROR_CODES.TWILIO_RATE_LIMITED;
    case 21201:
      return PROVIDER_ERROR_CODES.TWILIO_BAD_PARAMETER;
    case 21211:
      return PROVIDER_ERROR_CODES.TWILIO_INVALID_NUMBER;
    case 21408:
      return PROVIDER_ERROR_CODES.TWILIO_GEO_PERMISSION;
    case 21610:
      return PROVIDER_ERROR_CODES.TWILIO_NUMBER_BLOCKED;
    case 63016:
      return PROVIDER_ERROR_CODES.TWILIO_WHATSAPP_24H_WINDOW;
    case 63017:
      return PROVIDER_ERROR_CODES.TWILIO_WHATSAPP_NOT_ON_NETWORK;
    default:
      return PROVIDER_ERROR_CODES.TWILIO_UNKNOWN;
  }
}
