import { z } from 'zod';

// ─── Email (Resend) ──────────────────────────────────────────────────────────

export const upsertEmailConfigSchema = z.object({
  resend_api_key: z
    .string()
    .min(1)
    .refine((val) => val.startsWith('re_'), {
      message: 'Resend API key must start with "re_"',
    }),
  from_email: z.string().email('A valid sender email address is required'),
  from_name: z.string().max(255).optional(),
  reply_to_email: z.string().email().optional(),
  webhook_secret: z.string().min(8, 'Webhook secret must be at least 8 characters'),
});

export type UpsertEmailConfigDto = z.infer<typeof upsertEmailConfigSchema>;

// ─── SMS (Twilio) ────────────────────────────────────────────────────────────

const E164_REGEX = /^\+\d{8,16}$/;

export const upsertSmsConfigSchema = z.object({
  twilio_account_sid: z
    .string()
    .min(1)
    .refine((val) => val.startsWith('AC'), {
      message: 'Twilio Account SID must start with "AC"',
    }),
  twilio_auth_token: z.string().min(1, 'Twilio auth token is required'),
  twilio_from_number: z
    .string()
    .regex(E164_REGEX, 'Sender number must be E.164 format (e.g. +14155551234)'),
  webhook_secret: z.string().min(8, 'Webhook secret must be at least 8 characters'),
});

export type UpsertSmsConfigDto = z.infer<typeof upsertSmsConfigSchema>;

// ─── WhatsApp (Twilio Business) ──────────────────────────────────────────────

export const upsertWhatsAppConfigSchema = z.object({
  twilio_account_sid: z
    .string()
    .min(1)
    .refine((val) => val.startsWith('AC'), {
      message: 'Twilio Account SID must start with "AC"',
    }),
  twilio_auth_token: z.string().min(1, 'Twilio auth token is required'),
  twilio_whatsapp_from_number: z
    .string()
    .regex(E164_REGEX, 'WhatsApp sender must be E.164 format (e.g. +14155551234)'),
  business_profile_id: z.string().max(255).optional(),
  webhook_secret: z.string().min(8, 'Webhook secret must be at least 8 characters'),
});

export type UpsertWhatsAppConfigDto = z.infer<typeof upsertWhatsAppConfigSchema>;

// ─── Verification / test-send DTOs (used by Impl 09 wiring) ──────────────────

export const testEmailSchema = z.object({
  recipient_email: z.string().email(),
});
export type TestEmailDto = z.infer<typeof testEmailSchema>;

export const testSmsSchema = z.object({
  recipient_phone: z.string().regex(E164_REGEX, 'E.164 phone number required'),
});
export type TestSmsDto = z.infer<typeof testSmsSchema>;

export const testWhatsAppSchema = z.object({
  recipient_phone: z.string().regex(E164_REGEX, 'E.164 phone number required'),
  // Required because outside a 24h service window only approved templates are allowed.
  template_key: z.string().min(1, 'template_key is required for WhatsApp test sends'),
});
export type TestWhatsAppDto = z.infer<typeof testWhatsAppSchema>;

// ─── Email domain registration (Impl 07) ─────────────────────────────────────

export const registerEmailDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i, {
      message: 'Domain must be a valid hostname (e.g. school.example.org)',
    })
    .transform((s) => s.toLowerCase().trim()),
});
export type RegisterEmailDomainDto = z.infer<typeof registerEmailDomainSchema>;

// ─── WhatsApp template (Impl 08) ─────────────────────────────────────────────

export const submitWhatsAppTemplateSchema = z.object({
  template_key: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9._-]+$/i, 'template_key must be alphanumeric with . _ -'),
  template_name: z.string().min(1).max(128).optional(),
  language_code: z.string().min(2).max(16),
  category: z.enum(['utility', 'authentication', 'marketing']),
  body: z.string().min(1).max(2048),
});
export type SubmitWhatsAppTemplateDto = z.infer<typeof submitWhatsAppTemplateSchema>;

export const listWhatsAppTemplatesQuerySchema = z.object({
  status: z.enum(['pending', 'submitted', 'approved', 'rejected', 'paused']).optional(),
  language_code: z.string().min(2).max(16).optional(),
  template_key: z.string().min(1).max(128).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});
export type ListWhatsAppTemplatesQueryDto = z.infer<typeof listWhatsAppTemplatesQuerySchema>;

// ─── Verify result (Impl 09) ─────────────────────────────────────────────────

/**
 * Returned by the three POST /v1/{email|sms|whatsapp}-config/test endpoints.
 * `success: true` means the provider accepted the request and returned a
 * message id. `success: false` carries the verbatim provider error so the
 * tenant admin can act on it without contacting support.
 */
export interface VerifyResult {
  success: boolean;
  provider_message_id?: string;
  provider_error?: string;
  status_code?: number;
  troubleshooting_hint?: string | null;
  message?: string;
  recipient_mask: string;
}
