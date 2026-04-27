// Masked + decrypted shapes for the three tenant communication credentials.
//
// The Masked* shapes are returned by the controllers — sensitive values are
// truncated to a `••••<last4>` mask.
// The Decrypted* shapes are SERVICE-INTERNAL ONLY — never returned by a
// controller, never logged, never serialised. Consumed by the dispatch layer
// (Impl 04) to construct provider clients per tenant.

export interface MaskedEmailConfig {
  id: string;
  tenant_id: string;
  // Sensitive — masked
  resend_api_key_mask: string;
  webhook_secret_mask: string;
  // Non-sensitive — returned in full
  from_email: string;
  from_name: string | null;
  reply_to_email: string | null;
  // Encryption metadata
  encryption_key_ref: string;
  key_last_rotated_at: Date | null;
  // Lifecycle
  is_enabled: boolean;
  last_verified_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MaskedSmsConfig {
  id: string;
  tenant_id: string;
  // Sensitive — masked
  twilio_account_sid_mask: string;
  twilio_auth_token_mask: string;
  webhook_secret_mask: string;
  // Non-sensitive
  twilio_from_number: string;
  // Encryption metadata
  encryption_key_ref: string;
  key_last_rotated_at: Date | null;
  // Lifecycle
  is_enabled: boolean;
  last_verified_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MaskedWhatsAppConfig {
  id: string;
  tenant_id: string;
  // Sensitive
  twilio_account_sid_mask: string;
  twilio_auth_token_mask: string;
  webhook_secret_mask: string;
  // Non-sensitive
  twilio_whatsapp_from_number: string;
  business_profile_id: string | null;
  // Encryption metadata
  encryption_key_ref: string;
  key_last_rotated_at: Date | null;
  // Lifecycle
  is_enabled: boolean;
  last_verified_at: Date | null;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

// ─── Internal-only — never surfaced via controller ───────────────────────────
// Consumed by NotificationDispatchService in Impl 04.

export interface DecryptedEmailConfig {
  id: string;
  tenant_id: string;
  resend_api_key: string;
  from_email: string;
  from_name: string | null;
  reply_to_email: string | null;
  webhook_secret: string;
  is_enabled: boolean;
  encryption_key_ref: string;
}

export interface DecryptedSmsConfig {
  id: string;
  tenant_id: string;
  twilio_account_sid: string;
  twilio_auth_token: string;
  twilio_from_number: string;
  webhook_secret: string;
  is_enabled: boolean;
  encryption_key_ref: string;
}

export interface DecryptedWhatsAppConfig {
  id: string;
  tenant_id: string;
  twilio_account_sid: string;
  twilio_auth_token: string;
  twilio_whatsapp_from_number: string;
  business_profile_id: string | null;
  webhook_secret: string;
  is_enabled: boolean;
  encryption_key_ref: string;
}
