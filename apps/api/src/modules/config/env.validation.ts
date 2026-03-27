import { z } from 'zod';

const envSchema = z.object({
  // Required
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_URL: z.string().url().default('http://localhost:5552'),
  APP_URL: z.string().url().default('http://localhost:5551'),
  API_PORT: z.coerce.number().default(5552),

  // Optional -- S3-compatible object storage (Hetzner, AWS, MinIO, etc.)
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),

  // Optional -- Email (Resend)
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().default('noreply@edupod.app'),

  // Optional -- Sentry
  SENTRY_DSN_BACKEND: z.string().optional(),

  // Optional -- Encryption
  ENCRYPTION_KEY: z.string().optional(),

  // Optional -- Webhook secrets
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  TWILIO_SMS_FROM: z.string().optional(),

  // Optional -- Meilisearch
  MEILISEARCH_URL: z.string().optional(),
  MEILISEARCH_API_KEY: z.string().optional(),

  // Optional -- Platform
  PLATFORM_DOMAIN: z.string().default('edupod.app'),
  MFA_ISSUER: z.string().default('SchoolOS'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function envValidation(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }
  return result.data;
}
