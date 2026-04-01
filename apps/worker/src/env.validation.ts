import { z } from 'zod';

const workerEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  WORKER_PORT: z.coerce.number().default(5556),
  WORKER_SHUTDOWN_GRACE_MS: z.coerce.number().int().nonnegative().default(30000),

  MEILISEARCH_URL: z.string().optional(),
  MEILISEARCH_API_KEY: z.string().optional(),

  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().default('noreply@edupod.app'),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  TWILIO_SMS_FROM: z.string().optional(),

  SENTRY_DSN_BACKEND: z.string().optional(),
});

export type WorkerEnvConfig = z.infer<typeof workerEnvSchema>;

export function envValidation(config: Record<string, unknown>): WorkerEnvConfig {
  const result = workerEnvSchema.safeParse(config);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
    throw new Error(`Worker environment validation failed:\n${errors.join('\n')}`);
  }

  return result.data;
}

export function validateEnv(): void {
  const result = workerEnvSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `  • ${e.path.join('.')}: ${e.message}`);

    console.error('');
    console.error(
      '✗ Worker environment validation failed — the following variables are missing or invalid:',
    );
    console.error('');
    for (const line of errors) {
      console.error(line);
    }
    console.error('');
    console.error('Fix the worker environment and restart the process.');
    console.error('');
    process.exit(1);
  }
}
