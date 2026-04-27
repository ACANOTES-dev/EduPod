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
