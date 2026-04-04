import { z } from 'zod';

const envSchema = z
  .object({
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
    PGBOUNCER_ADMIN_URL: z.string().url().optional(),
    WORKER_HEALTH_URL: z.string().url().optional(),

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

    // Optional -- Loki log aggregation
    LOKI_PUSH_URL: z.string().url().optional(),
    LOKI_ENVIRONMENT: z.string().optional(),
    LOKI_SERVICE_LABEL: z.string().optional(),

    // Optional -- Platform
    PLATFORM_DOMAIN: z.string().default('edupod.app'),
    MFA_ISSUER: z.string().default('SchoolOS'),
  })
  .superRefine((data, ctx) => {
    if (
      data.NODE_ENV === 'production' &&
      (!data.ENCRYPTION_KEY || data.ENCRYPTION_KEY.length < 64)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ENCRYPTION_KEY must be at least 64 characters in production',
        path: ['ENCRYPTION_KEY'],
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Called by NestJS ConfigModule.forRoot({ validate }) during bootstrap.
 * Throws a descriptive Error on failure so NestJS surfaces it clearly.
 */
export function envValidation(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }
  return result.data;
}

// ─── Pre-bootstrap validation ─────────────────────────────────────────────────

/**
 * Validates process.env BEFORE NestJS bootstraps.
 * Logs every failing variable and calls process.exit(1) so the app never
 * starts in a misconfigured state.
 */
export function validateEnv(): void {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `  • ${e.path.join('.')}: ${e.message}`);
    console.error('');
    console.error(
      '✗ Environment validation failed — the following variables are missing or invalid:',
    );
    console.error('');
    for (const line of errors) {
      console.error(line);
    }
    console.error('');
    console.error('Fix the issues above in your .env file, then restart the server.');
    console.error('');
    process.exit(1);
  }
}
